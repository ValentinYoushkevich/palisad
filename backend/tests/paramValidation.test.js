import { describe, expect, it } from 'vitest';

import { api, createOwnerWithNursery } from './helpers.js';

// B26: невалидный UUID в path-параметре раньше доходил до Postgres (22P02) и отдавал 500.
// errorHandler теперь мапит 22P02 → 400 (ошибка ввода клиента).
describe('B26 — формат идентификаторов в пути', () => {
  it('кривой UUID в :id растения → 400, не 500', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/plants/not-a-valid-uuid`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(400);
  });
});
