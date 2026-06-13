import { describe, expect, it } from 'vitest';

import { api, createFullFixture, createOwnerWithNursery, setFreePlan } from './helpers.js';

describe('Edge-кейсы сервисов', () => {
  it('plant_limit = null → безлимитное создание (201)', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ plant_limit: null });
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/plants`)
      .set('Cookie', ctx.cookie)
      .send({ variety: 'Unlimited' });
    expect(res.status).toBe(201);
  });

  it('автор редактирует свою операцию → 200', async () => {
    const ctx = await createFullFixture();
    const plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Op' })).body;
    const opBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`;
    const op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection', notes: 'mine' })).body;
    const res = await api().patch(`${opBase}/${op.id}`).set('Cookie', ctx.cookie).send({ notes: 'edited' });
    expect(res.status).toBe(200);
  });

  it('редактирование несуществующей операции → 404', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Op' })).body;
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations/00000000-0000-4000-8000-000000000000`)
      .set('Cookie', ctx.cookie)
      .send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('список операций растения → 200', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Op' })).body;
    const opBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`;
    await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' });
    const res = await api().get(opBase).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
  });

  it('обновление локации (имя и перенос) → 200', async () => {
    const ctx = await createOwnerWithNursery();
    const locBase = `/api/nurseries/${ctx.nurseryId}/locations`;
    const area1 = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'Area 1', type: 'area' })).body;
    const area2 = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'Area 2', type: 'area' })).body;
    const section = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'Sec', type: 'section', parentId: area1.id })).body;

    const rename = await api().patch(`${locBase}/${section.id}`).set('Cookie', ctx.cookie).send({ name: 'Sec Renamed' });
    expect(rename.status).toBe(200);

    const move = await api().patch(`${locBase}/${section.id}`).set('Cookie', ctx.cookie).send({ parentId: area2.id });
    expect(move.status).toBe(200);
  });

  it('обновление несуществующей локации → 404', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/locations/00000000-0000-4000-8000-000000000000`)
      .set('Cookie', ctx.cookie)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});
