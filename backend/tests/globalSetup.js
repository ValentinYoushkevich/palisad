// Глобальная подготовка тестовой БД: создать palisad_test (если нет), накатить
// миграции и засеять только СИСТЕМНЫЕ данные (free-план, системные типы движений и
// контейнеров) — без dev-аккаунта. Пользовательские данные чистятся в tests/setup.js.
import 'dotenv/config';

import knex from 'knex';

const TEST_DB = 'palisad_test';

const baseConnection = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

const FREE_PLAN = {
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

const SYSTEM_MOVEMENT_TYPES = [
  { name: 'Поступление', slug: 'arrival', is_system: true, sets_status: 'growing', is_active: true },
  { name: 'Продажа', slug: 'sale', is_system: true, sets_status: 'sold', is_active: true },
  { name: 'Списание', slug: 'write_off', is_system: true, sets_status: 'written_off', is_active: true },
  { name: 'Перемещение', slug: 'transfer', is_system: true, sets_status: null, is_active: true },
];

const SYSTEM_PRODUCTION_STAGES = [
  { name: 'Размножение', slug: 'propagation', sort_order: 1, is_system: true, is_active: true },
  { name: 'Подвой (Liner)', slug: 'liner', sort_order: 2, is_system: true, is_active: true },
  { name: 'Контейнер', slug: 'container', sort_order: 3, is_system: true, is_active: true },
  { name: 'Поле', slug: 'field', sort_order: 4, is_system: true, is_active: true },
];

const SYSTEM_CONTAINER_TYPES = [
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

export async function setup() {
  // 0. Ранняя валидация окружения. Без полного набора DB_* служебное подключение к
  //    postgres падает невнятно (ECONNREFUSED / password authentication failed) уже на
  //    этапе connect — поэтому сначала явно проверяем обязательные переменные.
  const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'];
  const missingEnv = REQUIRED_ENV.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === '';
  });
  if (missingEnv.length) {
    throw new Error(
      `Неполное тестовое окружение: не заданы обязательные переменные ${missingEnv.join(', ')}. ` +
        'Проверьте backend/.env (см. .env.example) перед запуском тестов.',
    );
  }

  // 1. Создать тестовую БД, если её нет (через служебное подключение к основной БД).
  const admin = knex({
    client: 'pg',
    connection: { ...baseConnection, database: process.env.DB_NAME || 'palisad' },
  });
  try {
    const { rows } = await admin.raw('SELECT 1 FROM pg_database WHERE datname = ?', [TEST_DB]);
    if (!rows.length) {
      await admin.raw(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await admin.destroy();
  }

  // 2. Миграции + системный сид на тестовой БД.
  const db = knex({
    client: 'pg',
    connection: { ...baseConnection, database: TEST_DB },
    migrations: { directory: './db/migrations' },
  });
  try {
    await db.migrate.latest();
    await db('accounts').del();
    await db('species_catalog').del();
    await db('plans').del();
    await db('movement_types').del();
    await db('container_types').del();
    await db('production_stages').del();
    await db('plans').insert(FREE_PLAN);
    await db('movement_types').insert(SYSTEM_MOVEMENT_TYPES);
    await db('container_types').insert(SYSTEM_CONTAINER_TYPES);
    await db('production_stages').insert(SYSTEM_PRODUCTION_STAGES);
  } finally {
    await db.destroy();
  }
}
