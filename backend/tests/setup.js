// Пер-тестовый сброс пользовательских данных. Используем DELETE (а не TRUNCATE),
// чтобы row-level каскады удалили только данные аккаунтов, оставив СИСТЕМНЫЕ строки
// (free-план, системные movement_types/container_types с nursery_id = NULL).
import { afterAll, beforeEach } from 'vitest';

import db from '@/config/knex.js';

const FREE_DEFAULTS = {
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

beforeEach(async () => {
  // Удаление аккаунтов каскадит подписки, питомники и всё вложенное (users, locations,
  // plants, operations, photos, movements, activity_logs, nursery_species, tags,
  // nursery-scoped movement_types/container_types).
  await db('accounts').del();
  await db('species_catalog').del();
  await db('plans').whereNot({ slug: 'free' }).del();
  await db('plans').where({ slug: 'free' }).update(FREE_DEFAULTS);
});

afterAll(async () => {
  await db.destroy();
});
