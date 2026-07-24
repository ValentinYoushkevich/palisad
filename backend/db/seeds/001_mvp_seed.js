import argon2 from 'argon2';

// Продакшен-справочники (системные строки: nursery_id = NULL).
const PLAN_FREE = {
  name: 'Free',
  slug: 'free',
  plant_limit: 1000,
  user_limit: 3,
  nursery_limit: 1,
  feature_tags: true,
  feature_operations: true,
  feature_qr: true,
  feature_photos: false,
  feature_export: false,
  is_active: true,
};

const MOVEMENT_TYPES = [
  { name: 'Поступление', slug: 'arrival', is_system: true, sets_status: 'growing', is_active: true },
  { name: 'Продажа', slug: 'sale', is_system: true, sets_status: 'sold', is_active: true },
  { name: 'Списание', slug: 'write_off', is_system: true, sets_status: 'written_off', is_active: true },
  { name: 'Перемещение', slug: 'transfer', is_system: true, sets_status: null, is_active: true },
];

const CONTAINER_TYPES = [
  { code: 'P9', name: 'Горшок P9 (9x9 см)', container_kind: 'pot', volume_liters: null, side_cm: 9, is_system: true, is_active: true },
  { code: 'C1', name: 'Контейнер C1 (1 л)', container_kind: 'pot', volume_liters: 1, side_cm: null, is_system: true, is_active: true },
  { code: 'C2', name: 'Контейнер C2 (2 л)', container_kind: 'pot', volume_liters: 2, side_cm: null, is_system: true, is_active: true },
  { code: 'C3', name: 'Контейнер C3 (3 л)', container_kind: 'pot', volume_liters: 3, side_cm: null, is_system: true, is_active: true },
  { code: 'C5', name: 'Контейнер C5 (5 л)', container_kind: 'pot', volume_liters: 5, side_cm: null, is_system: true, is_active: true },
  { code: 'C10', name: 'Контейнер C10 (10 л)', container_kind: 'pot', volume_liters: 10, side_cm: null, is_system: true, is_active: true },
  { code: 'C15', name: 'Контейнер C15 (15 л)', container_kind: 'pot', volume_liters: 15, side_cm: null, is_system: true, is_active: true },
  { code: 'C25', name: 'Контейнер C25 (25 л)', container_kind: 'pot', volume_liters: 25, side_cm: null, is_system: true, is_active: true },
  { code: 'C35', name: 'Контейнер C35 (35 л)', container_kind: 'pot', volume_liters: 35, side_cm: null, is_system: true, is_active: true },
  { code: 'OKS', name: 'Открытый грунт (ОКС)', container_kind: 'open_root', volume_liters: null, side_cm: null, is_system: true, is_active: true },
  { code: 'TRENCH', name: 'Прикоп', container_kind: 'trench', volume_liters: null, side_cm: null, is_system: true, is_active: true },
  { code: 'GREENHOUSE', name: 'Теплица', container_kind: 'greenhouse', volume_liters: null, side_cm: null, is_system: true, is_active: true },
  { code: 'COLD_STORAGE', name: 'Холодное хранение', container_kind: 'cold_room', volume_liters: null, side_cm: null, is_system: true, is_active: true },
];

const PRODUCTION_STAGES = [
  { name: 'Размножение', slug: 'propagation', sort_order: 1, is_system: true, is_active: true },
  { name: 'Подвой (Liner)', slug: 'liner', sort_order: 2, is_system: true, is_active: true },
  { name: 'Контейнер', slug: 'container', sort_order: 3, is_system: true, is_active: true },
  { name: 'Поле', slug: 'field', sort_order: 4, is_system: true, is_active: true },
];

// Демо-данные (только dev).
const DEMO_EMAIL = 'admin.owner@palisad.local';
const DEMO_USERS = [
  { name: 'Admin User', role: 'owner', email: 'admin.owner@palisad.local' },
  { name: 'Agronomist User', role: 'agronomist', email: 'agronomist@palisad.local' },
  { name: 'Worker User', role: 'worker', email: 'worker@palisad.local' },
  { name: 'Observer User', role: 'observer', email: 'observer@palisad.local' },
];

/**
 * Идемпотентный upsert системных строк справочника по натуральному ключу.
 * У таблиц movement_types / container_types / production_stages uniqueKey
 * составной с NULLABLE nursery_id, а PostgreSQL считает NULL-ы в UNIQUE
 * РАЗЛИЧНЫМИ — поэтому onConflict(...).merge() по составному ключу не ловит
 * дубли системных строк. Применяем insert-if-not-exists при nursery_id IS NULL.
 * @param {import('knex').Knex} knex
 */
async function upsertSystemRows(knex, table, naturalKey, rows) {
  for (const row of rows) {
    const existing = await knex(table)
      .whereNull('nursery_id')
      .where(naturalKey, row[naturalKey])
      .first();
    if (existing) {
      await knex(table).where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
    } else {
      await knex(table).insert({ ...row, nursery_id: null });
    }
  }
}

/**
 * План Free: slug — одностолбцовый UNIQUE, поэтому onConflict('slug').merge()
 * безопасно обновляет строку при повторном запуске (без del()).
 * @param {import('knex').Knex} knex
 */
async function provisionPlans(knex) {
  await knex('plans').insert(PLAN_FREE).onConflict('slug').merge();
}

/**
 * Демо-данные для dev. Идемпотентно: если демо-аккаунт уже есть — выходим,
 * иначе повторный запуск упал бы на UNIQUE по accounts.email.
 * @param {import('knex').Knex} knex
 */
async function seedDemoData(knex) {
  const existing = await knex('accounts').where({ email: DEMO_EMAIL }).first();
  if (existing) {
    return;
  }
  const [plan] = await knex('plans').select('id').where({ slug: 'free' }).limit(1);
  const passwordHash = await argon2.hash('dev12345');

  const [account] = await knex('accounts')
    .insert({ email: DEMO_EMAIL, password_hash: passwordHash, name: 'Admin Owner Account' })
    .returning(['id']);

  const [nursery] = await knex('nurseries')
    .insert({ account_id: account.id, name: 'Dev Nursery', address: 'Local environment' })
    .returning(['id']);

  await knex('subscriptions').insert({
    account_id: account.id,
    plan_id: plan.id,
    status: 'active',
    started_at: knex.fn.now(),
  });

  await knex('users').insert(
    DEMO_USERS.map((user) => ({
      nursery_id: nursery.id,
      name: user.name,
      role: user.role,
      password_hash: passwordHash,
      email: user.email,
      is_active: true,
      must_change_password: false,
    }))
  );
}

/**
 * Идемпотентный сид, безопасный для прода.
 * Все верхнеуровневые del() убраны: безусловный del() по accounts/plans/
 * movement_types и т.д. в проде удалил бы все аккаунты и каскадом данные всех
 * tenant'ов, а movement_types.del() падал бы на FK из movements.type_id.
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  await provisionPlans(knex);
  await upsertSystemRows(knex, 'movement_types', 'slug', MOVEMENT_TYPES);
  await upsertSystemRows(knex, 'container_types', 'code', CONTAINER_TYPES);
  await upsertSystemRows(knex, 'production_stages', 'slug', PRODUCTION_STAGES);

  // Демо-данные только для dev-окружения.
  if (process.env.NODE_ENV !== 'production') {
    await seedDemoData(knex);
  }
}
