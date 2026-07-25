import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db } from './helpers.js';
import { resolveStageAtOperation } from '@/services/report.service.js';

const PERIOD = 'dateFrom=2026-03-01&dateTo=2026-06-30';
const BEFORE_PERIOD = '2026-01-01T00:00:00Z';
const IN_MARCH = '2026-03-15T00:00:00Z';
const CHANGE_AT = '2026-04-10T00:00:00Z'; // момент смены стадии T
const BEFORE_CHANGE = '2026-04-09T00:00:00Z'; // T − 1 день
const AFTER_CHANGE = '2026-04-11T00:00:00Z'; // T + 1 день

// ─── Чистая функция resolveStageAtOperation (изолированный юнит-тест) ─────────
describe('resolveStageAtOperation (историческая стадия на момент операции)', () => {
  const STAGE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const STAGE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const CURRENT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  // История отсортирована по возрастанию created_at (как её отдаёт groupMovementsByPlant).
  const history = [
    { stage_id: STAGE_A, created_at: BEFORE_PERIOD },
    { stage_id: STAGE_B, created_at: CHANGE_AT },
  ];

  it('операция до смены → предыдущая стадия', () => {
    expect(resolveStageAtOperation(history, BEFORE_CHANGE, CURRENT)).toBe(STAGE_A);
  });

  it('операция после смены → новая стадия', () => {
    expect(resolveStageAtOperation(history, AFTER_CHANGE, CURRENT)).toBe(STAGE_B);
  });

  it('операция ровно в момент смены → новая стадия (граница <=)', () => {
    expect(resolveStageAtOperation(history, CHANGE_AT, CURRENT)).toBe(STAGE_B);
  });

  it('пустая история → текущая стадия растения', () => {
    expect(resolveStageAtOperation([], CHANGE_AT, CURRENT)).toBe(CURRENT);
  });

  it('пустая история и нет текущей стадии → null', () => {
    expect(resolveStageAtOperation([], CHANGE_AT, null)).toBeNull();
  });

  it('текущая стадия undefined → null', () => {
    expect(resolveStageAtOperation([], CHANGE_AT, undefined)).toBeNull();
  });

  it('все записи истории позже операции → текущая стадия (fallback)', () => {
    expect(resolveStageAtOperation(history, '2025-12-31T00:00:00Z', CURRENT)).toBe(CURRENT);
  });

  it('последняя подходящая запись со стадией null → null', () => {
    const h = [{ stage_id: null, created_at: BEFORE_PERIOD }];
    expect(resolveStageAtOperation(h, CHANGE_AT, CURRENT)).toBeNull();
  });
});

