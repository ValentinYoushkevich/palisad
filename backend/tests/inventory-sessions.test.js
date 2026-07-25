import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@/config/knex.js';
import * as inventoryRepo from '@/repositories/inventorySession.repository.js';

import { api, createFullFixture } from './helpers.js';

describe('Инвентаризация — сессии (Э2: POST/GET)', () => {
  let ctx;

  async function makeLocation(name, type = 'area', parentId = null, nurseryId = ctx.nurseryId) {
    const [loc] = await db('locations')
      .insert({ nursery_id: nurseryId, name, type, parent_id: parentId })
      .returning('*');
    return loc;
  }

  async function makeSpecies(displayName, nurseryId = ctx.nurseryId) {
    const [catalog] = await db('species_catalog')
      .insert({
        gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
        scientific_name: `Sci ${randomUUID()}`,
      })
      .returning('*');
    const [species] = await db('nursery_species')
      .insert({ nursery_id: nurseryId, species_catalog_id: catalog.id, display_name_ru: displayName })
      .returning('*');
    return { species, catalog };
  }

  async function makePlant(overrides = {}) {
    const [plant] = await db('plants')
      .insert({
        nursery_id: ctx.nurseryId,
        qr_code: `qr-${randomUUID()}`,
        numeric_code: `nc-${randomUUID()}`,
        status: 'growing',
        ...overrides,
      })
      .returning('*');
    return plant;
  }

  function systemStage(slug) {
    return db('production_stages').where({ slug, is_system: true }).first();
  }

  function sessionBody(overrides = {}) {
    return {
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:05:00.000Z',
      clientRequestId: randomUUID(),
      scans: [],
      ...overrides,
    };
  }

  function postSession(body, cookie = ctx.worker.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .post(`/api/nurseries/${nurseryId}/inventory-sessions`)
      .set('Cookie', cookie)
      .send(body);
  }

  function getList(query = '', cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    const suffix = query ? `?${query}` : '';
    return api()
      .get(`/api/nurseries/${nurseryId}/inventory-sessions${suffix}`)
      .set('Cookie', cookie);
  }

  function getDetail(id, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/inventory-sessions/${id}`)
      .set('Cookie', cookie);
  }

  async function insertSession(overrides = {}) {
    const [row] = await db('inventory_sessions')
      .insert({
        nursery_id: ctx.nurseryId,
        user_id: ctx.owner.id,
        started_at: '2026-07-25T09:00:00.000Z',
        completed_at: '2026-07-25T10:00:00.000Z',
        matched_count: 0,
        missing_count: 0,
        foreign_count: 0,
        unknown_count: 0,
        ...overrides,
      })
      .returning('*');
    return row;
  }

  function countItems(sessionId) {
    return db('inventory_items')
      .where({ session_id: sessionId })
      .count('id as c')
      .then((rows) => Number(rows[0].c));
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  describe('POST — сверка', () => {
    it('worker → 201; категории matched/missing/foreign/unknown корректны end-to-end', async () => {
      const area = await makeLocation('Участок 1', 'area');
      const section = await makeLocation('Секция A', 'section', area.id);
      await makeLocation('Ряд 3', 'row', section.id); // строим дерево area→section→row
      const otherSection = await makeLocation('Секция B', 'section', area.id);
      const { species, catalog } = await makeSpecies('Абрикос');
      const stage = await systemStage('container');

      const matchedPlant = await makePlant({ location_id: section.id, nursery_species_id: species.id });
      const missingPlant = await makePlant({ location_id: section.id });
      const foreignPlant = await makePlant({
        location_id: otherSection.id,
        nursery_species_id: species.id,
        stage_id: stage.id,
      });

      const res = await postSession(
        sessionBody({
          locationId: section.id,
          scans: [
            { code: matchedPlant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' },
            { code: foreignPlant.qr_code, scannedAt: '2026-07-25T10:02:00.000Z' },
            { code: 'ghost-code-xyz', scannedAt: '2026-07-25T10:03:00.000Z' },
          ],
        })
      );

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.locationId).toBe(section.id);
      expect(res.body.locationName).toBe('Секция A');
      expect(res.body.counts).toEqual({ matched: 1, missing: 1, foreign: 1, unknown: 1 });

      // matched не отдаётся строкой — только счётчиком; matchedPlant не встречается в items
      expect(res.body.items).not.toHaveProperty('matched');
      const listedPlantIds = [...res.body.items.missing, ...res.body.items.foreign].map((i) => i.plantId);
      expect(listedPlantIds).not.toContain(matchedPlant.id);

      // missing
      expect(res.body.items.missing).toHaveLength(1);
      expect(res.body.items.missing[0]).toMatchObject({
        plantId: missingPlant.id,
        qrCode: missingPlant.qr_code,
        currentLocationName: 'Секция A',
        appliedMovementId: null,
      });

      // foreign — подписи растения + сам скан
      expect(res.body.items.foreign).toHaveLength(1);
      expect(res.body.items.foreign[0]).toMatchObject({
        plantId: foreignPlant.id,
        qrCode: foreignPlant.qr_code,
        rawCode: foreignPlant.qr_code,
        speciesName: 'Абрикос',
        scientificName: catalog.scientific_name,
        stageName: stage.name,
        currentLocationName: 'Секция B',
        appliedMovementId: null,
      });
      expect(new Date(res.body.items.foreign[0].scannedAt).toISOString()).toBe('2026-07-25T10:02:00.000Z');

      // unknown
      expect(res.body.items.unknown).toHaveLength(1);
      expect(res.body.items.unknown[0]).toMatchObject({ rawCode: 'ghost-code-xyz' });
      expect(res.body.items.unknown[0]).not.toHaveProperty('plantId');
      expect(new Date(res.body.items.unknown[0].scannedAt).toISOString()).toBe('2026-07-25T10:03:00.000Z');
    });

    it('глубокое поддерево: растение в ряду под отсканированной секцией → matched', async () => {
      const area = await makeLocation('Участок 1', 'area');
      const section = await makeLocation('Секция A', 'section', area.id);
      const row = await makeLocation('Ряд 3', 'row', section.id);
      const deepPlant = await makePlant({ location_id: row.id });

      const res = await postSession(
        sessionBody({
          locationId: section.id,
          scans: [{ code: deepPlant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' }],
        })
      );

      expect(res.status).toBe(201);
      expect(res.body.counts).toEqual({ matched: 1, missing: 0, foreign: 0, unknown: 0 });
      expect(res.body.items.missing).toEqual([]);
      expect(res.body.items.foreign).toEqual([]);
      expect(res.body.items.unknown).toEqual([]);
    });

    it('пустые сканы → вся зона в missing', async () => {
      const section = await makeLocation('Секция A', 'section');
      await makePlant({ location_id: section.id });
      await makePlant({ location_id: section.id });

      const res = await postSession(sessionBody({ locationId: section.id, scans: [] }));
      expect(res.status).toBe(201);
      expect(res.body.counts).toEqual({ matched: 0, missing: 2, foreign: 0, unknown: 0 });
      expect(res.body.items.missing).toHaveLength(2);
    });

    it('идемпотентность: повтор того же clientRequestId → 200, та же сессия, без дублей строк', async () => {
      const section = await makeLocation('Секция A', 'section');
      const plant = await makePlant({ location_id: section.id });
      const body = sessionBody({
        locationId: section.id,
        scans: [{ code: plant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' }],
      });

      const first = await postSession(body);
      expect(first.status).toBe(201);
      const itemsAfterFirst = await countItems(first.body.id);

      const second = await postSession(body);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);

      expect(await inventoryRepo.countSessions(ctx.nurseryId)).toBe(1);
      expect(await countItems(first.body.id)).toBe(itemsAfterFirst);
    });

    it('гонка идемпотентности: параллельные запросы с одним clientRequestId → одна сессия (один 201, остальные 200)', async () => {
      const section = await makeLocation('Секция A', 'section');
      const plant = await makePlant({ location_id: section.id });
      const body = sessionBody({
        locationId: section.id,
        scans: [{ code: plant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' }],
      });

      const results = await Promise.all([postSession(body), postSession(body), postSession(body)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 201]);

      const ids = new Set(results.map((r) => r.body.id));
      expect(ids.size).toBe(1);
      expect(await inventoryRepo.countSessions(ctx.nurseryId)).toBe(1);
      expect(await countItems([...ids][0])).toBe(1);
    });

    it('не-unique ошибка вставки пробрасывается наружу (500)', async () => {
      const section = await makeLocation('Секция A', 'section');
      const spy = vi
        .spyOn(db, 'transaction')
        .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '99999' }));

      const res = await postSession(sessionBody({ locationId: section.id }));
      spy.mockRestore();

      expect(res.status).toBe(500);
      // сессия не создана
      expect(await inventoryRepo.countSessions(ctx.nurseryId)).toBe(0);
    });

    it('locationId из другого питомника → 404', async () => {
      const other = await createFullFixture();
      const foreignLoc = await makeLocation('Чужая секция', 'section', null, other.nurseryId);

      const res = await postSession(sessionBody({ locationId: foreignLoc.id }));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Локация не найдена');
    });

    it('observer → 403 (только WRITE_ROLES создают)', async () => {
      const section = await makeLocation('Секция A', 'section');
      const res = await postSession(sessionBody({ locationId: section.id }), ctx.observer.cookie);
      expect(res.status).toBe(403);
    });

    it('scans длиной 5001 → отклонён (413: тело > 100kb, лимит express.json срабатывает раньше .max(5000))', async () => {
      const section = await makeLocation('Секция A', 'section');
      const scans = Array.from({ length: 5001 }, (_, i) => ({
        code: `code-${i}`,
        scannedAt: '2026-07-25T10:01:00.000Z',
      }));
      const res = await postSession(sessionBody({ locationId: section.id, scans }));
      // Переполнение сканов отвергается: 5001 записей с ISO-метками > 100kb дефолтного
      // лимита express.json → 413 прежде, чем отработает валидатор (.max(5000) → 400).
      expect(res.status).toBe(413);
    });

    it('некорректный scannedAt в скане → 400 (валидатор scans)', async () => {
      const section = await makeLocation('Секция A', 'section');
      const res = await postSession(
        sessionBody({
          locationId: section.id,
          scans: [{ code: 'abc', scannedAt: 'не-дата' }],
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET список', () => {
    it('пагинация, форма строк, порядок completed_at DESC', async () => {
      const section = await makeLocation('Секция A', 'section');
      const s1 = await insertSession({ location_id: section.id, completed_at: '2026-07-20T10:00:00.000Z' });
      const s2 = await insertSession({ location_id: section.id, completed_at: '2026-07-22T10:00:00.000Z' });
      const s3 = await insertSession({ location_id: section.id, completed_at: '2026-07-24T10:00:00.000Z' });

      const res = await getList('page=1&perPage=2');
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.perPage).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.rows.map((r) => r.id)).toEqual([s3.id, s2.id]);

      expect(res.body.rows[0]).toMatchObject({
        id: s3.id,
        locationId: section.id,
        locationName: 'Секция A',
        counts: { matched: 0, missing: 0, foreign: 0, unknown: 0 },
      });
      expect(res.body.rows[0].startedAt).toBeTruthy();
      expect(res.body.rows[0].completedAt).toBeTruthy();
      // история не несёт построчных расхождений
      expect(res.body.rows[0]).not.toHaveProperty('items');

      const page2 = await getList('page=2&perPage=2');
      expect(page2.body.rows.map((r) => r.id)).toEqual([s1.id]);
    });

    it('observer читает список (200)', async () => {
      const section = await makeLocation('Секция A', 'section');
      await insertSession({ location_id: section.id });
      const res = await getList('', ctx.observer.cookie);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    it('тенант-изоляция: питомник B не видит сессии питомника A; total скоуплен', async () => {
      const section = await makeLocation('Секция A', 'section');
      await insertSession({ location_id: section.id });

      const other = await createFullFixture();
      const res = await getList('', other.cookie, other.nurseryId);
      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET деталь', () => {
    it('деталь совпадает по форме с ответом POST', async () => {
      const area = await makeLocation('Участок 1', 'area');
      const section = await makeLocation('Секция A', 'section', area.id);
      const otherSection = await makeLocation('Секция B', 'section', area.id);
      const matchedPlant = await makePlant({ location_id: section.id });
      await makePlant({ location_id: section.id }); // missing
      const foreignPlant = await makePlant({ location_id: otherSection.id });

      const created = await postSession(
        sessionBody({
          locationId: section.id,
          scans: [
            { code: matchedPlant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' },
            { code: foreignPlant.qr_code, scannedAt: '2026-07-25T10:02:00.000Z' },
            { code: 'ghost', scannedAt: '2026-07-25T10:03:00.000Z' },
          ],
        })
      );
      expect(created.status).toBe(201);

      const res = await getDetail(created.body.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(created.body);
    });

    it('сессия другого питомника → 404', async () => {
      const section = await makeLocation('Секция A', 'section');
      const created = await postSession(sessionBody({ locationId: section.id }));

      const other = await createFullFixture();
      const res = await getDetail(created.body.id, other.cookie, other.nurseryId);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Сессия инвентаризации не найдена');
    });

    it('несуществующий id → 404', async () => {
      const res = await getDetail(randomUUID());
      expect(res.status).toBe(404);
    });

    it('observer читает деталь (200)', async () => {
      const section = await makeLocation('Секция A', 'section');
      const created = await postSession(sessionBody({ locationId: section.id }));
      const res = await getDetail(created.body.id, ctx.observer.cookie);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });
  });
});
