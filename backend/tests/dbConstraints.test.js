import { beforeEach, describe, expect, it } from 'vitest';

import { createOwnerWithNursery, db } from './helpers.js';

// Ограничения целостности на уровне БД (аудит D11/D12/D13). Проверяем именно поведение
// СУБД: пишем напрямую через db (в обход сервисов/валидаторов), чтобы убедиться, что
// нарушение ловит сама схема (partial-unique / CHECK), а не только app-слой.
describe('DB constraints — D11/D12/D13', () => {
  let ctx;
  let freePlanId;

  beforeEach(async () => {
    ctx = await createOwnerWithNursery();
    const freePlan = await db('plans').where({ slug: 'free' }).first();
    freePlanId = freePlan.id;
  });

  // D11: uq_tags_nursery_name (nursery_id, name) WHERE is_active = true.
  describe('D11 — уникальность тегов в питомнике', () => {
    it('дубль активного тега с тем же (nursery_id, name) → отказ', async () => {
      await db('tags').insert({
        nursery_id: ctx.nurseryId,
        name: 'Полив',
        color: '#123456',
        is_active: true,
      });

      await expect(
        db('tags').insert({
          nursery_id: ctx.nurseryId,
          name: 'Полив',
          color: '#654321',
          is_active: true,
        })
      ).rejects.toThrow();
    });

    it('имя деактивированного тега можно переиспользовать (partial WHERE is_active) → ок', async () => {
      await db('tags').insert({
        nursery_id: ctx.nurseryId,
        name: 'Обрезка',
        color: '#123456',
        is_active: false,
      });

      await expect(
        db('tags').insert({
          nursery_id: ctx.nurseryId,
          name: 'Обрезка',
          color: '#654321',
          is_active: true,
        })
      ).resolves.toBeDefined();
    });
  });

  // D12: uq_subscriptions_active_account (account_id) WHERE status = 'active'.
  describe('D12 — одна активная подписка на аккаунт', () => {
    it('вторая active-подписка на тот же account_id → отказ', async () => {
      // При регистрации у аккаунта уже есть trial-подписка. Первая active — ок
      // (trial + active сосуществуют), вторая active — нарушает partial-unique.
      await db('subscriptions').insert({
        account_id: ctx.account.id,
        plan_id: freePlanId,
        status: 'active',
      });

      await expect(
        db('subscriptions').insert({
          account_id: ctx.account.id,
          plan_id: freePlanId,
          status: 'active',
        })
      ).rejects.toThrow();
    });

    it('trial и active на одном аккаунте сосуществуют → ок', async () => {
      // trial уже создан регистрацией; добавляем ровно одну active.
      await expect(
        db('subscriptions').insert({
          account_id: ctx.account.id,
          plan_id: freePlanId,
          status: 'active',
        })
      ).resolves.toBeDefined();
    });
  });

  // D13: chk_stage_labor_norms_minutes и chk_stage_labor_norms_operation_type.
  describe('D13 — нормы трудозатрат стадий', () => {
    let stageId;

    beforeEach(async () => {
      const stage = await db('production_stages').whereNull('nursery_id').first();
      stageId = stage.id;
    });

    it('norm_minutes = 0 → отказ (CHECK norm_minutes > 0)', async () => {
      await expect(
        db('stage_labor_norms').insert({
          nursery_id: ctx.nurseryId,
          stage_id: stageId,
          operation_type: 'grafting',
          norm_minutes: 0,
        })
      ).rejects.toThrow();
    });

    it('norm_minutes < 0 → отказ', async () => {
      await expect(
        db('stage_labor_norms').insert({
          nursery_id: ctx.nurseryId,
          stage_id: stageId,
          operation_type: 'pruning',
          norm_minutes: -5,
        })
      ).rejects.toThrow();
    });

    it('невалидный operation_type → отказ (CHECK по канону)', async () => {
      await expect(
        db('stage_labor_norms').insert({
          nursery_id: ctx.nurseryId,
          stage_id: stageId,
          operation_type: 'not_a_real_type',
          norm_minutes: 15,
        })
      ).rejects.toThrow();
    });

    it('валидная норма (operation_type из канона, norm_minutes > 0) → ок', async () => {
      await expect(
        db('stage_labor_norms').insert({
          nursery_id: ctx.nurseryId,
          stage_id: stageId,
          operation_type: 'change_stage',
          norm_minutes: 30,
        })
      ).resolves.toBeDefined();
    });
  });
});
