// Системные производственные стадии (nursery_id IS NULL — общие для всех питомников).
// Держим здесь, чтобы переиспользовать в сидах (dev seed + tests/globalSetup).
export const SYSTEM_STAGES = [
  { name: 'Размножение', slug: 'propagation', sort_order: 1 },
  { name: 'Подвой (Liner)', slug: 'liner', sort_order: 2 },
  { name: 'Контейнер', slug: 'container', sort_order: 3 },
  { name: 'Поле', slug: 'field', sort_order: 4 },
];
