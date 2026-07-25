import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  api,
  createFullFixture,
  createOwnerWithNursery,
  db,
  setFreePlan,
  systemContainerType,
} from './helpers.js';

describe('Экспорт — Э3 «прайс-лист» (price-list export)', () => {
  let ctx;

  // Прямая вставка активного растения с контролируемыми видом/контейнером/статусом.
  async function makePlant(overrides = {}, nurseryId = ctx.nurseryId) {
    const [plant] = await db('plants')
      .insert({
        nursery_id: nurseryId,
        qr_code: `qr-${randomUUID()}`,
        numeric_code: `nc-${randomUUID()}`,
        status: 'growing',
        ...overrides,
      })
      .returning('*');
    return plant;
  }

  // Вид с заданными научным (species_catalog) и локальным (nursery_species) названиями.
  async function makeSpecies(displayName, scientificName = `Sci ${randomUUID()}`, nurseryId = ctx.nurseryId) {
    const [catalog] = await db('species_catalog')
      .insert({
        gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
        scientific_name: scientificName,
      })
      .returning('*');
    const [species] = await db('nursery_species')
      .insert({ nursery_id: nurseryId, species_catalog_id: catalog.id, display_name_ru: displayName })
      .returning('*');
    return { ...species, scientific_name: scientificName };
  }

  async function makeContainer(code, name, nurseryId = ctx.nurseryId) {
    const [container] = await db('container_types')
      .insert({ nursery_id: nurseryId, code, name })
      .returning('*');
    return container;
  }

  async function setPrice(speciesId, containerId, price, nurseryId = ctx.nurseryId) {
    await db('species_prices').insert({
      nursery_id: nurseryId,
      nursery_species_id: speciesId,
      container_type_id: containerId,
      price,
    });
  }

  function getList(query = '', cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    const suffix = query ? `?${query}` : '';
    return api()
      .get(`/api/nurseries/${nurseryId}/exports/price-list${suffix}`)
      .set('Cookie', cookie);
  }

  // CSV-тело читаем как UTF-8 строку (BOM сохраняется).
  function getCsv(query, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/exports/price-list?${query}`)
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

  describe('логика формирования позиций', () => {
    // Общий сид: A(Acer/Клён) priced 100.50 за C1; B(Betula/Берёза) без цены;
    // активные A/C1 ×3, B/C1 ×2, A/C2 ×1 (C2 без цены).
    async function seedBase() {
      const a = await makeSpecies('Клён', 'Acer');
      const b = await makeSpecies('Берёза', 'Betula');
      const c1 = await makeContainer('C1', 'Кон C1');
      const c2 = await makeContainer('C2', 'Кон C2');

      await setPrice(a.id, c1.id, 100.5);

      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: b.id, container_id: c1.id });
      await makePlant({ nursery_species_id: b.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c2.id });

      return { a, b, c1, c2 };
    }

    it('default (includeUnpriced=false): только позиции С ценой', async () => {
      await seedBase();

      const res = await getList();
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ currency: 'BYN', includeUnpriced: false });
      expect(res.body.meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.meta.nurseryName).toBe('Test Nursery');

      // Только A/C1 (priced, count 3); B/C1 и A/C2 исключены (нет цены).
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0]).toMatchObject({
        scientificName: 'Acer',
        speciesName: 'Клён',
        containerName: 'Кон C1',
        count: 3,
        price: '100.50',
      });
      expect(res.body.total).toBe(3);
    });

    it('includeUnpriced=true: все позиции с наличием, цена может быть пустой', async () => {
      await seedBase();

      const res = await getList('includeUnpriced=true');
      expect(res.status).toBe(200);
      expect(res.body.meta.includeUnpriced).toBe(true);
      expect(res.body.rows).toHaveLength(3);

      const acC1 = res.body.rows.find((r) => r.scientificName === 'Acer' && r.containerName === 'Кон C1');
      const acC2 = res.body.rows.find((r) => r.scientificName === 'Acer' && r.containerName === 'Кон C2');
      const beC1 = res.body.rows.find((r) => r.scientificName === 'Betula');
      expect(acC1).toMatchObject({ count: 3, price: '100.50' });
      expect(acC2).toMatchObject({ speciesName: 'Клён', count: 1, price: null });
      expect(beC1).toMatchObject({ speciesName: 'Берёза', count: 2, price: null });

      expect(res.body.total).toBe(6);
    });

    it('сортировка: научное имя → локальное → контейнер', async () => {
      await seedBase();
      const res = await getList('includeUnpriced=true');
      const order = res.body.rows.map((r) => `${r.scientificName}/${r.containerName}`);
      expect(order).toEqual(['Acer/Кон C1', 'Acer/Кон C2', 'Betula/Кон C1']);
    });

    it('availability 0: цена без активных растений — никогда не появляется', async () => {
      const a = await makeSpecies('Клён', 'Acer');
      const ghost = await makeSpecies('Призрак', 'Ghost');
      const c1 = await makeContainer('C1', 'Кон C1');

      await setPrice(a.id, c1.id, 10);
      await setPrice(ghost.id, c1.id, 999); // цена есть, растений нет
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });

      const res = await getList('includeUnpriced=true');
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows.some((r) => r.scientificName === 'Ghost')).toBe(false);
    });

    it('из наличия исключены sold / written_off / soft-deleted', async () => {
      const a = await makeSpecies('Клён', 'Acer');
      const c1 = await makeContainer('C1', 'Кон C1');
      await setPrice(a.id, c1.id, 100.5);

      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id, status: 'sold' });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id, status: 'written_off' });
      await makePlant({
        nursery_species_id: a.id,
        container_id: c1.id,
        deleted_at: '2026-01-01T00:00:00Z',
      });

      const res = await getList();
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].count).toBe(3);
      expect(res.body.total).toBe(3);
    });

    it('позиция без вида (nursery_species_id IS NULL) исключена', async () => {
      const a = await makeSpecies('Клён', 'Acer');
      const c1 = await makeContainer('C1', 'Кон C1');
      await setPrice(a.id, c1.id, 10);

      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: null, container_id: c1.id }); // без вида

      const res = await getList('includeUnpriced=true');
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].scientificName).toBe('Acer');
      expect(res.body.total).toBe(1);
    });
  });

  describe('CSV', () => {
    it('BOM, блок-шапка, заголовки таблицы, имя файла, строка «Всего»', async () => {
      const a = await makeSpecies('Клён', 'Acer');
      const c1 = await makeContainer('C1', 'Кон C1');
      await setPrice(a.id, c1.id, 100.5);
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });

      const res = await getCsv('format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toMatch(/filename="price-list_\d{4}-\d{2}-\d{2}\.csv"/);

      const body = res.body;
      expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      // Блок-шапка: имя питомника, дата, «Цены в BYN».
      expect(body).toContain('Test Nursery');
      expect(body).toMatch(/\r\n\d{4}-\d{2}-\d{2}\r\n/);
      expect(body).toContain('Цены в BYN');
      // Заголовок таблицы и итоговая строка.
      expect(body).toContain('Научное название;Вид;Контейнер;В наличии, шт;Цена, BYN');
      expect(body).toContain('Acer;Клён;Кон C1;2;100.50');
      expect(body).toContain('Всего;;;2;');
    });

    it('имя питомника с ; и " экранируется в блок-шапке', async () => {
      const special = await createOwnerWithNursery({ nurseryName: 'Ёлки; "Био"' });
      await setFreePlan({ feature_export: true });

      const a = await makeSpecies('Клён', 'Acer', special.nurseryId);
      const c1 = await makeContainer('C1', 'Кон C1', special.nurseryId);
      await setPrice(a.id, c1.id, 10, special.nurseryId);
      await makePlant({ nursery_species_id: a.id, container_id: c1.id }, special.nurseryId);

      const res = await getCsv('format=csv', special.cookie, special.nurseryId);
      expect(res.status).toBe(200);
      expect(res.body).toContain('"Ёлки; ""Био"""');
    });

    it('название вида с ; и " экранируется в строке данных', async () => {
      const a = await makeSpecies('Ель; "колючая"', 'Picea; "pungens"');
      const c1 = await makeContainer('C1', 'Кон C1');
      await setPrice(a.id, c1.id, 10);
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });

      const res = await getCsv('format=csv');
      expect(res.body).toContain('"Picea; ""pungens"""');
      expect(res.body).toContain('"Ель; ""колючая"""');
    });
  });

  describe('изоляция и доступ', () => {
    it('данные чужого питомника не попадают в выгрузку', async () => {
      const a = await makeSpecies('Клён', 'Acer');
      const c1 = await makeContainer('C1', 'Кон C1');
      await setPrice(a.id, c1.id, 10);
      await makePlant({ nursery_species_id: a.id, container_id: c1.id });

      const other = await createFullFixture();
      await setFreePlan({ feature_export: true });
      const res = await getList('includeUnpriced=true', other.cookie, other.nurseryId);
      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('worker → 403', async () => {
      const res = await getList('', ctx.worker.cookie);
      expect(res.status).toBe(403);
    });

    it('observer → 403', async () => {
      const res = await getList('', ctx.observer.cookie);
      expect(res.status).toBe(403);
    });

    it('agronomist → 200', async () => {
      const res = await getList('', ctx.agronomist.cookie);
      expect(res.status).toBe(200);
    });
  });

  describe('гейт feature_export', () => {
    it('feature_export=false → 403 (json, дефолтный free-план)', async () => {
      await setFreePlan({ feature_export: false });
      const res = await getList();
      expect(res.status).toBe(403);
    });

    it('feature_export=false → 403 (csv)', async () => {
      await setFreePlan({ feature_export: false });
      const res = await getList('format=csv');
      expect(res.status).toBe(403);
    });
  });

  describe('валидация query (400)', () => {
    it('невалидный format → 400', async () => {
      const res = await getList('format=xml');
      expect(res.status).toBe(400);
    });

    it('systemContainerType доступен как справочник (санити)', async () => {
      // Санити: системный контейнер существует — используется прайс-листом как контейнер.
      const p9 = await systemContainerType('P9');
      expect(p9).toBeTruthy();
    });
  });
});
