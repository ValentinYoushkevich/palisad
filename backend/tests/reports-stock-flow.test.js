import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db, systemMovementType } from './helpers.js';

const PERIOD = 'dateFrom=2026-03-01&dateTo=2026-06-30';
const BEFORE_PERIOD = '2026-01-01T00:00:00Z';
const DELETED_BEFORE = '2026-02-01T00:00:00Z';
const IN_MARCH = '2026-03-15T00:00:00Z';
const IN_APRIL = '2026-04-10T00:00:00Z';
const IN_MAY = '2026-05-10T00:00:00Z';

describe('Отчёты — Э2 «движение остатков» (stock-flow)', () => {
  let ctx;
  let saleType;
  let writeOffType;
  let transferType;

  // Прямая вставка растения с контролируемыми датой/локацией/видом/стадией.
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

  // Прямая вставка движения на заданную дату (обходя сервис — фиксируем историю).
  async function addMovement(plantId, typeId, opts = {}) {
    await db('movements').insert({
      plant_id: plantId,
      type_id: typeId,
      quantity: opts.quantity ?? 1,
      from_location_id: opts.fromLocationId ?? null,
      to_location_id: opts.toLocationId ?? null,
      created_at: opts.createdAt,
    });
  }

  async function makeLocation(name) {
    const [loc] = await db('locations')
      .insert({ nursery_id: ctx.nurseryId, name, type: 'section' })
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

  function getReport(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/reports/stock-flow?${query}`)
      .set('Cookie', cookie);
  }

  // Надёжно читаем CSV-тело как UTF-8 строку (BOM сохраняется).
  function getCsv(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/reports/stock-flow?${query}`)
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

  // Балансовая идентичность: closing = opening + inflow − sold − writtenOff + transfersNet.
  function assertIdentity(rows, totals) {
    const check = (r) =>
      expect(r.closing).toBe(r.opening + r.inflow - r.sold - r.writtenOff + r.transfersNet);
    rows.forEach(check);
    check(totals);
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
    saleType = await systemMovementType('sale');
    writeOffType = await systemMovementType('write_off');
    transferType = await systemMovementType('transfer');
  });

  describe('балансовая идентичность (per-row и totals)', () => {
    it('location: перемещение, продажа, списание, приход, soft-delete и «Без локации»', async () => {
      const loc1 = await makeLocation('Локация 1');
      const loc2 = await makeLocation('Локация 2');

      await makePlant({ location_id: loc1.id }); // остаётся: opening/closing loc1
      const b = await makePlant({ location_id: loc2.id }); // перемещён loc1 → loc2 в периоде
      await addMovement(b.id, transferType.id, {
        createdAt: IN_APRIL,
        fromLocationId: loc1.id,
        toLocationId: loc2.id,
      });
      const c = await makePlant({ location_id: loc1.id }); // продан в периоде
      await addMovement(c.id, saleType.id, { createdAt: IN_APRIL });
      const d = await makePlant({ location_id: loc2.id }); // списан в периоде
      await addMovement(d.id, writeOffType.id, { createdAt: IN_MAY });
      await makePlant({ location_id: loc2.id, created_at: IN_MARCH }); // приход в периоде
      await makePlant({ location_id: loc1.id, deleted_at: DELETED_BEFORE }); // удалён до периода
      await makePlant({ location_id: null, created_at: IN_MARCH }); // приход без локации

      const res = await getReport(`${PERIOD}&groupBy=location`);
      expect(res.status).toBe(200);
      assertIdentity(res.body.rows, res.body.totals);

      const row1 = res.body.rows.find((r) => r.key === loc1.id);
      const row2 = res.body.rows.find((r) => r.key === loc2.id);
      const rowNull = res.body.rows.find((r) => r.key === null);

      expect(row1).toMatchObject({
        opening: 3, inflow: 0, sold: 1, writtenOff: 0, transfersNet: -1, closing: 1,
      });
      expect(row2).toMatchObject({
        opening: 1, inflow: 1, sold: 0, writtenOff: 1, transfersNet: 1, closing: 2,
      });
      expect(rowNull).toMatchObject({
        label: 'Без локации', opening: 0, inflow: 1, transfersNet: 0, closing: 1,
      });
      expect(res.body.totals).toMatchObject({
        opening: 4, inflow: 2, sold: 1, writtenOff: 1, transfersNet: 0, closing: 4,
      });
    });

    it('species: атрибут постоянен, transfersNet=0, дефолтная группировка', async () => {
      const s1 = await makeSpecies('Вид 1');
      const s2 = await makeSpecies('Вид 2');

      await makePlant({ nursery_species_id: s1.id }); // остаётся
      const sold = await makePlant({ nursery_species_id: s1.id });
      await addMovement(sold.id, saleType.id, { createdAt: IN_APRIL });
      const off = await makePlant({ nursery_species_id: s2.id });
      await addMovement(off.id, writeOffType.id, { createdAt: IN_MAY });
      await makePlant({ nursery_species_id: s2.id, created_at: IN_MARCH }); // приход
      await makePlant({ nursery_species_id: null }); // без вида

      // Без groupBy → по умолчанию species.
      const res = await getReport(PERIOD);
      expect(res.status).toBe(200);
      assertIdentity(res.body.rows, res.body.totals);
      res.body.rows.forEach((r) => expect(r.transfersNet).toBe(0));
      expect(res.body.totals.transfersNet).toBe(0);

      expect(res.body.rows.find((r) => r.key === s1.id)).toMatchObject({
        opening: 2, sold: 1, writtenOff: 0, closing: 1,
      });
      expect(res.body.rows.find((r) => r.key === s2.id)).toMatchObject({
        opening: 1, inflow: 1, writtenOff: 1, closing: 1,
      });
      expect(res.body.rows.find((r) => r.key === null)).toMatchObject({ label: 'Без вида' });
    });

    it('stage: используется ТЕКУЩАЯ стадия — смена стадии в периоде не создаёт фантомный переход', async () => {
      const st1 = await systemStage('propagation');
      const st2 = await systemStage('container');

      await makePlant({ stage_id: st2.id }); // остаётся в st2
      const changed = await makePlant({ stage_id: st2.id }); // сменил стадию st1 → st2
      await db('plant_stage_history').insert([
        { plant_id: changed.id, stage_id: st1.id, created_at: BEFORE_PERIOD },
        { plant_id: changed.id, stage_id: st2.id, created_at: IN_APRIL },
      ]);
      const sold = await makePlant({ stage_id: st1.id });
      await addMovement(sold.id, saleType.id, { createdAt: IN_APRIL });
      await makePlant({ stage_id: st2.id, created_at: IN_MARCH }); // приход в st2

      const res = await getReport(`${PERIOD}&groupBy=stage`);
      expect(res.status).toBe(200);
      assertIdentity(res.body.rows, res.body.totals);
      res.body.rows.forEach((r) => expect(r.transfersNet).toBe(0));

      const rowSt2 = res.body.rows.find((r) => r.key === st2.id);
      const rowSt1 = res.body.rows.find((r) => r.key === st1.id);
      // changed учтён по текущей стадии st2 на обеих границах (не даёт opening для st1).
      expect(rowSt2).toMatchObject({ opening: 2, inflow: 1, closing: 3 });
      expect(rowSt1).toMatchObject({ opening: 1, sold: 1, closing: 0 });
    });
  });

  it('пустой период (from==to до появления данных) → все нули', async () => {
    await makePlant(); // создано BEFORE_PERIOD (2026), позже периода 2025
    const res = await getReport('dateFrom=2025-01-01&dateTo=2025-01-01');
    expect(res.status).toBe(200);
    assertIdentity(res.body.rows, res.body.totals);
    expect(res.body.rows).toEqual([]);
    expect(res.body.totals).toMatchObject({
      opening: 0, inflow: 0, sold: 0, writtenOff: 0, transfersNet: 0, closing: 0,
    });
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

    it('owner → 200', async () => {
      const res = await getReport(PERIOD);
      expect(res.status).toBe(200);
    });
  });

  it('кросс-tenant: данные одного питомника не попадают в отчёт другого', async () => {
    const loc = await makeLocation('Локация');
    const p = await makePlant({ location_id: loc.id });
    await addMovement(p.id, saleType.id, { createdAt: IN_APRIL });

    const ctx2 = await createFullFixture();
    // Свой отчёт второго питомника — без чужих данных.
    const own = await getReport(`${PERIOD}&groupBy=location`, ctx2.cookie, ctx2.nurseryId);
    expect(own.status).toBe(200);
    expect(own.body.rows).toEqual([]);
    expect(own.body.totals).toMatchObject({ opening: 0, sold: 0, closing: 0 });

    // Чужой питомник по URL — 403 (requireNurseryAccess).
    const foreign = await getReport(`${PERIOD}&groupBy=location`, ctx2.cookie, ctx.nurseryId);
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
    const loc = await makeLocation('Секция A');
    const plant = await makePlant({ location_id: loc.id });
    await addMovement(plant.id, saleType.id, { createdAt: IN_APRIL });

    const res = await getCsv(`${PERIOD}&groupBy=location&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('filename="stock-flow_2026-03-01.csv"');

    const body = res.body;
    expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
    expect(body).toContain(';'); // разделитель
    expect(body).toContain('Группа;Начало;Приход;Продано;Списано;Перемещения;Конец');
  });
});
