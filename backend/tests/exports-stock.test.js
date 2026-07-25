import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { buildLocationPath } from '@/services/export.service.js';

import { api, createFullFixture, db, setFreePlan } from './helpers.js';

describe('Экспорт — Э2 «наличие» (stock export)', () => {
  let ctx;

  // Прямая вставка активного растения с контролируемыми полями группировки.
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
    return species;
  }

  async function makeContainer(code, name) {
    const [container] = await db('container_types')
      .insert({ nursery_id: ctx.nurseryId, code, name })
      .returning('*');
    return container;
  }

  async function makeLocation(name, type = 'section', parentId = null) {
    const [loc] = await db('locations')
      .insert({ nursery_id: ctx.nurseryId, name, type, parent_id: parentId })
      .returning('*');
    return loc;
  }

  function systemStage(slug) {
    return db('production_stages').where({ slug, is_system: true }).first();
  }

  function getStock(query = '', cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    const suffix = query ? `?${query}` : '';
    return api().get(`/api/nurseries/${nurseryId}/exports/stock${suffix}`).set('Cookie', cookie);
  }

  // CSV-тело читаем как UTF-8 строку (BOM сохраняется).
  function getCsv(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/exports/stock?${query}`)
      .set('Cookie', cookie)
      .buffer()
      .parse((res, cb) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => cb(null, data));
      });
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
    await setFreePlan({ feature_export: true });
  });

  describe('buildLocationPath (юнит)', () => {
    it('один уровень → имя узла', () => {
      const map = new Map([['a', { id: 'a', parent_id: null, name: 'Участок' }]]);
      expect(buildLocationPath('a', map)).toBe('Участок');
    });

    it('три уровня → root→leaf через " / "', () => {
      const map = new Map([
        ['a', { id: 'a', parent_id: null, name: 'Участок' }],
        ['b', { id: 'b', parent_id: 'a', name: 'Секция' }],
        ['c', { id: 'c', parent_id: 'b', name: 'Ряд' }],
      ]);
      expect(buildLocationPath('c', map)).toBe('Участок / Секция / Ряд');
    });

    it('оборванный parent → останавливаемся на собранном', () => {
      const map = new Map([['c', { id: 'c', parent_id: 'missing', name: 'Ряд' }]]);
      expect(buildLocationPath('c', map)).toBe('Ряд');
    });

    it('цикл в дереве → терминирует без зависания', () => {
      const map = new Map([
        ['a', { id: 'a', parent_id: 'b', name: 'A' }],
        ['b', { id: 'b', parent_id: 'a', name: 'B' }],
      ]);
      expect(buildLocationPath('a', map)).toBe('B / A');
    });

    it('null-локация → «Без локации»', () => {
      expect(buildLocationPath(null, new Map())).toBe('Без локации');
    });
  });

  describe('groupBy=species (дефолт)', () => {
    it('считает COUNT(*) по (вид, сорт, стадия, контейнер) и total', async () => {
      const a = await makeSpecies('Абрикос');
      const b = await makeSpecies('Берёза');
      const c1 = await makeContainer('C1', 'Контейнер C1');

      // 3 growing + 1 storage вида A/C1, сорт null → одна строка count 4.
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id, status: 'storage' });
      // тот же вид/контейнер, но другой сорт → отдельная строка count 1.
      await makePlant({ nursery_species_id: a.id, container_id: c1.id, variety: 'Сорт X' });
      // вид B без контейнера, 2 шт.
      await makePlant({ nursery_species_id: b.id });
      await makePlant({ nursery_species_id: b.id });

      const res = await getStock();
      expect(res.status).toBe(200);
      expect(res.body.groupBy).toBe('species');
      expect(res.body.total).toBe(7);

      const rowA = res.body.rows.find(
        (r) => r.speciesName === 'Абрикос' && r.variety === '' && r.containerName === 'Контейнер C1'
      );
      expect(rowA).toMatchObject({ stageName: '', containerName: 'Контейнер C1', count: 4 });

      const rowAx = res.body.rows.find((r) => r.speciesName === 'Абрикос' && r.variety === 'Сорт X');
      expect(rowAx.count).toBe(1);

      const rowB = res.body.rows.find((r) => r.speciesName === 'Берёза');
      expect(rowB).toMatchObject({ variety: '', containerName: '', count: 2 });
    });

    it('исключает sold, written_off и soft-deleted', async () => {
      const a = await makeSpecies('Абрикос');
      const c1 = await makeContainer('C1', 'Контейнер C1');

      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id, status: 'sold' });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id, status: 'written_off' });
      await makePlant({
        nursery_species_id: a.id,
        container_id: c1.id,
        deleted_at: '2026-01-01T00:00:00Z',
      });

      const res = await getStock();
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].count).toBe(2);
    });

    it('стадия и контейнер из справочников подписываются, null → пусто', async () => {
      const a = await makeSpecies('Абрикос');
      const stage = await systemStage('container');
      await makePlant({ nursery_species_id: a.id, stage_id: stage.id });

      const res = await getStock();
      const row = res.body.rows[0];
      expect(row.stageName).toBe(stage.name);
      expect(row.containerName).toBe('');
    });

    it('пустой питомник → rows пуст, total 0', async () => {
      const res = await getStock();
      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('распознаёт разные сорта как отдельные строки', async () => {
      const a = await makeSpecies('Абрикос');
      await makePlant({ nursery_species_id: a.id, variety: 'V1' });
      await makePlant({ nursery_species_id: a.id, variety: 'V2' });
      await makePlant({ nursery_species_id: a.id }); // null сорт

      const res = await getStock();
      expect(res.body.rows).toHaveLength(3);
      const varieties = res.body.rows.map((r) => r.variety).sort();
      expect(varieties).toEqual(['', 'V1', 'V2']);
    });

    it('сортировка: по имени вида, затем по контейнеру', async () => {
      const beta = await makeSpecies('Бета');
      const alpha = await makeSpecies('Альфа');
      const cB = await makeContainer('CB', 'Бак');
      const cA = await makeContainer('CA', 'Ааа');

      await makePlant({ nursery_species_id: beta.id, container_id: cA.id });
      await makePlant({ nursery_species_id: alpha.id, container_id: cB.id });
      await makePlant({ nursery_species_id: alpha.id, container_id: cA.id });

      const res = await getStock();
      const order = res.body.rows.map((r) => `${r.speciesName}/${r.containerName}`);
      expect(order).toEqual(['Альфа/Ааа', 'Альфа/Бак', 'Бета/Ааа']);
    });
  });

  describe('groupBy=location', () => {
    it('строит полный путь area→section→row и «Без локации»', async () => {
      const area = await makeLocation('Участок 1', 'area');
      const section = await makeLocation('Секция A', 'section', area.id);
      const row = await makeLocation('Ряд 3', 'row', section.id);
      const a = await makeSpecies('Абрикос');

      await makePlant({ nursery_species_id: a.id, location_id: row.id });
      await makePlant({ nursery_species_id: a.id, location_id: row.id });
      await makePlant({ nursery_species_id: a.id, location_id: null });

      const res = await getStock('groupBy=location');
      expect(res.status).toBe(200);
      expect(res.body.groupBy).toBe('location');
      expect(res.body.total).toBe(3);

      const leaf = res.body.rows.find((r) => r.locationPath === 'Участок 1 / Секция A / Ряд 3');
      expect(leaf.count).toBe(2);
      const none = res.body.rows.find((r) => r.locationPath === 'Без локации');
      expect(none.count).toBe(1);
    });

    it('сортировка: по пути локации первым делом', async () => {
      const a = await makeLocation('Ббб', 'area');
      const b = await makeLocation('Ааа', 'area');
      const sp = await makeSpecies('Абрикос');
      await makePlant({ nursery_species_id: sp.id, location_id: a.id });
      await makePlant({ nursery_species_id: sp.id, location_id: b.id });

      const res = await getStock('groupBy=location');
      const paths = res.body.rows.map((r) => r.locationPath);
      expect(paths).toEqual(['Ааа', 'Ббб']);
    });
  });

  describe('CSV', () => {
    it('BOM, разделитель ;, заголовки, имя файла, строка «Всего»', async () => {
      const a = await makeSpecies('Абрикос');
      const c1 = await makeContainer('C1', 'Контейнер C1');
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });

      const res = await getCsv('format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toMatch(/filename="stock_species_\d{4}-\d{2}-\d{2}\.csv"/);

      const body = res.body;
      expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      expect(body).toContain('Вид;Сорт;Стадия;Контейнер;Количество');
      expect(body).toContain('Всего;;;;2');
    });

    it('локация: колонка «Локация» первой, имя файла stock_location', async () => {
      const area = await makeLocation('Участок 1', 'area');
      const a = await makeSpecies('Абрикос');
      await makePlant({ nursery_species_id: a.id, location_id: area.id });

      const res = await getCsv('groupBy=location&format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('filename="stock_location_');
      expect(res.body).toContain('Локация;Вид;Сорт;Стадия;Контейнер;Количество');
      expect(res.body).toContain('Всего;;;;;1');
    });

    it('экранирует ; и " в подписях', async () => {
      const a = await makeSpecies('Ель; колючая');
      await makePlant({ nursery_species_id: a.id, variety: 'Сорт "A"' });

      const res = await getCsv('format=csv');
      expect(res.body).toContain('"Ель; колючая"');
      expect(res.body).toContain('"Сорт ""A"""');
    });
  });

  describe('изоляция и доступ', () => {
    it('данные чужого питомника не попадают в выгрузку', async () => {
      const a = await makeSpecies('Абрикос');
      await makePlant({ nursery_species_id: a.id });

      const other = await createFullFixture();
      await setFreePlan({ feature_export: true });
      const res = await getStock('', other.cookie, other.nurseryId);
      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('worker → 403', async () => {
      const res = await getStock('', ctx.worker.cookie);
      expect(res.status).toBe(403);
    });

    it('observer → 403', async () => {
      const res = await getStock('', ctx.observer.cookie);
      expect(res.status).toBe(403);
    });

    it('agronomist → 200', async () => {
      const res = await getStock('', ctx.agronomist.cookie);
      expect(res.status).toBe(200);
    });
  });

  describe('гейт feature_export', () => {
    it('feature_export=false → 403 (json)', async () => {
      await setFreePlan({ feature_export: false });
      const res = await getStock();
      expect(res.status).toBe(403);
    });

    it('feature_export=false → 403 (csv)', async () => {
      await setFreePlan({ feature_export: false });
      const res = await getStock('format=csv');
      expect(res.status).toBe(403);
    });
  });

  describe('валидация query (400)', () => {
    it('невалидный groupBy → 400', async () => {
      const res = await getStock('groupBy=bogus');
      expect(res.status).toBe(400);
    });

    it('невалидный format → 400', async () => {
      const res = await getStock('format=xml');
      expect(res.status).toBe(400);
    });
  });
});
