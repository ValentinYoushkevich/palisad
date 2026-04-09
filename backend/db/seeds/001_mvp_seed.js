import argon2 from 'argon2';

/**
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  await knex('subscriptions').del();
  await knex('users').del();
  await knex('nurseries').del();
  await knex('accounts').del();
  await knex('plans').del();
  await knex('movement_types').del();
  await knex('container_types').del();

  await knex('plans').insert({
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
  });

  await knex('movement_types').insert([
    { name: 'Поступление', slug: 'arrival', is_system: true, sets_status: 'growing', is_active: true },
    { name: 'Продажа', slug: 'sale', is_system: true, sets_status: 'sold', is_active: true },
    { name: 'Списание', slug: 'write_off', is_system: true, sets_status: 'written_off', is_active: true },
    { name: 'Перемещение', slug: 'transfer', is_system: true, sets_status: null, is_active: true },
  ]);

  await knex('container_types').insert([
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
  ]);

  if (process.env.NODE_ENV !== 'production') {
    const [plan] = await knex('plans').select('id').where({ slug: 'free' }).limit(1);
    const passwordHash = await argon2.hash('dev12345');

    const [account] = await knex('accounts')
      .insert({
        email: 'admin.owner@palisad.local',
        password_hash: passwordHash,
        name: 'Admin Owner Account',
      })
      .returning(['id']);

    const [nursery] = await knex('nurseries')
      .insert({
        account_id: account.id,
        name: 'Dev Nursery',
        address: 'Local environment',
      })
      .returning(['id']);

    await knex('subscriptions').insert({
      account_id: account.id,
      plan_id: plan.id,
      status: 'active',
      started_at: knex.fn.now(),
    });

    await knex('users').insert([
      {
        nursery_id: nursery.id,
        name: 'Admin User',
        role: 'owner',
        password_hash: passwordHash,
        email: 'admin.owner@palisad.local',
        is_active: true,
        must_change_password: false,
      },
      {
        nursery_id: nursery.id,
        name: 'Agronomist User',
        role: 'agronomist',
        password_hash: passwordHash,
        email: 'agronomist@palisad.local',
        is_active: true,
        must_change_password: false,
      },
      {
        nursery_id: nursery.id,
        name: 'Worker User',
        role: 'worker',
        password_hash: passwordHash,
        email: 'worker@palisad.local',
        is_active: true,
        must_change_password: false,
      },
      {
        nursery_id: nursery.id,
        name: 'Observer User',
        role: 'observer',
        password_hash: passwordHash,
        email: 'observer@palisad.local',
        is_active: true,
        must_change_password: false,
      },
    ]);
  }
}