// ─── Интеграционные тесты эндпоинта ──────────────────────────────────────────
describe('Отчёты — Э3 «трудозатраты» (labor-cost)', () => {
  let ctx;

  async function makePlant(overrides = {}) {
    const [plant] = await db('plants')
      .insert({
        nursery_id: ctx.nurseryId,
        qr_code: `qr-${randomUUID()}`,
        numeric_code: `nc-${randomUUID()}`,
        status: 'growing',
        created_at: BEFORE_PERIOD,
        ...overrides,
      })
      .returning('*');
    return plant;
  }

  async function makeSpecies(displayName) {
    const [catalog] = await db('species_catalog')
      .insert({
        gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
        scientific_name: `Sci ${randomUUID()}`,
      })
      .returning('*');
    const [species] = await db('nursery_species')
      .insert({
        nursery_id: ctx.nurseryId,
        species_catalog_id: catalog.id,
        display_name_ru: displayName,
      })
      .returning('*');
    return species;
  }

  function systemStage(slug) {
    return db('production_stages').where({ slug, is_system: true }).first();
  }

  async function makeNorm(stageId, operationType, normMinutes, nurseryId = ctx.nurseryId) {
    await db('stage_labor_norms').insert({
      nursery_id: nurseryId,
      stage_id: stageId,
      operation_type: operationType,
      norm_minutes: normMinutes,
    });
  }

  async function addOperation(plantId, type, createdAt, opts = {}) {
    await db('operations').insert({
      plant_id: plantId,
      type,
      created_at: createdAt,
      deleted_at: opts.deletedAt ?? null,
    });
  }

  async function addStageHistory(plantId, stageId, createdAt) {
    await db('plant_stage_history').insert({ plant_id: plantId, stage_id: stageId, created_at: createdAt });
  }

  function getReport(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/reports/labor-cost?${query}`)
      .set('Cookie', cookie);
  }

  // Надёжно читаем CSV-тело как UTF-8 строку (BOM сохраняется).
  function getCsv(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/reports/labor-cost?${query}`)
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

  // Инварианты: сумма operations по строкам == operationsCount, сумма minutes == totalMinutes.
  function assertSums(body) {
    const sumOps = body.rows.reduce((acc, r) => acc + r.operations, 0);
    const sumMinutes = body.rows.reduce((acc, r) => acc + r.minutes, 0);
    expect(sumOps).toBe(body.operationsCount);
    expect(sumMinutes).toBe(body.totalMinutes);
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  it('стадия на момент операции: до/после смены дают разные нормы (groupBy=stage)', async () => {
    const stageA = await systemStage('propagation');
    const stageB = await systemStage('container');
    const species = await makeSpecies('Туя западная');
    // Текущая стадия = stageB; в истории stageA до T и stageB в момент T.
    const plant = await makePlant({ stage_id: stageB.id, nursery_species_id: species.id });
    await addStageHistory(plant.id, stageA.id, BEFORE_PERIOD);
    await addStageHistory(plant.id, stageB.id, CHANGE_AT);
    await makeNorm(stageA.id, 'pruning', 30); // X
    await makeNorm(stageB.id, 'pruning', 50); // Y (≠ X)

    await addOperation(plant.id, 'pruning', BEFORE_CHANGE); // → stageA, 30
    await addOperation(plant.id, 'pruning', AFTER_CHANGE); // → stageB, 50

    const res = await getReport(`${PERIOD}&groupBy=stage`);
    expect(res.status).toBe(200);
    expect(res.body.totalMinutes).toBe(80);
    expect(res.body.operationsCount).toBe(2);
    expect(res.body.operationsWithoutNorm).toBe(0);
    assertSums(res.body);

    const rowA = res.body.rows.find((r) => r.key === stageA.id);
    const rowB = res.body.rows.find((r) => r.key === stageB.id);
    expect(rowA).toMatchObject({ minutes: 30, operations: 1, plants: 1, minutesPerPlant: 30 });
    expect(rowB).toMatchObject({ minutes: 50, operations: 1, plants: 1, minutesPerPlant: 50 });
    // Сортировка по minutes desc: stageB (50) впереди stageA (30).
    expect(res.body.rows[0].key).toBe(stageB.id);
  });

  it('operationsWithoutNorm: операция без нормы даёт 0 минут, но считается в группе и count', async () => {
    const stageA = await systemStage('propagation');
    const species = await makeSpecies('Клён');
    const plant = await makePlant({ stage_id: stageA.id, nursery_species_id: species.id });
    await makeNorm(stageA.id, 'pruning', 30); // норма только для pruning

    await addOperation(plant.id, 'pruning', IN_MARCH); // 30
    await addOperation(plant.id, 'treatment', IN_MARCH); // нет нормы → 0, без нормы

    const res = await getReport(`${PERIOD}&groupBy=species`);
    expect(res.status).toBe(200);
    expect(res.body.totalMinutes).toBe(30);
    expect(res.body.operationsCount).toBe(2);
    expect(res.body.operationsWithoutNorm).toBe(1);
    assertSums(res.body);

    const row = res.body.rows.find((r) => r.key === species.id);
    // Обе операции в группе вида (одна с нормой, одна без) — operations считает обе.
    expect(row).toMatchObject({ minutes: 30, operations: 2, plants: 1, minutesPerPlant: 30 });
  });

  it('fallback: нет истории → текущая стадия; нет истории и стадия NULL → «Без стадии»', async () => {
    const stageA = await systemStage('propagation');
    await makeNorm(stageA.id, 'pruning', 30);
    const withCurrent = await makePlant({ stage_id: stageA.id }); // нет истории → текущая
    const withoutStage = await makePlant({ stage_id: null }); // нет истории и стадии

    await addOperation(withCurrent.id, 'pruning', IN_MARCH); // → stageA, 30
    await addOperation(withoutStage.id, 'pruning', IN_MARCH); // → null стадия, без нормы

    const res = await getReport(`${PERIOD}&groupBy=stage`);
    expect(res.status).toBe(200);
    expect(res.body.totalMinutes).toBe(30);
    expect(res.body.operationsCount).toBe(2);
    expect(res.body.operationsWithoutNorm).toBe(1);
    assertSums(res.body);

    const rowStage = res.body.rows.find((r) => r.key === stageA.id);
    const rowNull = res.body.rows.find((r) => r.key === null);
    expect(rowStage).toMatchObject({ minutes: 30, operations: 1, plants: 1 });
    expect(rowNull).toMatchObject({ label: 'Без стадии', minutes: 0, operations: 1, plants: 1 });
  });

  it('groupBy=species и groupBy=stage: обе группировки и инварианты сумм', async () => {
    const st1 = await systemStage('propagation');
    const st2 = await systemStage('container');
    const s1 = await makeSpecies('Вид 1');
    const s2 = await makeSpecies('Вид 2');
    await makeNorm(st1.id, 'pruning', 10);
    await makeNorm(st2.id, 'pruning', 20);
    await makeNorm(st1.id, 'treatment', 5);

    const p1 = await makePlant({ nursery_species_id: s1.id, stage_id: st1.id });
    const p2 = await makePlant({ nursery_species_id: s2.id, stage_id: st2.id });
    const p3 = await makePlant({ nursery_species_id: s1.id, stage_id: st2.id });
    await addOperation(p1.id, 'pruning', IN_MARCH); // st1/s1 → 10
    await addOperation(p1.id, 'treatment', IN_MARCH); // st1/s1 → 5
    await addOperation(p2.id, 'pruning', IN_MARCH); // st2/s2 → 20
    await addOperation(p3.id, 'pruning', IN_MARCH); // st2/s1 → 20

    const bySpecies = await getReport(`${PERIOD}&groupBy=species`);
    expect(bySpecies.status).toBe(200);
    expect(bySpecies.body.totalMinutes).toBe(55);
    expect(bySpecies.body.operationsCount).toBe(4);
    assertSums(bySpecies.body);
    expect(bySpecies.body.rows.find((r) => r.key === s1.id)).toMatchObject({
      minutes: 35, operations: 3, plants: 2, minutesPerPlant: 17.5,
    });
    expect(bySpecies.body.rows.find((r) => r.key === s2.id)).toMatchObject({
      minutes: 20, operations: 1, plants: 1, minutesPerPlant: 20,
    });
    // Сортировка по minutes desc.
    expect(bySpecies.body.rows[0].key).toBe(s1.id);

    const byStage = await getReport(`${PERIOD}&groupBy=stage`);
    expect(byStage.status).toBe(200);
    expect(byStage.body.totalMinutes).toBe(55);
    assertSums(byStage.body);
    expect(byStage.body.rows.find((r) => r.key === st1.id)).toMatchObject({
      minutes: 15, operations: 2, plants: 1,
    });
    expect(byStage.body.rows.find((r) => r.key === st2.id)).toMatchObject({
      minutes: 40, operations: 2, plants: 2,
    });
    expect(byStage.body.rows[0].key).toBe(st2.id);
  });

  it('groupBy=species: растение без вида → строка «Без вида»', async () => {
    const stageA = await systemStage('propagation');
    await makeNorm(stageA.id, 'pruning', 30);
    const plant = await makePlant({ stage_id: stageA.id, nursery_species_id: null });
    await addOperation(plant.id, 'pruning', IN_MARCH);

    const res = await getReport(`${PERIOD}&groupBy=species`);
    expect(res.status).toBe(200);
    const rowNull = res.body.rows.find((r) => r.key === null);
    expect(rowNull).toMatchObject({ label: 'Без вида', minutes: 30, operations: 1, plants: 1 });
  });

  it('удалённые операции не учитываются', async () => {
    const stageA = await systemStage('propagation');
    const plant = await makePlant({ stage_id: stageA.id });
    await makeNorm(stageA.id, 'pruning', 30);
    await addOperation(plant.id, 'pruning', IN_MARCH); // учитывается
    await addOperation(plant.id, 'pruning', IN_MARCH, { deletedAt: IN_MARCH }); // soft-deleted

    const res = await getReport(`${PERIOD}&groupBy=stage`);
    expect(res.status).toBe(200);
    expect(res.body.operationsCount).toBe(1);
    expect(res.body.totalMinutes).toBe(30);
  });

  it('пустой период → нули и пустые строки', async () => {
    const stageA = await systemStage('propagation');
    const plant = await makePlant({ stage_id: stageA.id });
    await makeNorm(stageA.id, 'pruning', 30);
    await addOperation(plant.id, 'pruning', IN_MARCH);

    const res = await getReport('dateFrom=2025-01-01&dateTo=2025-06-30');
    expect(res.status).toBe(200);
    expect(res.body.totalMinutes).toBe(0);
    expect(res.body.operationsCount).toBe(0);
    expect(res.body.operationsWithoutNorm).toBe(0);
    expect(res.body.rows).toEqual([]);
  });

  describe('RBAC (только STRUCTURE_ROLES)', () => {
    it('worker → 403', async () => {
      const res = await getReport(PERIOD, ctx.worker.cookie);
      expect(res.status).toBe(403);
    });

    it('observer → 403', async () => {
      const res = await getReport(PERIOD, ctx.observer.cookie);
      expect(res.status).toBe(403);
    });

    it('agronomist → 200', async () => {
      const res = await getReport(PERIOD, ctx.agronomist.cookie);
      expect(res.status).toBe(200);
    });
  });

  it('кросс-tenant: операции и нормы одного питомника не утекают в отчёт другого', async () => {
    const stageA = await systemStage('propagation');
    const plant = await makePlant({ stage_id: stageA.id });
    await makeNorm(stageA.id, 'pruning', 30);
    await addOperation(plant.id, 'pruning', IN_MARCH);

    const ctx2 = await createFullFixture();
    // Свой отчёт второго питомника — без чужих данных.
    const own = await getReport(PERIOD, ctx2.cookie, ctx2.nurseryId);
    expect(own.status).toBe(200);
    expect(own.body.totalMinutes).toBe(0);
    expect(own.body.operationsCount).toBe(0);
    expect(own.body.rows).toEqual([]);

    // Чужой питомник по URL — 403 (requireNurseryAccess).
    const foreign = await getReport(PERIOD, ctx2.cookie, ctx.nurseryId);
    expect(foreign.status).toBe(403);
  });

  describe('валидация query (400)', () => {
    it('dateFrom > dateTo → 400', async () => {
      const res = await getReport('dateFrom=2026-06-30&dateTo=2026-03-01');
      expect(res.status).toBe(400);
    });

    it('диапазон > 2 лет → 400', async () => {
      const res = await getReport('dateFrom=2020-01-01&dateTo=2023-06-01');
      expect(res.status).toBe(400);
    });

    it('невалидный groupBy → 400', async () => {
      const res = await getReport(`${PERIOD}&groupBy=bogus`);
      expect(res.status).toBe(400);
    });

    it('отсутствует dateFrom → 400', async () => {
      const res = await getReport('dateTo=2026-06-30');
      expect(res.status).toBe(400);
    });
  });

  it('CSV: заголовки, BOM, разделитель, имя файла', async () => {
    const stageA = await systemStage('propagation');
    const species = await makeSpecies('Липа');
    const plant = await makePlant({ stage_id: stageA.id, nursery_species_id: species.id });
    await makeNorm(stageA.id, 'pruning', 30);
    await addOperation(plant.id, 'pruning', IN_MARCH);

    const res = await getCsv(`${PERIOD}&groupBy=species&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('filename="labor-cost_2026-03-01.csv"');

    const body = res.body;
    expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
    expect(body).toContain(';'); // разделитель
    expect(body).toContain('Группа;Нормо-минуты;Операций;Растений;Минут на растение');
  });
});
