import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, createOwnerWithNursery, db, setFreePlan } from './helpers.js';

describe('Этап 3 — Производственные стадии', () => {
  let ctx;
  let stagesBase;
  let normsBase;

  beforeEach(async () => {
    ctx = await createFullFixture();
    stagesBase = `/api/nurseries/${ctx.nurseryId}/production-stages`;
    normsBase = `/api/nurseries/${ctx.nurseryId}/stage-labor-norms`;
  });

  async function listStages(cookie = ctx.cookie) {
    const res = await api().get(stagesBase).set('Cookie', cookie);
    return res.body;
  }

  async function makePlant() {
    return (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Stage plant' })).body;
  }

  describe('справочник стадий', () => {
    it('системные стадии видны питомнику (4 шт.)', async () => {
      const stages = await listStages();
      const system = stages.filter((s) => s.is_system);
      expect(system.length).toBe(4);
      expect(system.map((s) => s.slug)).toEqual(['propagation', 'liner', 'container', 'field']);
    });

    it('создание кастомной стадии → 201', async () => {
      const res = await api().post(stagesBase).set('Cookie', ctx.cookie).send({ name: 'Закалка', slug: 'hardening', sort_order: 5 });
      expect(res.status).toBe(201);
      expect(res.body.is_system).toBe(false);
      const stages = await listStages();
      expect(stages.some((s) => s.slug === 'hardening')).toBe(true);
    });

    it('системную стадию нельзя изменить (403)', async () => {
      const stages = await listStages();
      const system = stages.find((s) => s.is_system);
      const res = await api().patch(`${stagesBase}/${system.id}`).set('Cookie', ctx.cookie).send({ name: 'Hack' });
      expect(res.status).toBe(403);
    });

    it('кастомную стадию можно деактивировать', async () => {
      const created = (await api().post(stagesBase).set('Cookie', ctx.cookie).send({ name: 'Temp', slug: 'temp' })).body;
      const res = await api().delete(`${stagesBase}/${created.id}`).set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
      const row = await db('production_stages').where({ id: created.id }).first();
      expect(row.is_active).toBe(false);
    });

    it('observer не может создавать стадии (403)', async () => {
      const res = await api().post(stagesBase).set('Cookie', ctx.observer.cookie).send({ name: 'X', slug: 'x' });
      expect(res.status).toBe(403);
    });
  });

  describe('операция change_stage', () => {
    it('обновляет plants.stage_id и пишет историю', async () => {
      const plant = await makePlant();
      const stages = await listStages();
      const target = stages.find((s) => s.slug === 'container');

      const res = await api()
        .post(`/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`)
        .set('Cookie', ctx.cookie)
        .send({ type: 'change_stage', newStageId: target.id, notes: 'на контейнер' });
      expect(res.status).toBe(201);

      const updated = await db('plants').where({ id: plant.id }).first();
      expect(updated.stage_id).toBe(target.id);

      const history = await db('plant_stage_history').where({ plant_id: plant.id });
      expect(history).toHaveLength(1);
      expect(history[0].stage_id).toBe(target.id);
    });

    it('без newStageId → 400', async () => {
      const plant = await makePlant();
      const res = await api()
        .post(`/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`)
        .set('Cookie', ctx.cookie)
        .send({ type: 'change_stage' });
      expect(res.status).toBe(400);
    });

    it('история стадий возвращается в карточке растения', async () => {
      const plant = await makePlant();
      const stages = await listStages();
      const target = stages.find((s) => s.slug === 'liner');
      await api()
        .post(`/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`)
        .set('Cookie', ctx.cookie)
        .send({ type: 'change_stage', newStageId: target.id });

      const card = await api().get(`/api/nurseries/${ctx.nurseryId}/plants/${plant.id}`).set('Cookie', ctx.cookie);
      expect(card.status).toBe(200);
      expect(card.body.stageHistory).toHaveLength(1);
      expect(card.body.stageHistory[0].stage_slug).toBe('liner');
    });
  });

  describe('фильтр реестра по стадии', () => {
    it('возвращает только растения нужной стадии', async () => {
      const stages = await listStages();
      const target = stages.find((s) => s.slug === 'field');
      const a = await makePlant();
      await makePlant();
      await api()
        .post(`/api/nurseries/${ctx.nurseryId}/plants/${a.id}/operations`)
        .set('Cookie', ctx.cookie)
        .send({ type: 'change_stage', newStageId: target.id });

      const res = await api().get(`/api/nurseries/${ctx.nurseryId}/plants?stageId=${target.id}`).set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(a.id);
      expect(res.body.data[0].stage_slug).toBe('field');
    });
  });

  describe('нормы трудозатрат', () => {
    it('CRUD нормы', async () => {
      const stages = await listStages();
      const stage = stages.find((s) => s.slug === 'propagation');

      const created = await api().post(normsBase).set('Cookie', ctx.cookie).send({ stage_id: stage.id, operation_type: 'grafting', norm_minutes: 15 });
      expect(created.status).toBe(201);

      const list = await api().get(normsBase).set('Cookie', ctx.cookie);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].stage_name).toBeTruthy();

      const updated = await api().patch(`${normsBase}/${created.body.id}`).set('Cookie', ctx.cookie).send({ norm_minutes: 20 });
      expect(updated.status).toBe(200);
      expect(updated.body.norm_minutes).toBe(20);

      const removed = await api().delete(`${normsBase}/${created.body.id}`).set('Cookie', ctx.cookie);
      expect(removed.status).toBe(204);
      const after = await api().get(normsBase).set('Cookie', ctx.cookie);
      expect(after.body).toHaveLength(0);
    });

    it('дубликат (stage+operation) → 500/409 (unique)', async () => {
      const stages = await listStages();
      const stage = stages.find((s) => s.slug === 'propagation');
      await api().post(normsBase).set('Cookie', ctx.cookie).send({ stage_id: stage.id, operation_type: 'pruning', norm_minutes: 10 });
      const dup = await api().post(normsBase).set('Cookie', ctx.cookie).send({ stage_id: stage.id, operation_type: 'pruning', norm_minutes: 12 });
      expect(dup.status).toBe(409);
    });
  });

  describe('изоляция между питомниками', () => {
    it('кастомная стадия и норма не видны другому питомнику', async () => {
      const custom = (await api().post(stagesBase).set('Cookie', ctx.cookie).send({ name: 'Privé', slug: 'prive' })).body;

      await setFreePlan({ user_limit: 50, plant_limit: 1000 });
      const other = await createOwnerWithNursery({ nurseryName: 'Other Nursery' });
      const otherStages = await api().get(`/api/nurseries/${other.nurseryId}/production-stages`).set('Cookie', other.cookie);
      expect(otherStages.body.some((s) => s.id === custom.id)).toBe(false);
      // системные при этом видны обоим
      expect(otherStages.body.filter((s) => s.is_system)).toHaveLength(4);
    });
  });
});
