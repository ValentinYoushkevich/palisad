/**
 * Чистка индексов: снять избыточные, добавить недостающие под FK (аудит D9 + D10).
 *
 * D9 — дропаем реально избыточные/неиспользуемые индексы С УЧЁТОМ текущих (пост-D6/D8)
 * запросов. Каждый дроп обратим (down возвращает исходный CREATE):
 *   - idx_plants_qr / idx_plants_numeric_code (init) — после D8 уникальность кодов
 *     держат partial-unique uq_plants_nursery_qr / uq_plants_nursery_numeric_code, а
 *     поиск по коду теперь nursery-scoped (WHERE nursery_id=? AND код=?, см.
 *     plant.repository.findByQrCode/findByNumericCode) и обслуживается их префиксом;
 *   - idx_plants_nursery (init) — все запросы plants по nursery_id фильтруют
 *     deleted_at IS NULL (plant.repository), поэтому перекрыт partial-индексами
 *     idx_plants_active и D6 idx_plants_nursery_created; сканов nursery_id с удалёнными
 *     строками в коде нет;
 *   - idx_plant_tags_plant (init) — дублирует префикс PK plant_tags(plant_id, tag_id);
 *   - idx_species_catalog_usage_key (20260409110000) — дублирует UNIQUE(gbif_usage_key)
 *     (constraint species_catalog_gbif_usage_key_unique создаёт свой btree);
 *   - idx_container_types_nursery / idx_movement_types_nursery /
 *     idx_nursery_species_nursery / idx_production_stages_nursery /
 *     idx_stage_labor_norms_nursery — одиночные индексы по nursery_id, чей префикс
 *     покрыт составным UNIQUE с ведущим nursery_id (UNIQUE(nursery_id, code|slug|…));
 *   - idx_users_role (init) — низкая кардинальность (4 роли), запросов по role нет.
 *
 * НЕ трогаем idx_locations_nursery и idx_users_nursery: их nursery_id НЕ является
 * ведущим столбцом покрывающего составного индекса (locations имеет UNIQUE(id,
 * nursery_id) — ведущий id; у users составной unique по (nursery_id,email) появляется
 * в D11, но он PARTIAL WHERE email IS NOT NULL и не покрывает строки с email=NULL).
 * Индексы D5/D6 не затрагиваем.
 *
 * D10 — добавляем недостающие индексы под FK-столбцы (в т.ч. с ON DELETE-политикой),
 * чтобы удаление родителя не делало seq scan по дочерней таблице и чтобы JOIN'ы по FK
 * были индексированы:
 *   operations.user_id; movements.user_id/from_location_id/to_location_id;
 *   plant_stage_history.stage_id/changed_by; accounts.last_active_nursery_id;
 *   subscriptions.plan_id.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // --- D9: снять избыточные индексы ---
  await knex.raw('DROP INDEX IF EXISTS idx_plants_qr');
  await knex.raw('DROP INDEX IF EXISTS idx_plants_numeric_code');
  await knex.raw('DROP INDEX IF EXISTS idx_plants_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_plant_tags_plant');
  await knex.raw('DROP INDEX IF EXISTS idx_species_catalog_usage_key');
  await knex.raw('DROP INDEX IF EXISTS idx_container_types_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_movement_types_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_nursery_species_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_production_stages_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_stage_labor_norms_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_users_role');

  // --- D10: добавить недостающие индексы под FK ---
  await knex.raw('CREATE INDEX idx_operations_user ON operations(user_id)');
  await knex.raw('CREATE INDEX idx_movements_user ON movements(user_id)');
  await knex.raw('CREATE INDEX idx_movements_from_location ON movements(from_location_id)');
  await knex.raw('CREATE INDEX idx_movements_to_location ON movements(to_location_id)');
  await knex.raw('CREATE INDEX idx_plant_stage_history_stage ON plant_stage_history(stage_id)');
  await knex.raw('CREATE INDEX idx_plant_stage_history_changed_by ON plant_stage_history(changed_by)');
  await knex.raw('CREATE INDEX idx_accounts_last_active_nursery ON accounts(last_active_nursery_id)');
  await knex.raw('CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id)');
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  // --- откат D10: снять добавленные FK-индексы ---
  await knex.raw('DROP INDEX IF EXISTS idx_subscriptions_plan');
  await knex.raw('DROP INDEX IF EXISTS idx_accounts_last_active_nursery');
  await knex.raw('DROP INDEX IF EXISTS idx_plant_stage_history_changed_by');
  await knex.raw('DROP INDEX IF EXISTS idx_plant_stage_history_stage');
  await knex.raw('DROP INDEX IF EXISTS idx_movements_to_location');
  await knex.raw('DROP INDEX IF EXISTS idx_movements_from_location');
  await knex.raw('DROP INDEX IF EXISTS idx_movements_user');
  await knex.raw('DROP INDEX IF EXISTS idx_operations_user');

  // --- откат D9: вернуть избыточные индексы как в исходных миграциях ---
  await knex.raw('CREATE INDEX idx_users_role ON users(role)');
  await knex.raw('CREATE INDEX idx_stage_labor_norms_nursery ON stage_labor_norms(nursery_id)');
  await knex.raw('CREATE INDEX idx_production_stages_nursery ON production_stages(nursery_id)');
  await knex.raw('CREATE INDEX idx_nursery_species_nursery ON nursery_species(nursery_id)');
  await knex.raw('CREATE INDEX idx_movement_types_nursery ON movement_types(nursery_id)');
  await knex.raw('CREATE INDEX idx_container_types_nursery ON container_types(nursery_id)');
  await knex.raw('CREATE INDEX idx_species_catalog_usage_key ON species_catalog(gbif_usage_key)');
  await knex.raw('CREATE INDEX idx_plant_tags_plant ON plant_tags(plant_id)');
  await knex.raw('CREATE INDEX idx_plants_nursery ON plants(nursery_id)');
  await knex.raw('CREATE INDEX idx_plants_numeric_code ON plants(numeric_code)');
  await knex.raw('CREATE INDEX idx_plants_qr ON plants(qr_code)');
}
