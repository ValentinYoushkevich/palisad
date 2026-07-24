import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db, systemMovementType } from './helpers.js';

// Идемпотентность повторной доставки офлайн-очереди (F2 / T6): повторный POST с тем же
// clientRequestId для одного растения создаёт РОВНО одну запись и возвращает её же, без
// дублирования и повторных побочных эффектов. Без ключа дедуп не применяется.
describe('F2 — Идемпотентность офлайн-синхронизации', () => {
  let ctx;
  let plant;
  let opBase;
  let mvBase;

  beforeEach(async () => {
    ctx = await createFullFixture();
    plant = (
      await api()
        .post(`/api/nurseries/${ctx.nurseryId}/plants`)
        .set('Cookie', ctx.cookie)
        .send({ variety: 'Sync plant' })
    ).body;
    opBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`;
    mvBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/movements`;
  });

  it('create_operation идемпотентен по clientRequestId', async () => {
    const clientRequestId = randomUUID();

    const first = await api()
      .post(opBase)
      .set('Cookie', ctx.cookie)
      .send({ type: 'inspection', clientRequestId });
    const second = await api()
      .post(opBase)
      .set('Cookie', ctx.cookie)
      .send({ type: 'inspection', clientRequestId });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const rows = await db('operations').where({ plant_id: plant.id });
    expect(rows).toHaveLength(1);
  });

  it('movement идемпотентен по clientRequestId', async () => {
    const transfer = await systemMovementType('transfer');
    const clientRequestId = randomUUID();

    const first = await api()
      .post(mvBase)
      .set('Cookie', ctx.cookie)
      .send({ typeId: transfer.id, clientRequestId });
    const second = await api()
      .post(mvBase)
      .set('Cookie', ctx.cookie)
      .send({ typeId: transfer.id, clientRequestId });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const rows = await db('movements').where({ plant_id: plant.id });
    expect(rows).toHaveLength(1);
  });

  it('без clientRequestId дублирование не блокируется', async () => {
    await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' });
    await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' });

    const rows = await db('operations').where({ plant_id: plant.id });
    expect(rows).toHaveLength(2);
  });
});
