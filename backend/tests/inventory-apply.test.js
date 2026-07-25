import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture, db, systemMovementType } from './helpers.js';

// Инвентаризация — применение расхождений (Э3: POST /:id/apply). Списываем «пропавшие»
// (missing) выбранным типом списания и возвращаем «чужих» (foreign) в зону сессии
// системным «перемещением». Проверяем контракт ответа, эффекты на растения/движения,
// пропуски (skipped.reason), идемпотентность, гонку и RBAC.
describe('Инвентаризация — применение (Э3: POST /:id/apply)', () => {
  let ctx;

  async function makeLocation(name, type = 'area', parentId = null, nurseryId = ctx.nurseryId) {
    const [loc] = await db('locations')
      .insert({ nursery_id: nurseryId, name, type, parent_id: parentId })
      .returning('*');
    return loc;
  }

  async function makePlant(overrides = {}) {
    const [plant] = await db('plants')
      .insert({
        nursery_id: ctx.nurseryId,
        qr_code: `qr-${randomUUID()}`,
        numeric_code: `nc-${randomUUID()}`,
        status: 'growing',
        ...overrides,
      })
      .returning('*');
    return plant;
  }

  function sessionBody(overrides = {}) {
    return {
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:05:00.000Z',
      clientRequestId: randomUUID(),
      scans: [],
      ...overrides,
    };
  }

  function postSession(body, cookie = ctx.worker.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .post(`/api/nurseries/${nurseryId}/inventory-sessions`)
      .set('Cookie', cookie)
      .send(body);
  }

  function postApply(sessionId, body, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .post(`/api/nurseries/${nurseryId}/inventory-sessions/${sessionId}/apply`)
      .set('Cookie', cookie)
      .send(body);
  }

  function getDetail(sessionId, cookie = ctx.cookie, nurseryId = ctx.nurseryId) {
    return api()
      .get(`/api/nurseries/${nurseryId}/inventory-sessions/${sessionId}`)
      .set('Cookie', cookie);
  }

  function countMovements(plantId) {
    return db('movements')
      .where({ plant_id: plantId })
      .count('id as c')
      .then((rows) => Number(rows[0].c));
  }

  function totalMovements(nurseryId = ctx.nurseryId) {
    return db('movements')
      .join('plants', 'movements.plant_id', 'plants.id')
      .where('plants.nursery_id', nurseryId)
      .count('movements.id as c')
      .then((rows) => Number(rows[0].c));
  }

  // Строит зону area→section, чужую секцию, и три растения (matched/missing/foreign),
  // затем создаёт сессию сканированием section. Возвращает id и саму сессию.
  async function setupDiff() {
    const area = await makeLocation('Участок 1', 'area');
    const section = await makeLocation('Секция A', 'section', area.id);
    const otherSection = await makeLocation('Секция B', 'section', area.id);

    const matchedPlant = await makePlant({ location_id: section.id });
    const missingPlant = await makePlant({ location_id: section.id });
    const foreignPlant = await makePlant({ location_id: otherSection.id });

    const created = await postSession(
      sessionBody({
        locationId: section.id,
        scans: [
          { code: matchedPlant.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' },
          { code: foreignPlant.qr_code, scannedAt: '2026-07-25T10:02:00.000Z' },
        ],
      })
    );
    expect(created.status).toBe(201);
    expect(created.body.counts).toEqual({ matched: 1, missing: 1, foreign: 1, unknown: 0 });

    return { section, otherSection, matchedPlant, missingPlant, foreignPlant, sessionId: created.body.id };
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  it('списывает выбранное missing: движение write_off, статус written_off, applied_movement_id проставлен', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ writtenOff: 1, transferred: 0 });
    expect(res.body.skipped).toEqual([]);

    // Движение создано с типом списания, from=прежняя локация, to=null, quantity=1.
    const movements = await db('movements').where({ plant_id: missingPlant.id });
    expect(movements).toHaveLength(1);
    expect(movements[0].type_id).toBe(writeOffType.id);
    expect(movements[0].to_location_id).toBeNull();
    expect(movements[0].from_location_id).toBe(missingPlant.location_id);
    expect(movements[0].notes).toBe('Инвентаризация: списание');

    // Растение переведено в written_off.
    const plant = await db('plants').where({ id: missingPlant.id }).first();
    expect(plant.status).toBe('written_off');

    // Строка сверки помечена движением — и это видно в DETAIL (важно для Э4/PDF).
    const item = await db('inventory_items')
      .where({ session_id: sessionId, plant_id: missingPlant.id, category: 'missing' })
      .first();
    expect(item.applied_movement_id).toBe(movements[0].id);

    const detail = await getDetail(sessionId);
    expect(detail.body.items.missing[0].appliedMovementId).toBe(movements[0].id);
  });

  it('возвращает выбранное foreign: движение transfer, локация = зона сессии, transferred учтён', async () => {
    const { sessionId, section, foreignPlant } = await setupDiff();
    const transferType = await systemMovementType('transfer');

    const res = await postApply(sessionId, { transfer: { plantIds: [foreignPlant.id] } });

    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ writtenOff: 0, transferred: 1 });
    expect(res.body.skipped).toEqual([]);

    const movements = await db('movements').where({ plant_id: foreignPlant.id });
    expect(movements).toHaveLength(1);
    expect(movements[0].type_id).toBe(transferType.id);
    expect(movements[0].from_location_id).toBe(foreignPlant.location_id);
    expect(movements[0].to_location_id).toBe(section.id);
    expect(movements[0].notes).toBe('Инвентаризация: перемещение');

    const plant = await db('plants').where({ id: foreignPlant.id }).first();
    expect(plant.location_id).toBe(section.id);
    expect(plant.status).toBe('growing'); // transfer не меняет статус
  });

  it('обе группы разом: writtenOff + transferred', async () => {
    const { sessionId, missingPlant, foreignPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id },
      transfer: { plantIds: [foreignPlant.id] },
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ writtenOff: 1, transferred: 1 });
    expect(res.body.skipped).toEqual([]);
    expect(await totalMovements()).toBe(2);
  });

  it('пропуски: not_in_session (посторонний id), already_here (foreign уже в зоне)', async () => {
    const { sessionId, section, foreignPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');
    const strangerId = randomUUID();

    // foreignPlant физически переносим в зону сессии → apply должен вернуть already_here.
    await db('plants').where({ id: foreignPlant.id }).update({ location_id: section.id });

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [strangerId], movementTypeId: writeOffType.id },
      transfer: { plantIds: [foreignPlant.id] },
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ writtenOff: 0, transferred: 0 });
    expect(res.body.skipped).toContainEqual({ plantId: strangerId, reason: 'not_in_session' });
    expect(res.body.skipped).toContainEqual({ plantId: foreignPlant.id, reason: 'already_here' });
    expect(await totalMovements()).toBe(0);
  });

  it('status_changed: растение стало sold между сверкой и применением → пропуск без движения', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');

    await db('plants').where({ id: missingPlant.id }).update({ status: 'sold' });

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ writtenOff: 0, transferred: 0 });
    expect(res.body.skipped).toEqual([{ plantId: missingPlant.id, reason: 'status_changed' }]);
    expect(await countMovements(missingPlant.id)).toBe(0);
  });

  it('plant_deleted: растение soft-deleted → пропуск без движения', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');

    await db('plants').where({ id: missingPlant.id }).update({ deleted_at: db.fn.now() });

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toEqual([{ plantId: missingPlant.id, reason: 'plant_deleted' }]);
    expect(await countMovements(missingPlant.id)).toBe(0);
  });

  it('идемпотентный повтор: второй apply не создаёт движений, всё already_applied', async () => {
    const { sessionId, missingPlant, foreignPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');
    const body = {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id },
      transfer: { plantIds: [foreignPlant.id] },
    };

    const first = await postApply(sessionId, body);
    expect(first.body.applied).toEqual({ writtenOff: 1, transferred: 1 });
    const afterFirst = await totalMovements();
    expect(afterFirst).toBe(2);

    const second = await postApply(sessionId, body);
    expect(second.status).toBe(200);
    expect(second.body.applied).toEqual({ writtenOff: 0, transferred: 0 });
    expect(second.body.skipped).toContainEqual({ plantId: missingPlant.id, reason: 'already_applied' });
    expect(second.body.skipped).toContainEqual({ plantId: foreignPlant.id, reason: 'already_applied' });

    // Ни одного нового движения.
    expect(await totalMovements()).toBe(afterFirst);
  });

  it('гонка: два параллельных apply с одним телом → ровно одно движение, суммарный writtenOff=1', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');
    const body = { writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id } };

    const [r1, r2] = await Promise.all([postApply(sessionId, body), postApply(sessionId, body)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // advisory-lock сериализует: ровно один создаёт движение, второй → already_applied.
    expect(r1.body.applied.writtenOff + r2.body.applied.writtenOff).toBe(1);
    expect(await countMovements(missingPlant.id)).toBe(1);

    const plant = await db('plants').where({ id: missingPlant.id }).first();
    expect(plant.status).toBe('written_off');
  });

  it('no-op ({} тело) → applied 0/0, skipped []', async () => {
    const { sessionId } = await setupDiff();
    const res = await postApply(sessionId, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: { writtenOff: 0, transferred: 0 }, skipped: [] });
    expect(await totalMovements()).toBe(0);
  });

  it('некорректный тип списания (sets_status ≠ written_off) → 400, без движений', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const transferType = await systemMovementType('transfer'); // sets_status = null

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: transferType.id },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Некорректный тип списания');
    expect(await countMovements(missingPlant.id)).toBe(0);
  });

  it('тип списания другого питомника → 400, без движений', async () => {
    const { sessionId, missingPlant } = await setupDiff();

    // Собственный (не системный) тип списания ЧУЖОГО питомника.
    const other = await createFullFixture();
    const [foreignType] = await db('movement_types')
      .insert({
        nursery_id: other.nurseryId,
        name: 'Чужое списание',
        slug: 'own-write-off',
        is_system: false,
        sets_status: 'written_off',
        is_active: true,
      })
      .returning('*');

    const res = await postApply(sessionId, {
      writeOff: { plantIds: [missingPlant.id], movementTypeId: foreignType.id },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Некорректный тип списания');
    expect(await countMovements(missingPlant.id)).toBe(0);
  });

  it('movementTypeId обязателен при непустом writeOff.plantIds → 400 (валидатор)', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const res = await postApply(sessionId, { writeOff: { plantIds: [missingPlant.id] } });
    expect(res.status).toBe(400);
  });

  it('apply на сессию другого питомника → 404', async () => {
    const { sessionId } = await setupDiff();
    const other = await createFullFixture();
    const res = await postApply(sessionId, {}, other.cookie, other.nurseryId);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Сессия инвентаризации не найдена');
  });

  it('RBAC: worker → 403, observer → 403 (только STRUCTURE_ROLES применяют)', async () => {
    const { sessionId } = await setupDiff();
    const worker = await postApply(sessionId, {}, ctx.worker.cookie);
    const observer = await postApply(sessionId, {}, ctx.observer.cookie);
    expect(worker.status).toBe(403);
    expect(observer.status).toBe(403);
  });

  it('agronomist (STRUCTURE_ROLE) может применять', async () => {
    const { sessionId, missingPlant } = await setupDiff();
    const writeOffType = await systemMovementType('write_off');
    const res = await postApply(
      sessionId,
      { writeOff: { plantIds: [missingPlant.id], movementTypeId: writeOffType.id } },
      ctx.agronomist.cookie
    );
    expect(res.status).toBe(200);
    expect(res.body.applied.writtenOff).toBe(1);
  });
});
