import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  db,
  setFreePlan,
  systemContainerType,
  systemMovementType,
  toCookieHeader,
} from './helpers.js';

// GBIF мокаем: attach-by-name (нужен для получения nursery_species из питомника A)
// не должен ходить в сеть. Чистые функции (resolveSpeciesFromMatch, mapGbifSpecies)
// оставляем настоящими — как в dictionary.test.js.
const ACER = {
  usageKey: 3189834,
  scientificName: 'Acer platanoides L.',
  canonicalName: 'Acer platanoides',
  authorship: 'L.',
  rank: 'SPECIES',
  status: 'ACCEPTED',
  family: 'Sapindaceae',
  genus: 'Acer',
};

vi.mock('@/services/gbif.client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchSpecies: vi.fn(async () => [ACER]),
    matchSpeciesByName: vi.fn(async () => ({ confidence: 99, ...ACER })),
  };
});

let uniqCounter = 0;
function uniq(prefix) {
  uniqCounter += 1;
  return `${prefix}-${Date.now()}-${uniqCounter}`;
}

function plantsUrl(nurseryId) {
  return `/api/nurseries/${nurseryId}/plants`;
}

async function createPlant(ctx, body = {}) {
  return (await api().post(plantsUrl(ctx.nurseryId)).set('Cookie', ctx.cookie).send({ variety: 'V', ...body })).body;
}

