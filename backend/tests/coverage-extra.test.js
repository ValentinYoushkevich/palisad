import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  loginCookie,
  register,
  setFreePlan,
  STRONG_PASSWORD,
  uniqueEmail,
} from './helpers.js';

// Валидный 1x1 PNG (для multipart-загрузки фото). Байты сравниваем на content-эндпоинте.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

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
  // Фото операций хранятся как байты (bytea), загрузка через multipart (F13 / B18).
  describe('фото операций как байты', () => {
    let ctx;
    let plantId;
    let opBase;
    let op;

    function uploadPng(cookie = ctx.cookie) {
      return api()
        .post(`${opBase}/${op.id}/photos`)
        .set('Cookie', cookie)
        .attach('file', PNG_1x1, { filename: 'p.png', contentType: 'image/png' });
    }

    beforeEach(async () => {
      ctx = await createOwnerWithNursery();
      const plant = (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety: 'Ph' })).body;
      plantId = plant.id;
      opBase = `/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/operations`;
      op = (await api().post(opBase).set('Cookie', ctx.cookie).send({ type: 'inspection' })).body;
    });

    it('загрузка при feature_photos=true → 201 + метаданные (без байтов)', async () => {
      await setFreePlan({ feature_photos: true });
      const res = await uploadPng();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ operation_id: op.id, mime_type: 'image/png', size: PNG_1x1.length });
      expect(res.body.id).toBeTruthy();
      expect(res.body.created_at).toBeTruthy();
      expect(res.body.image).toBeUndefined();
      expect(res.body.url).toBeUndefined();
    });

    it('список операций содержит метаданные фото (без байтов)', async () => {
      await setFreePlan({ feature_photos: true });
      await uploadPng();
      const list = await api().get(opBase).set('Cookie', ctx.cookie);
      expect(list.status).toBe(200);
      const ops = list.body.items ?? list.body;
      const found = ops.find((o) => o.id === op.id);
      expect(found.photos).toHaveLength(1);
      expect(found.photos[0]).toMatchObject({ mime_type: 'image/png', size: PNG_1x1.length });
      expect(found.photos[0].image).toBeUndefined();
    });

    it('удаление фото (204) и 404 на несуществующее', async () => {
      await setFreePlan({ feature_photos: true });
      const photo = (await uploadPng()).body;

      const del = await api().delete(`${opBase}/${op.id}/photos/${photo.id}`).set('Cookie', ctx.cookie);
      expect(del.status).toBe(204);

      const missing = await api()
        .delete(`${opBase}/${op.id}/photos/00000000-0000-4000-8000-000000000000`)
        .set('Cookie', ctx.cookie);
      expect(missing.status).toBe(404);
    });

    it('слишком большой файл (>512 КБ) → 413', async () => {
      await setFreePlan({ feature_photos: true });
      const big = Buffer.alloc(512 * 1024 + 1, 1);
      const res = await api()
        .post(`${opBase}/${op.id}/photos`)
        .set('Cookie', ctx.cookie)
        .attach('file', big, { filename: 'big.png', contentType: 'image/png' });
      expect(res.status).toBe(413);
    });

    it('не-image файл → 415', async () => {
      await setFreePlan({ feature_photos: true });
      const res = await api()
        .post(`${opBase}/${op.id}/photos`)
        .set('Cookie', ctx.cookie)
        .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
      expect(res.status).toBe(415);
    });

    it('неверное имя поля файла → 400', async () => {
      await setFreePlan({ feature_photos: true });
      const res = await api()
        .post(`${opBase}/${op.id}/photos`)
        .set('Cookie', ctx.cookie)
        .attach('wrong', PNG_1x1, { filename: 'p.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
    });

    it('фича выключена (free) → 403', async () => {
      const res = await uploadPng();
      expect(res.status).toBe(403);
    });

    it('GET content отдаёт байты с правильным Content-Type', async () => {
      await setFreePlan({ feature_photos: true });
      const photo = (await uploadPng()).body;
      const res = await api()
        .get(`${opBase}/${op.id}/photos/${photo.id}/content`)
        .set('Cookie', ctx.cookie)
        .buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['cache-control']).toBe('private');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.equals(PNG_1x1)).toBe(true);
    });

    it('GET content несуществующего фото → 404', async () => {
      await setFreePlan({ feature_photos: true });
      const res = await api()
        .get(`${opBase}/${op.id}/photos/00000000-0000-4000-8000-000000000000/content`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(404);
    });

    it('кросс-tenant GET content → 404', async () => {
      await setFreePlan({ feature_photos: true });
      const photo = (await uploadPng()).body;

      // Второй питомник (нужен поднятый nursery_limit — по умолчанию free=1).
      await setFreePlan({ feature_photos: true, nursery_limit: 5 });
      const other = await createOwnerWithNursery({ nurseryName: 'Other' });

      // Атака: свой nurseryId в URL, но plant/op/photo — чужие (из ctx).
      const res = await api()
        .get(`/api/nurseries/${other.nurseryId}/plants/${plantId}/operations/${op.id}/photos/${photo.id}/content`)
        .set('Cookie', other.cookie);
      expect(res.status).toBe(404);
    });
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
