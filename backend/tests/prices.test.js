import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  api,
  createFullFixture,
  createOwnerWithNursery,
  db,
  systemContainerType,
} from './helpers.js';

// Прямая вставка вида (species_catalog + nursery_species) в заданный питомник.
async function makeSpecies(nurseryId, displayName) {
  const [catalog] = await db('species_catalog')
    .insert({
      gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
      scientific_name: `Sci ${randomUUID()}`,
    })
    .returning('*');
  const [species] = await db('nursery_species')
    .insert({
      nursery_id: nurseryId,
      species_catalog_id: catalog.id,
      display_name_ru: displayName,
    })
    .returning('*');
  return species;
}

// Кастомный (не системный) тип контейнера питомника.
async function makeContainer(nurseryId, code, name) {
  const [container] = await db('container_types')
    .insert({ nursery_id: nurseryId, code, name })
    .returning('*');
  return container;
}

function pricesUrl(nurseryId) {
  return `/api/nurseries/${nurseryId}/prices`;
}

describe('Прайс-лист — Э1 «Экспорт» (species_prices)', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  describe('PUT / — upsert', () => {
    it('создаёт цену, GET возвращает её с подписями вида и контейнера', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Абрикос');
      const container = await makeContainer(ctx.nurseryId, 'CUST1', 'Кастомный 1');

      const putRes = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 100.5 });

      expect(putRes.status).toBe(200);
      expect(putRes.body.nursery_species_id).toBe(species.id);
      expect(putRes.body.container_type_id).toBe(container.id);
      expect(Number(putRes.body.price)).toBe(100.5);

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.cookie);
      expect(getRes.status).toBe(200);
      expect(getRes.body.rows).toHaveLength(1);
      const row = getRes.body.rows[0];
      expect(row).toMatchObject({
        nurserySpeciesId: species.id,
        containerTypeId: container.id,
        speciesName: 'Абрикос',
        containerName: 'Кастомный 1',
        containerCode: 'CUST1',
      });
      expect(Number(row.price)).toBe(100.5);
    });

    it('повторный PUT по той же тройке обновляет цену без дубля (count 1)', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Берёза');
      const container = await systemContainerType('P9');

      await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 50 });
      const second = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 75.25 });

      expect(second.status).toBe(200);
      expect(Number(second.body.price)).toBe(75.25);

      const count = await db('species_prices').where({ nursery_id: ctx.nurseryId }).count('id as c');
      expect(Number(count[0].c)).toBe(1);

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.cookie);
      expect(getRes.body.rows).toHaveLength(1);
      expect(Number(getRes.body.rows[0].price)).toBe(75.25);
    });

    it('разные контейнеры для одного вида → отдельные строки (UNIQUE тройка)', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Вишня');
      const c1 = await systemContainerType('P9');
      const c2 = await systemContainerType('C1');

      await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: c1.id, price: 10 });
      await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: c2.id, price: 20 });

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.cookie);
      expect(getRes.body.rows).toHaveLength(2);
    });

    it('разные виды для одного контейнера → отдельные строки', async () => {
      const s1 = await makeSpecies(ctx.nurseryId, 'Груша');
      const s2 = await makeSpecies(ctx.nurseryId, 'Дуб');
      const container = await systemContainerType('P9');

      await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: s1.id, containerId: container.id, price: 10 });
      await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: s2.id, containerId: container.id, price: 20 });

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.cookie);
      expect(getRes.body.rows).toHaveLength(2);
    });

    it('системный контейнер (nursery_id IS NULL) допустим → 200', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Ель');
      const system = await systemContainerType('C2');
      expect(system.nursery_id).toBeNull();

      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: system.id, price: 33.33 });

      expect(res.status).toBe(200);
      expect(res.body.container_type_id).toBe(system.id);
    });
  });

  describe('PUT / — валидация тела', () => {
    let species;
    let container;

    beforeEach(async () => {
      species = await makeSpecies(ctx.nurseryId, 'Клён');
      container = await systemContainerType('P9');
    });

    it('отрицательная цена → 400', async () => {
      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: -1 });
      expect(res.status).toBe(400);
    });

    it('цена с тремя знаками после запятой → 400', async () => {
      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 1.234 });
      expect(res.status).toBe(400);
    });

    it('отсутствующие поля → 400', async () => {
      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ price: 10 });
      expect(res.status).toBe(400);
    });

    it('невалидный uuid вида → 400', async () => {
      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: 'not-a-uuid', containerId: container.id, price: 10 });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT / — изоляция ссылок (B5/D2)', () => {
    it('вид из ЧУЖОГО питомника → 404', async () => {
      const other = await createOwnerWithNursery();
      const foreignSpecies = await makeSpecies(other.nurseryId, 'Чужой вид');
      const container = await systemContainerType('P9');

      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: foreignSpecies.id, containerId: container.id, price: 10 });
      expect(res.status).toBe(404);
    });

    it('контейнер из ЧУЖОГО питомника → 404', async () => {
      const other = await createOwnerWithNursery();
      const foreignContainer = await makeContainer(other.nurseryId, 'FOREIGN', 'Чужой контейнер');
      const species = await makeSpecies(ctx.nurseryId, 'Липа');

      const res = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: foreignContainer.id, price: 10 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('удаляет цену → 204, после чего GET пуст', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Можжевельник');
      const container = await systemContainerType('P9');
      const putRes = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 10 });

      const delRes = await api()
        .delete(`${pricesUrl(ctx.nurseryId)}/${putRes.body.id}`)
        .set('Cookie', ctx.cookie);
      expect(delRes.status).toBe(204);

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.cookie);
      expect(getRes.body.rows).toHaveLength(0);
    });

    it('несуществующий id → 404', async () => {
      const res = await api()
        .delete(`${pricesUrl(ctx.nurseryId)}/${randomUUID()}`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(404);
    });

    it('цена из ЧУЖОГО питомника → 404 (скоуп по nursery_id)', async () => {
      const other = await createOwnerWithNursery();
      const foreignSpecies = await makeSpecies(other.nurseryId, 'Чужой вид');
      const container = await systemContainerType('P9');
      const putRes = await api()
        .put(pricesUrl(other.nurseryId))
        .set('Cookie', other.cookie)
        .send({ speciesId: foreignSpecies.id, containerId: container.id, price: 10 });

      const res = await api()
        .delete(`${pricesUrl(ctx.nurseryId)}/${putRes.body.id}`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('Кросс-тенант видимость', () => {
    it('цены питомника A не видны в GET питомника B', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Сосна');
      const container = await systemContainerType('P9');
      await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 10 });

      const other = await createOwnerWithNursery();
      const getB = await api().get(pricesUrl(other.nurseryId)).set('Cookie', other.cookie);
      expect(getB.status).toBe(200);
      expect(getB.body.rows).toHaveLength(0);
    });
  });

  describe('RBAC — только структурные роли (owner/agronomist)', () => {
    it('agronomist имеет доступ (GET/PUT)', async () => {
      const species = await makeSpecies(ctx.nurseryId, 'Тополь');
      const container = await systemContainerType('P9');

      const putRes = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.agronomist.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 10 });
      expect(putRes.status).toBe(200);

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.agronomist.cookie);
      expect(getRes.status).toBe(200);
    });

    it.each([
      ['worker', 'worker'],
      ['observer', 'observer'],
    ])('%s получает 403 на GET/PUT/DELETE', async (_label, roleKey) => {
      const cookie = ctx[roleKey].cookie;

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', cookie);
      expect(getRes.status).toBe(403);

      const putRes = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', cookie)
        .send({ speciesId: randomUUID(), containerId: randomUUID(), price: 10 });
      expect(putRes.status).toBe(403);

      const delRes = await api()
        .delete(`${pricesUrl(ctx.nurseryId)}/${randomUUID()}`)
        .set('Cookie', cookie);
      expect(delRes.status).toBe(403);
    });
  });

  describe('feature_export НЕ гейтит прайс-лист', () => {
    it('на free-плане (feature_export=false) GET/PUT работают', async () => {
      const plan = await db('plans').where({ slug: 'free' }).first();
      expect(plan.feature_export).toBe(false);

      const species = await makeSpecies(ctx.nurseryId, 'Яблоня');
      const container = await systemContainerType('P9');

      const putRes = await api()
        .put(pricesUrl(ctx.nurseryId))
        .set('Cookie', ctx.cookie)
        .send({ speciesId: species.id, containerId: container.id, price: 10 });
      expect(putRes.status).toBe(200);

      const getRes = await api().get(pricesUrl(ctx.nurseryId)).set('Cookie', ctx.cookie);
      expect(getRes.status).toBe(200);
      expect(getRes.body.rows).toHaveLength(1);
    });
  });
});
