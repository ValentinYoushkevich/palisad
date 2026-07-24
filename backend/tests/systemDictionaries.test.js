import { describe, expect, it } from 'vitest';

import { db } from './helpers.js';

// Аудит D5: системные строки справочников (nursery_id IS NULL) защищены partial
// unique индексами по натуральному ключу. globalSetup.js уже засеял системные
// строки (arrival/P9/propagation ...), а setup.js их не чистит между тестами —
// поэтому попытка вставить дубль (тот же slug/code при nursery_id = NULL) должна
// быть отклонена БД. Отклонённый insert ничего не оставляет в таблице.
describe('D5 — partial unique защищает системные строки справочников', () => {
  it('дубль системного movement_type (slug, nursery_id NULL) отклоняется', async () => {
    await expect(
      db('movement_types').insert({ name: 'Дубль поступления', slug: 'arrival' })
    ).rejects.toThrow();
  });

  it('дубль системного container_type (code, nursery_id NULL) отклоняется', async () => {
    await expect(db('container_types').insert({ code: 'P9', name: 'Дубль P9' })).rejects.toThrow();
  });

  it('дубль системной production_stage (slug, nursery_id NULL) отклоняется', async () => {
    await expect(
      db('production_stages').insert({ name: 'Дубль размножения', slug: 'propagation' })
    ).rejects.toThrow();
  });
});