// МОДЕЛЬ АТАКИ: requireNurseryAccess сверяет :nurseryId в URL с nurseryId из JWT.
// Атакующий B подставляет СВОЙ nurseryId в URL (проходит guard), но id вложенного
// ресурса — ЧУЖОЙ (из питомника A). Целевое поведение после починки IDOR — 404.
describe('T4 — изоляция данных между питомниками (IDOR, B1–B7)', () => {
  let A;
  let B;
  let plantA;
  let plantB;

  beforeEach(async () => {
    await setFreePlan({
      plant_limit: 1000,
      user_limit: 50,
      nursery_limit: 5,
      feature_tags: true,
      feature_operations: true,
      feature_photos: true,
    });
    A = await createOwnerWithNursery({ nurseryName: 'Nursery A' });
    B = await createOwnerWithNursery({ nurseryName: 'Nursery B' });
    plantA = await createPlant(A, { variety: 'Plant A' });
    plantB = await createPlant(B, { variety: 'Plant B' });
  });

  // B1: чтение операций чужого растения через свой nurseryId.
  it('B1: GET operations чужого растения (B.nurseryId + plantA.id) → 404', async () => {
    const res = await api()
      .get(`/api/nurseries/${B.nurseryId}/plants/${plantA.id}/operations`)
      .set('Cookie', B.cookie);
    expect(res.status).toBe(404);
  });

  // B2: правка/удаление чужой операции.
  it('B2: PATCH и DELETE чужой операции → 404', async () => {
    const opA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/plants/${plantA.id}/operations`)
      .set('Cookie', A.cookie)
      .send({ type: 'inspection', notes: 'A' })).body;

    const patch = await api()
      .patch(`/api/nurseries/${B.nurseryId}/plants/${plantA.id}/operations/${opA.id}`)
      .set('Cookie', B.cookie)
      .send({ notes: 'hacked' });
    const del = await api()
      .delete(`/api/nurseries/${B.nurseryId}/plants/${plantA.id}/operations/${opA.id}`)
      .set('Cookie', B.cookie);

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });

  // B3: прикрепление/удаление фото чужой операции (feature_photos поднят).
  it('B3: POST и DELETE фото чужой операции → 404', async () => {
    const opA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/plants/${plantA.id}/operations`)
      .set('Cookie', A.cookie)
      .send({ type: 'inspection' })).body;
    const photoA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/plants/${plantA.id}/operations/${opA.id}/photos`)
      .set('Cookie', A.cookie)
      .send({ url: 'https://example.com/a.jpg' })).body;

    const post = await api()
      .post(`/api/nurseries/${B.nurseryId}/plants/${plantA.id}/operations/${opA.id}/photos`)
      .set('Cookie', B.cookie)
      .send({ url: 'https://example.com/hack.jpg' });
    const del = await api()
      .delete(`/api/nurseries/${B.nurseryId}/plants/${plantA.id}/operations/${opA.id}/photos/${photoA.id}`)
      .set('Cookie', B.cookie);

    expect(post.status).toBe(404);
    expect(del.status).toBe(404);
  });

  // B4: чтение движений чужого растения.
  it('B4: GET movements чужого растения (B.nurseryId + plantA.id) → 404', async () => {
    const res = await api()
      .get(`/api/nurseries/${B.nurseryId}/plants/${plantA.id}/movements`)
      .set('Cookie', B.cookie);
    expect(res.status).toBe(404);
  });

  // B6: привязка/отвязка чужого тега к своему растению.
  it('B6: POST и DELETE чужого тега на своё растение → 404', async () => {
    const tagA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/tags`)
      .set('Cookie', A.cookie)
      .send({ name: 'Tag A', color: '#00FF00' })).body;

    const post = await api()
      .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/tags/${tagA.id}`)
      .set('Cookie', B.cookie);
    const del = await api()
      .delete(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/tags/${tagA.id}`)
      .set('Cookie', B.cookie);

    expect(post.status).toBe(404);
    expect(del.status).toBe(404);
  });

  // B7: движение своего растения с КАСТОМНЫМ типом движения из чужого питомника.
  it('B7: POST movement с чужим КАСТОМНЫМ typeId → 404', async () => {
    const mtA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/movement-types`)
      .set('Cookie', A.cookie)
      .send({ name: 'MT A', slug: uniq('mta'), sets_status: 'growing' })).body;

    const res = await api()
      .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/movements`)
      .set('Cookie', B.cookie)
      .send({ typeId: mtA.id });
    expect(res.status).toBe(404);
  });

  // B5-movements: движение своего растения с чужой локацией (to/from).
  it('B5-movements: POST movement с чужим toLocationId → 404', async () => {
    const areaA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/locations`)
      .set('Cookie', A.cookie)
      .send({ name: 'Area A', type: 'area' })).body;
    const transfer = await systemMovementType('transfer');

    const res = await api()
      .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/movements`)
      .set('Cookie', B.cookie)
      .send({ typeId: transfer.id, toLocationId: areaA.id });
    expect(res.status).toBe(404);
  });

  it('B5-movements: POST movement с чужим fromLocationId → 404', async () => {
    const areaA = (await api()
      .post(`/api/nurseries/${A.nurseryId}/locations`)
      .set('Cookie', A.cookie)
      .send({ name: 'Area A2', type: 'area' })).body;
    const transfer = await systemMovementType('transfer');

    const res = await api()
      .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/movements`)
      .set('Cookie', B.cookie)
      .send({ typeId: transfer.id, fromLocationId: areaA.id });
    expect(res.status).toBe(404);
  });

  // B5-plants: создание/правка растения с чужими вложенными id.
  describe('B5-plants: чужие locationId/speciesId/containerId/stageId', () => {
    let locationA;
    let speciesA;
    let containerA;
    let stageA;

    beforeEach(async () => {
      locationA = (await api()
        .post(`/api/nurseries/${A.nurseryId}/locations`)
        .set('Cookie', A.cookie)
        .send({ name: 'Loc A', type: 'area' })).body;

      containerA = (await api()
        .post(`/api/nurseries/${A.nurseryId}/container-types`)
        .set('Cookie', A.cookie)
        .send({ code: uniq('CA'), name: 'Container A', container_kind: 'pot', volume_liters: 5 })).body;

      stageA = (await api()
        .post(`/api/nurseries/${A.nurseryId}/production-stages`)
        .set('Cookie', A.cookie)
        .send({ name: 'Stage A', slug: uniq('sa') })).body;

      await api()
        .post(`/api/nurseries/${A.nurseryId}/species/attach-by-name`)
        .set('Cookie', A.cookie)
        .send({ scientific_name: 'Acer platanoides', display_name_ru: 'Клён остролистный' });
      speciesA = await db('nursery_species').where({ nursery_id: A.nurseryId }).first();
    });

    it('POST растения с чужим locationId → 404', async () => {
      const res = await api()
        .post(plantsUrl(B.nurseryId))
        .set('Cookie', B.cookie)
        .send({ variety: 'X', locationId: locationA.id });
      expect(res.status).toBe(404);
    });

    it('POST растения с чужим speciesId → 404', async () => {
      const res = await api()
        .post(plantsUrl(B.nurseryId))
        .set('Cookie', B.cookie)
        .send({ variety: 'X', speciesId: speciesA.id });
      expect(res.status).toBe(404);
    });

    it('POST растения с чужим КАСТОМНЫМ containerId → 404', async () => {
      const res = await api()
        .post(plantsUrl(B.nurseryId))
        .set('Cookie', B.cookie)
        .send({ variety: 'X', containerId: containerA.id });
      expect(res.status).toBe(404);
    });

    it('POST растения с чужой КАСТОМНОЙ stageId → 404', async () => {
      const res = await api()
        .post(plantsUrl(B.nurseryId))
        .set('Cookie', B.cookie)
        .send({ variety: 'X', stageId: stageA.id });
      expect(res.status).toBe(404);
    });

    it('PATCH своего растения с чужими locationId/speciesId/containerId/stageId → 404', async () => {
      const base = `${plantsUrl(B.nurseryId)}/${plantB.id}`;
      const byLocation = await api().patch(base).set('Cookie', B.cookie).send({ locationId: locationA.id });
      const bySpecies = await api().patch(base).set('Cookie', B.cookie).send({ speciesId: speciesA.id });
      const byContainer = await api().patch(base).set('Cookie', B.cookie).send({ containerId: containerA.id });
      const byStage = await api().patch(base).set('Cookie', B.cookie).send({ stageId: stageA.id });

      expect(byLocation.status).toBe(404);
      expect(bySpecies.status).toBe(404);
      expect(byContainer.status).toBe(404);
      expect(byStage.status).toBe(404);
    });

    // B5: побочный эффект операции transplant — тот же вектор, что create/update растения:
    // newContainerId обязан принадлежать питомнику (или быть системным).
    it('POST операции transplant с чужим newContainerId → 404', async () => {
      const res = await api()
        .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/operations`)
        .set('Cookie', B.cookie)
        .send({ type: 'transplant', newContainerId: containerA.id });
      expect(res.status).toBe(404);
    });

    it('позитив: transplant своего растения в СИСТЕМНЫЙ контейнер → 201', async () => {
      const sysContainer = await systemContainerType('P9');
      const res = await api()
        .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/operations`)
        .set('Cookie', B.cookie)
        .send({ type: 'transplant', newContainerId: sysContainer.id });
      expect(res.status).toBe(201);
    });
  });

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: системные справочники (nursery_id IS NULL) общие для всех
  // питомников — правки IDOR НЕ должны их заблокировать.
  it('позитив: растение в своём питомнике с СИСТЕМНЫМ контейнером и СИСТЕМНОЙ стадией → 201', async () => {
    const sysContainer = await systemContainerType('P9');
    const sysStage = await db('production_stages').whereNull('nursery_id').where({ is_system: true }).first();

    const res = await api()
      .post(plantsUrl(B.nurseryId))
      .set('Cookie', B.cookie)
      .send({ variety: 'Legit', containerId: sysContainer.id, stageId: sysStage.id });
    expect(res.status).toBe(201);
  });

  it('позитив: движение своего растения с СИСТЕМНЫМ типом (arrival) → 201', async () => {
    const arrival = await systemMovementType('arrival');
    const res = await api()
      .post(`/api/nurseries/${B.nurseryId}/plants/${plantB.id}/movements`)
      .set('Cookie', B.cookie)
      .send({ typeId: arrival.id });
    expect(res.status).toBe(201);
  });
});

// Same-account сценарий v2: один владелец с ДВУМЯ питомниками. Активен второй (N2),
// но растение и его операция принадлежат первому (N1). Через URL активного питомника
// доступ к чужому вложенному ресурсу должен возвращать 404, а список активного
// питомника не должен содержать растения соседнего.
describe('T4 — same-account (v2): два питомника одного владельца', () => {
  it('список растений активного питомника изолирован; операция чужого растения через свой URL → 404', async () => {
    await setFreePlan({ nursery_limit: 2, plant_limit: 1000, feature_operations: true });
    const owner = await createOwnerWithNursery({ nurseryName: 'N1' }); // активен N1
    const nursery1 = owner.nurseryId;

    const plant1 = (await api()
      .post(plantsUrl(nursery1))
      .set('Cookie', owner.cookie)
      .send({ variety: 'In N1' })).body;
    await api()
      .post(`/api/nurseries/${nursery1}/plants/${plant1.id}/operations`)
      .set('Cookie', owner.cookie)
      .send({ type: 'inspection' });

    const created = await api()
      .post('/api/nurseries')
      .set('Cookie', owner.cookie)
      .send({ name: 'N2', address: 'St 2' });
    const cookie2 = toCookieHeader(created.headers['set-cookie']); // активен N2
    const nursery2 = created.body.id;

    const list = await api().get(plantsUrl(nursery2)).set('Cookie', cookie2);
    expect(list.status).toBe(200);
    const items = list.body.data ?? list.body;
    expect(items.some((p) => p.id === plant1.id)).toBe(false);

    const res = await api()
      .get(`/api/nurseries/${nursery2}/plants/${plant1.id}/operations`)
      .set('Cookie', cookie2);
    expect(res.status).toBe(404);
  });
});
