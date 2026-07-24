/**
 * Недостающие ограничения целостности справочников и подписок (аудит D11 + D12 + D13).
 *
 * D11 — уникальность в пределах питомника:
 *   - tags: UNIQUE(nursery_id, name) PARTIAL WHERE is_active = true. У tags нет
 *     deleted_at; «удаление» тега — soft-delete через is_active=false
 *     (dictionary.service.deleteTag). Partial по активным строкам не мешает завести
 *     новый тег с именем ранее удалённого (деактивированного).
 *   - users: UNIQUE(nursery_id, email) PARTIAL WHERE email IS NOT NULL. email nullable;
 *     у users нет deleted_at (деактивация — is_active), но email — идентификатор входа,
 *     поэтому уникальность держим по ВСЕМ строкам с непустым email (в т.ч. неактивным):
 *     реактивация не должна создавать двусмысленный логин.
 *
 * D12 — «одна активная подписка на аккаунт»: partial UNIQUE ON subscriptions(account_id)
 *   WHERE status = 'active'. Существующий idx_subscriptions_active (init) НЕ unique и
 *   покрывает status IN ('trial','active') — он остаётся как индекс под выборки. Флоу
 *   (auth.register → trial; subscription.service.expireOverdue → ровно одна active free
 *   на аккаунт) держит не более одной active-строки; индекс это фиксирует на уровне БД.
 *
 * D13 — stage_labor_norms: CHECK(norm_minutes > 0) и CHECK(operation_type IN <канон>)
 *   по OPERATION_TYPES из src/constants/operation.constants.js.
 *
 * PROD-ЗАМЕТКА (D11, D12): на проде с уже существующими дублями CREATE UNIQUE INDEX
 * упадёт — перед накатом нужна дедупликация:
 *   - активные теги с одинаковым (nursery_id, name);
 *   - активные пользователи с одинаковым (nursery_id, email);
 *   - более одной подписки status='active' на account_id.
 * На тестовой palisad_test индексы создаются на пустых таблицах (сид системных строк
 * идёт после migrate.latest), поэтому применяются без конфликтов.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // --- D11 ---
  await knex.raw(
    'CREATE UNIQUE INDEX uq_tags_nursery_name ON tags (nursery_id, name) WHERE is_active = true'
  );
  await knex.raw(
    'CREATE UNIQUE INDEX uq_users_nursery_email ON users (nursery_id, email) WHERE email IS NOT NULL'
  );

  // --- D12 ---
  await knex.raw(
    "CREATE UNIQUE INDEX uq_subscriptions_active_account ON subscriptions (account_id) WHERE status = 'active'"
  );

  // --- D13 ---
  await knex.raw(
    'ALTER TABLE stage_labor_norms ADD CONSTRAINT chk_stage_labor_norms_minutes CHECK (norm_minutes > 0)'
  );
  await knex.raw(
    "ALTER TABLE stage_labor_norms ADD CONSTRAINT chk_stage_labor_norms_operation_type CHECK (operation_type IN ('grafting', 'pruning', 'treatment', 'transplant', 'change_stage', 'inspection', 'other'))"
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE stage_labor_norms DROP CONSTRAINT IF EXISTS chk_stage_labor_norms_operation_type');
  await knex.raw('ALTER TABLE stage_labor_norms DROP CONSTRAINT IF EXISTS chk_stage_labor_norms_minutes');
  await knex.raw('DROP INDEX IF EXISTS uq_subscriptions_active_account');
  await knex.raw('DROP INDEX IF EXISTS uq_users_nursery_email');
  await knex.raw('DROP INDEX IF EXISTS uq_tags_nursery_name');
}
