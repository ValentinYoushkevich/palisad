import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db, systemMovementType } from './helpers.js';

const PERIOD = 'dateFrom=2026-03-01&dateTo=2026-06-30';
const BEFORE_PERIOD = '2026-01-01T00:00:00Z';
const IN_MARCH = '2026-03-15T00:00:00Z';
const IN_APRIL = '2026-04-10T00:00:00Z';

describe('Отчёты — Э1 «списания» (write-offs)', () => {
  let ctx;
  let writeOffType;

  // Прямая вставка растения с контролируемой датой создания (для «остатка на начало»).
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

  // Прямая вставка списания (движение с системным типом write_off) на заданную дату.
  async function writeOff(plantId, createdAt, quantity = 1) {
    await db('movements').insert({
      plant_id: plantId,
      type_id: writeOffType.id,
      quantity,
      created_at: createdAt,
    });
  }

  function getReport(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/reports/write-offs?${query}`)
      .set('Cookie', cookie);
  }

  // Надёжно читаем CSV-тело как UTF-8 строку (BOM сохраняется).
  function getCsv(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/reports/write-offs?${query}`)
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
    writeOffType = await systemMovementType('write_off');
  });

  it('happy path (groupBy=month): totals, opening, rate, доли по месяцам', async () => {
    const plants = await Promise.all([
      makePlant(),
      makePlant(),
      makePlant(),
      makePlant(),
      makePlant(),
    ]);
    await writeOff(plants[0].id, IN_MARCH);
    await writeOff(plants[1].id, IN_MARCH);
    await writeOff(plants[2].id, IN_APRIL);

    const res = await getReport(PERIOD); // groupBy по умолчанию = month
    expect(res.status).toBe(200);
    expect(res.body.totalWrittenOff).toBe(3);
    expect(res.body.openingCount).toBe(5);
    expect(res.body.rate).toBe(0.6);

    const rows = res.body.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: '2026-03', count: 2 });
    expect(rows[1]).toMatchObject({ key: '2026-04', count: 1 });
    const sumShares = rows.reduce((acc, r) => acc + r.share, 0);
    expect(Math.abs(sumShares - 1)).toBeLessThan(0.01);
    expect(res.body.period.from).toContain('2026-03-01');
    expect(res.body.period.to).toContain('2026-06-30');
  });

  it('SUM(quantity) учитывает quantity > 1', async () => {
    const plant = await makePlant();
    await writeOff(plant.id, IN_MARCH, 7);

    const res = await getReport(PERIOD);
    expect(res.status).toBe(200);
    expect(res.body.totalWrittenOff).toBe(7);
  });

  it('groupBy=location: раскладка и подписи по локациям, null → «Без локации»', async () => {
    const [loc1] = await db('locations')
      .insert({ nursery_id: ctx.nurseryId, name: 'Теплица 1', type: 'section' })
      .returning('*');

    const p1 = await makePlant({ location_id: loc1.id });
    const p2 = await makePlant({ location_id: loc1.id });
    const p3 = await makePlant({ location_id: null }); // без локации
    await writeOff(p1.id, IN_MARCH);
    await writeOff(p2.id, IN_MARCH);
    await writeOff(p3.id, IN_APRIL);

    const res = await getReport(`${PERIOD}&groupBy=location`);
    expect(res.status).toBe(200);
    expect(res.body.totalWrittenOff).toBe(3);
    // Сортировка по убыванию count: loc1 (2) впереди «Без локации» (1).
    expect(res.body.rows[0]).toMatchObject({ key: loc1.id, label: 'Теплица 1', count: 2 });
    const noLoc = res.body.rows.find((r) => r.key === null);
    expect(noLoc).toMatchObject({ label: 'Без локации', count: 1 });
  });

  it('groupBy=species: подпись из display_name_ru, null → «Без вида»', async () => {
    const [catalog] = await db('species_catalog')
      .insert({
        gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
        scientific_name: 'Acer platanoides',
      })
      .returning('*');
    const [species] = await db('nursery_species')
      .insert({
        nursery_id: ctx.nurseryId,
        species_catalog_id: catalog.id,
        display_name_ru: 'Клён остролистный',
      })
      .returning('*');

    const p1 = await makePlant({ nursery_species_id: species.id });
    const p2 = await makePlant({ nursery_species_id: null });
    await writeOff(p1.id, IN_MARCH);
    await writeOff(p2.id, IN_MARCH);

    const res = await getReport(`${PERIOD}&groupBy=species`);
    expect(res.status).toBe(200);
    const withSpecies = res.body.rows.find((r) => r.key === species.id);
    expect(withSpecies).toMatchObject({ label: 'Клён остролистный', count: 1 });
    expect(res.body.rows.find((r) => r.key === null)).toMatchObject({ label: 'Без вида' });
  });

  it('пустой период → totalWrittenOff 0, rows [], rate 0', async () => {
    const plant = await makePlant();
    await writeOff(plant.id, IN_MARCH);

    const res = await getReport('dateFrom=2025-01-01&dateTo=2025-06-30');
    expect(res.status).toBe(200);
    expect(res.body.totalWrittenOff).toBe(0);
    expect(res.body.rows).toEqual([]);
    expect(res.body.rate).toBe(0);
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

  it('кросс-tenant: списания одного питомника не утекают в отчёт другого', async () => {
    const plant = await makePlant();
    await writeOff(plant.id, IN_MARCH);

    const ctx2 = await createFullFixture();
    // Свой отчёт второго питомника — без чужих данных.
    const ownReport = await getReport(PERIOD, ctx2.cookie, ctx2.nurseryId);
    expect(ownReport.status).toBe(200);
    expect(ownReport.body.totalWrittenOff).toBe(0);
    expect(ownReport.body.rows).toEqual([]);

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
      const res = await getReport(`${PERIOD}&groupBy=xyz`);
      expect(res.status).toBe(400);
    });

    it('отсутствует dateFrom → 400', async () => {
      const res = await getReport('dateTo=2026-06-30');
      expect(res.status).toBe(400);
    });
  });

  it('CSV: заголовки, BOM, разделитель, имя файла и экранирование спецсимволов', async () => {
    // Имя локации со спецсимволами ; и " — проверяем экранирование в CSV.
    const trickyName = 'Секция; "A"';
    const [loc] = await db('locations')
      .insert({ nursery_id: ctx.nurseryId, name: trickyName, type: 'section' })
      .returning('*');
    const plant = await makePlant({ location_id: loc.id });
    await writeOff(plant.id, IN_MARCH);

    const res = await getCsv(`${PERIOD}&groupBy=location&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('filename="write-offs_2026-03-01.csv"');

    const body = res.body;
    expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
    expect(body).toContain(';'); // разделитель
    expect(body).toContain('Группа;Списано;Доля');
    // Спецсимволы: поле в кавычках, внутренние " удвоены.
    expect(body).toContain('"Секция; ""A"""');
  });
});
