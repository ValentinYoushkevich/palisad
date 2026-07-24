import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db, systemMovementType } from './helpers.js';

describe('M11 — Движения', () => {
  let ctx;
  let plant;
  let section;
  let place;
  let mvBase;
  let transfer;
  let sale;

  beforeEach(async () => {
    ctx = await createFullFixture();
    const locBase = `/api/nurseries/${ctx.nurseryId}/locations`;
    const area = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'A', type: 'area' })).body;
    section = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'S', type: 'section', parentId: area.id })).body;
    const row = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'R', type: 'row', parentId: section.id })).body;
    place = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'P', type: 'place', parentId: row.id })).body;
    plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Mv plant', locationId: place.id })).body;
    mvBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/movements`;
    transfer = await systemMovementType('transfer');
    sale = await systemMovementType('sale');
  });

  it('type_id ссылается на movement_types и to_location обновляет plants.location_id', async () => {
    const res = await api().post(mvBase).set('Cookie', ctx.cookie).send({ typeId: transfer.id, toLocationId: section.id });
    expect(res.status).toBe(201);
    const row = await db('movements').where({ id: res.body.id }).first();
    expect(row.type_id).toBe(transfer.id);
    const updatedPlant = await db('plants').where({ id: plant.id }).first();
    expect(updatedPlant.location_id).toBe(section.id);
  });

  it('sets_status меняет статус растения (sale → sold)', async () => {
    await api().post(mvBase).set('Cookie', ctx.cookie).send({ typeId: sale.id });
    const sold = await db('plants').where({ id: plant.id }).first();
    expect(sold.status).toBe('sold');
  });

  it('движение для проданного растения → 400', async () => {
    await api().post(mvBase).set('Cookie', ctx.cookie).send({ typeId: sale.id });
    const res = await api().post(mvBase).set('Cookie', ctx.cookie).send({ typeId: transfer.id, toLocationId: section.id });
    expect(res.status).toBe(400);
  });

  it('worker может создать движение → 201', async () => {
    const res = await api().post(mvBase).set('Cookie', ctx.worker.cookie).send({ typeId: transfer.id, toLocationId: place.id });
    expect(res.status).toBe(201);
  });

  it('observer не может создать движение → 403', async () => {
    const res = await api().post(mvBase).set('Cookie', ctx.observer.cookie).send({ typeId: transfer.id });
    expect(res.status).toBe(403);
  });

  it('удаление движения worker → 403', async () => {
    const mv = (await api().post(mvBase).set('Cookie', ctx.worker.cookie).send({ typeId: transfer.id, toLocationId: place.id })).body;
    const res = await api().delete(`${mvBase}/${mv.id}`).set('Cookie', ctx.worker.cookie);
    expect(res.status).toBe(403);
  });

  it('история движений содержит имена локаций', async () => {
    await api().post(mvBase).set('Cookie', ctx.cookie).send({ typeId: transfer.id, toLocationId: section.id });
    const res = await api().get(mvBase).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const list = res.body.items ?? res.body;
    expect(list.some((m) => 'from_location_name' in m && 'to_location_name' in m)).toBe(true);
  });

  it('owner может удалить движение → 200/204', async () => {
    const mv = (await api().post(mvBase).set('Cookie', ctx.cookie).send({ typeId: transfer.id, toLocationId: place.id })).body;
    const res = await api().delete(`${mvBase}/${mv.id}`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(204);
  });
});
