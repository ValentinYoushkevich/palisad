import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db, setFreePlan, systemContainerType } from './helpers.js';

describe('M10 — Операции и фото', () => {
  let ctx;
  let plant;
  let opBase;

  beforeEach(async () => {
    ctx = await createFullFixture();
    plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Op plant' })).body;
    opBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`;
  });

  it('операция требует feature_operations → 403', async () => {
    await setFreePlan({ feature_operations: false });
    const res = await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' });
    expect(res.status).toBe(403);
  });

  it('операция для проданного растения → 400', async () => {
    await db('plants').where({ id: plant.id }).update({ status: 'sold' });
    const res = await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' });
    expect(res.status).toBe(400);
  });

  it('создание операции (201) и редактирование чужой → 403', async () => {
    const op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection', notes: 'mine' })).body;
    const res = await api().patch(`${opBase}/${op.id}`).set('Cookie', ctx.agronomist.cookie).send({ notes: 'hacked' });
    expect(res.status).toBe(403);
  });

  it('owner может удалить любую операцию', async () => {
    const op = (await api().post(opBase).set('Cookie', ctx.agronomist.cookie).send({ type: 'pruning', notes: 'by agro' })).body;
    const res = await api().delete(`${opBase}/${op.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(res.status);
  });

  it('фото требует feature_photos → 403', async () => {
    const op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' })).body;
    const res = await api().post(`${opBase}/${op.id}/photos`).set('Cookie', ctx.cookie).send({ url: 'https://example.com/p.jpg' });
    expect(res.status).toBe(403);
  });

  it('фото прикрепляется при feature_photos=true', async () => {
    const op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' })).body;
    await setFreePlan({ feature_photos: true });
    const res = await api().post(`${opBase}/${op.id}/photos`).set('Cookie', ctx.cookie).send({ url: 'https://example.com/p.jpg' });
    expect(res.status).toBe(201);
  });

  it('transplant обновляет plants.container_id', async () => {
    const ct2 = await systemContainerType('C2');
    const res = await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'transplant', newContainerId: ct2.id });
    expect(res.status).toBe(201);
    const updated = await db('plants').where({ id: plant.id }).first();
    expect(updated.container_id).toBe(ct2.id);
  });

  it('мягкое удаление операции — не в списке', async () => {
    const op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'other', notes: 'to delete' })).body;
    const del = await api().delete(`${opBase}/${op.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(del.status);
    const row = await db('operations').where({ id: op.id }).first();
    expect(row.deleted_at).not.toBeNull();
    const list = await api().get(opBase).set('Cookie', ctx.cookie);
    const ops = list.body.items ?? list.body;
    expect(ops.some((o) => o.id === op.id)).toBe(false);
  });

  it('observer не может создать операцию → 403', async () => {
    const res = await api().post(opBase).set('Cookie', ctx.observer.cookie).send({ type: 'inspection' });
    expect(res.status).toBe(403);
  });
});
