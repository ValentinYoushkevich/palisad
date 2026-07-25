import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { generateInventoryActPdf } from '@/utils/generateInventoryActPdf.js';

import { api, createFullFixture, db, systemMovementType } from './helpers.js';

// PDF-акт инвентаризации (Э4: GET /:id/act). Зеркалит подход labels.test — буферизуем
// бинарный ответ и проверяем %PDF-заголовок + встроенный кириллический шрифт. Второй
// describe гоняет сам генератор с крайними данными (null-поля, пустые таблицы, пометки
// применения), чтобы покрыть его защитные ветви без БД.

function binaryParser(res, cb) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('Инвентаризация — PDF-акт (Э4: GET /:id/act)', () => {
  let ctx;

  async function makeLocation(name, type = 'area', parentId = null, nurseryId = ctx.nurseryId) {
    const [loc] = await db('locations')
      .insert({ nursery_id: nurseryId, name, type, parent_id: parentId })
      .returning('*');
    return loc;
  }

  async function makeSpecies(displayName) {
    const [catalog] = await db('species_catalog')
      .insert({
        gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
        scientific_name: `Sci ${randomUUID()}`,
      })
      .returning('*');
    const [species] = await db('nursery_species')
      .insert({ nursery_id: ctx.nurseryId, species_catalog_id: catalog.id, display_name_ru: displayName })
      .returning('*');
    return species;
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

  function postSession(body, cookie = ctx.worker.cookie) {
    return api()
      .post(`/api/nurseries/${ctx.nurseryId}/inventory-sessions`)
      .set('Cookie', cookie)
      .send(body);
  }

  function getAct(id, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/inventory-sessions/${id}/act`)
      .set('Cookie', cookie)
      .buffer()
      .parse(binaryParser);
  }

  // Сессия с кириллицей и всеми категориями расхождений, затем применение (списание
  // missing + перемещение foreign) → appliedMovementId проставлен, акт отражает применение.
  async function buildAppliedSession() {
    const area = await makeLocation('Участок 1', 'area');
    const section = await makeLocation('Секция А', 'section', area.id);
    const otherSection = await makeLocation('Секция Б', 'section', area.id);
    const species = await makeSpecies('Туя западная');
    const stage = await systemStage('container');

    const matchedPlant = await makePlant({ location_id: section.id, nursery_species_id: species.id });
    const missingPlant = await makePlant({
      location_id: section.id,
      nursery_species_id: species.id,
      stage_id: stage.id,
    });
    const foreignPlant = await makePlant({
      location_id: otherSection.id,
      nursery_species_id: species.id,
      stage_id: stage.id,
    });

    const created = await postSession({
      locationId: section.id,
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:05:00.000Z',
      clientRequestId: randomUUID(),
      scans: [
        { code: matchedPlant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' },
        { code: foreignPlant.qr_code, scannedAt: '2026-07-25T10:02:00.000Z' },
        { code: 'призрак-код', scannedAt: '2026-07-25T10:03:00.000Z' },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.counts).toEqual({ matched: 1, missing: 1, foreign: 1, unknown: 1 });

    const writeOffType = await systemMovementType('write_off');
    const applied = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/inventory-sessions/${created.body.id}/apply`)
      .set('Cookie', ctx.cookie)
      .send({
        writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id },
        transfer: { plantIds: [foreignPlant.id] },
      });
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toEqual({ writtenOff: 1, transferred: 1 });

    return created.body.id;
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  it('200 → PDF со встроенным кириллическим шрифтом; отражает применение', async () => {
    const sessionId = await buildAppliedSession();
    const res = await getAct(sessionId);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(`inventory-act-${sessionId}`);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(res.body.length).toBeGreaterThan(1024);
    // Встроенный DejaVuSans — доказывает, что кириллица рисуется Unicode-шрифтом, а не
    // латинским дефолтом pdfkit (иначе русский был бы «тофу»).
    expect(res.body.toString('latin1')).toContain('DejaVuSans');
  });

  it('observer может получить акт (200)', async () => {
    const sessionId = await buildAppliedSession();
    const res = await getAct(sessionId, ctx.observer.cookie);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('сессия без исполнителя (user_id = null) → акт генерируется (200)', async () => {
    const section = await makeLocation('Секция А', 'section');
    const [row] = await db('inventory_sessions')
      .insert({
        nursery_id: ctx.nurseryId,
        location_id: section.id,
        user_id: null,
        started_at: '2026-07-25T09:00:00.000Z',
        completed_at: '2026-07-25T10:00:00.000Z',
        matched_count: 0,
        missing_count: 0,
        foreign_count: 0,
        unknown_count: 0,
      })
      .returning('*');

    const res = await getAct(row.id);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(res.body.toString('latin1')).toContain('DejaVuSans');
  });

  it('сессия другого питомника → 404', async () => {
    const sessionId = await buildAppliedSession();
    const other = await createFullFixture();
    const res = await getAct(sessionId, other.cookie, other.nurseryId);
    expect(res.status).toBe(404);
  });

  it('несуществующий id → 404', async () => {
    const res = await getAct(randomUUID());
    expect(res.status).toBe(404);
  });
});

describe('generateInventoryActPdf — генератор (защитные ветви)', () => {
  function makeDetail(overrides = {}) {
    return {
      id: 'sess-1',
      locationId: 'loc-1',
      locationName: 'Секция А',
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:05:00.000Z',
      counts: { matched: 0, missing: 0, foreign: 0, unknown: 0 },
      items: { missing: [], foreign: [], unknown: [] },
      ...overrides,
    };
  }

  it('null питомник/исполнитель, пустые таблицы и некорректные даты не роняют генерацию', async () => {
    const detail = makeDetail({ locationName: null, startedAt: null, completedAt: 'не-дата' });
    const doc = generateInventoryActPdf({ detail, nurseryName: null, scannedByName: null });
    const buf = await streamToBuffer(doc);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('DejaVuSans');
  });

  it('fallback-подписи, пометки применения и строка «Применено» рисуются', async () => {
    const detail = makeDetail({
      counts: { matched: 1, missing: 1, foreign: 1, unknown: 2 },
      items: {
        missing: [
          {
            id: 'i1',
            plantId: 'p1',
            qrCode: null,
            numericCode: 'nc-1',
            speciesName: null,
            scientificName: 'Thuja occidentalis',
            stageName: null,
            currentLocationName: 'Секция А',
            appliedMovementId: 'mv-1',
          },
        ],
        foreign: [
          {
            id: 'i2',
            plantId: 'p2',
            qrCode: 'qr-2',
            numericCode: null,
            speciesName: 'Туя западная',
            scientificName: null,
            stageName: 'Контейнер',
            currentLocationName: 'Секция Б',
            appliedMovementId: 'mv-2',
            rawCode: 'qr-2',
            scannedAt: '2026-07-25T10:02:00.000Z',
          },
        ],
        unknown: [
          { id: 'i3', rawCode: null, scannedAt: '2026-07-25T10:03:00.000Z' },
          { id: 'i4', rawCode: 'призрак', scannedAt: '2026-07-25T10:04:00.000Z' },
        ],
      },
    });
    const doc = generateInventoryActPdf({
      detail,
      nurseryName: 'Питомник «Тест»',
      scannedByName: 'Иван Иванов',
    });
    const buf = await streamToBuffer(doc);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.toString('latin1')).toContain('DejaVuSans');
  });
});
