import { beforeEach, describe, expect, it } from 'vitest';

import { NOTIFICATION_TYPES } from '@/constants/notification.constants.js';
import { notify } from '@/utils/notify.js';
import { api, createFullFixture, createOwnerWithNursery, db, setFreePlan } from './helpers.js';

describe('Этап 2 — Уведомления', () => {
  let ctx;
  let base;

  beforeEach(async () => {
    ctx = await createFullFixture();
    base = `/api/nurseries/${ctx.nurseryId}/notifications`;
  });

  describe('хелпер notify()', () => {
    it('создаёт строку уведомления', async () => {
      const row = await notify({
        nurseryId: ctx.nurseryId,
        userId: ctx.owner.id,
        type: NOTIFICATION_TYPES.SYNC_CONFLICT,
        payload: { foo: 'bar' },
      });
      expect(row).toBeTruthy();
      const stored = await db('notifications').where({ id: row.id }).first();
      expect(stored.user_id).toBe(ctx.owner.id);
      expect(stored.is_read).toBe(false);
      expect(stored.payload).toEqual({ foo: 'bar' });
    });

    it('не бросает при некорректных данных', async () => {
      const row = await notify({ nurseryId: null, userId: null, type: null });
      expect(row).toBeNull();
    });
  });

  describe('GET /notifications', () => {
    it('возвращает уведомления текущего юзера и unreadCount', async () => {
      await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.SYNC_CONFLICT });
      await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });

      const res = await api().get(base).set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.unreadCount).toBe(2);
      expect(res.body.total).toBe(2);
    });

    it('не показывает чужие уведомления', async () => {
      await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.SYNC_CONFLICT });

      const res = await api().get(base).set('Cookie', ctx.observer.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.unreadCount).toBe(0);
    });

    it('?unread=true фильтрует прочитанные', async () => {
      const a = await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });
      await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });
      await db('notifications').where({ id: a.id }).update({ is_read: true });

      const res = await api().get(`${base}?unread=true`).set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.unreadCount).toBe(1);
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('помечает уведомление прочитанным', async () => {
      const n = await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });

      const res = await api().patch(`${base}/${n.id}/read`).set('Cookie', ctx.cookie);
      expect(res.status).toBe(204);
      const stored = await db('notifications').where({ id: n.id }).first();
      expect(stored.is_read).toBe(true);
    });

    it('чужое уведомление недоступно (404)', async () => {
      const n = await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });

      const res = await api().patch(`${base}/${n.id}/read`).set('Cookie', ctx.observer.cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /notifications/read-all', () => {
    it('сбрасывает счётчик непрочитанных', async () => {
      await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });
      await notify({ nurseryId: ctx.nurseryId, userId: ctx.owner.id, type: NOTIFICATION_TYPES.TASK_DUE });

      const res = await api().post(`${base}/read-all`).set('Cookie', ctx.cookie);
      expect(res.status).toBe(204);

      const check = await api().get(base).set('Cookie', ctx.cookie);
      expect(check.body.unreadCount).toBe(0);
    });
  });

  describe('продюсер: смена роли сотрудника', () => {
    it('создаёт уведомление адресату', async () => {
      const res = await api()
        .patch(`/api/nurseries/${ctx.nurseryId}/users/${ctx.agronomist.user.id}/role`)
        .set('Cookie', ctx.cookie)
        .send({ role: 'worker' });
      expect(res.status).toBe(200);

      const list = await api()
        .get(`${base}?unread=true`)
        .set('Cookie', ctx.agronomist.cookie);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].type).toBe(NOTIFICATION_TYPES.ROLE_CHANGED);
      expect(list.body.data[0].payload.role).toBe('worker');
    });
  });

  describe('изоляция между питомниками', () => {
    it('уведомление из другого питомника не видно', async () => {
      await setFreePlan({ user_limit: 50, plant_limit: 1000 });
      const other = await createOwnerWithNursery({ nurseryName: 'Other Nursery' });
      await notify({
        nurseryId: other.nurseryId,
        userId: other.owner.id,
        type: NOTIFICATION_TYPES.SYNC_CONFLICT,
      });

      const res = await api().get(base).set('Cookie', ctx.cookie);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
