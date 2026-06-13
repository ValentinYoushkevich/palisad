import { describe, expect, it, vi } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  loginCookie,
  register,
  setFreePlan,
  STRONG_PASSWORD,
  uniqueEmail,
} from './helpers.js';

const ACER = {
  usageKey: 3189834,
  scientificName: 'Acer platanoides L.',
  canonicalName: 'Acer platanoides',
  family: 'Sapindaceae',
  genus: 'Acer',
  rank: 'SPECIES',
  status: 'ACCEPTED',
};

vi.mock('@/services/gbif.client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchSpecies: vi.fn(async () => [ACER]),
    matchSpeciesByName: vi.fn(async () => ({ confidence: 99, ...ACER })),
  };
});

describe('Покрытие — дополнительные пути', () => {
  it('удаление фото операции (200/204) и 404 на несуществующее', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Ph' })).body;
    const opBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`;
    const op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' })).body;
    await setFreePlan({ feature_photos: true });
    const photo = (await api().post(`${opBase}/${op.id}/photos`).set('Cookie', ctx.cookie).send({ url: 'https://example.com/p.jpg' })).body;

    const del = await api().delete(`${opBase}/${op.id}/photos/${photo.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(del.status);

    const missing = await api()
      .delete(`${opBase}/${op.id}/photos/00000000-0000-4000-8000-000000000000`)
      .set('Cookie', ctx.cookie);
    expect(missing.status).toBe(404);
  });

  it('поиск вида объединяет локальные и каталожные кандидаты', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}`;
    await api().post(`${base}/species/attach-by-name`).set('Cookie', ctx.cookie).send({ scientific_name: 'Acer platanoides', display_name_ru: 'Клён' });
    const res = await api().get(`${base}/species/search?q=Acer`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('поиск вида с коротким запросом возвращает пусто', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get(`/api/nurseries/${ctx.nurseryId}/species/search?q=A`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('лента с фильтрами по датам → 200', async () => {
    const ctx = await createOwnerWithNursery();
    await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'D' });
    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/activity?dateFrom=2000-01-01&dateTo=2999-01-01`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const logs = res.body.data ?? res.body;
    expect(logs.length).toBeGreaterThan(0);
  });

  it('обновление питомника без питомника → 404', async () => {
    const email = uniqueEmail('nonest');
    await register(email, STRONG_PASSWORD, 'No Nursery');
    const { cookie } = await loginCookie(email, STRONG_PASSWORD);
    const res = await api().patch('/api/nurseries/my').set('Cookie', cookie).send({ name: 'Valid Name' });
    expect(res.status).toBe(404);
  });
});
