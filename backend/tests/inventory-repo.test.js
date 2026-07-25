import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import * as inventoryRepo from '@/repositories/inventorySession.repository.js';

import { createFullFixture, db, systemMovementType } from './helpers.js';

describe('inventorySession.repository (интеграция)', () => {
  let ctx;

  async function makeLocation(name, type = 'area', parentId = null, nurseryId = ctx.nurseryId) {
    const [loc] = await db('locations')
      .insert({ nursery_id: nurseryId, name, type, parent_id: parentId })
      .returning('*');
    return loc;
  }

  async function makeSpecies(displayName, nurseryId = ctx.nurseryId) {
    const [catalog] = await db('species_catalog')
      .insert({
        gbif_usage_key: Math.floor(Math.random() * 1_000_000_000),
        scientific_name: `Sci ${randomUUID()}`,
      })
      .returning('*');
    const [species] = await db('nursery_species')
      .insert({
        nursery_id: nurseryId,
        species_catalog_id: catalog.id,
        display_name_ru: displayName,
      })
      .returning('*');
    return { species, catalog };
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

  function systemStage(slug) {
    return db('production_stages').where({ slug, is_system: true }).first();
  }

  async function makeMovement(plantId) {
    const type = await systemMovementType('transfer');
    const [movement] = await db('movements')
      .insert({ plant_id: plantId, type_id: type.id, quantity: 1 })
      .returning('*');
    return movement;
  }

  function sessionData(overrides = {}) {
    return {
      nursery_id: ctx.nurseryId,
      location_id: overrides.location_id,
      user_id: ctx.owner.id,
      started_at: '2026-07-25T10:00:00.000Z',
      completed_at: '2026-07-25T10:05:00.000Z',
      client_request_id: randomUUID(),
      matched_count: 0,
      missing_count: 0,
      foreign_count: 0,
      unknown_count: 0,
      ...overrides,
    };
  }

  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  it('createSession вставляет сессию и возвращает сырую строку', async () => {
    const root = await makeLocation('Участок 1');
    const session = await inventoryRepo.createSession(
      sessionData({ location_id: root.id, matched_count: 2, missing_count: 1 })
    );
    expect(session.id).toBeTruthy();
    expect(session.nursery_id).toBe(ctx.nurseryId);
    expect(session.location_id).toBe(root.id);
    expect(session.matched_count).toBe(2);
    // счётчики по умолчанию проставлены
    expect(session.foreign_count).toBe(0);
    expect(session.created_at).toBeTruthy();
  });

  it('findSessionById возвращает camelCase-сессию с именем локации', async () => {
    const root = await makeLocation('Секция A', 'section');
    const created = await inventoryRepo.createSession(
      sessionData({ location_id: root.id, matched_count: 3, missing_count: 2, foreign_count: 1, unknown_count: 4 })
    );

    const found = await inventoryRepo.findSessionById(ctx.nurseryId, created.id);
    expect(found).toMatchObject({
      id: created.id,
      nurseryId: ctx.nurseryId,
      locationId: root.id,
      locationName: 'Секция A',
      userId: ctx.owner.id,
      matchedCount: 3,
      missingCount: 2,
      foreignCount: 1,
      unknownCount: 4,
    });
    expect(found.startedAt).toBeInstanceOf(Date);
    expect(found.completedAt).toBeInstanceOf(Date);
    // ни одного snake_case-ключа
    expect(Object.keys(found)).not.toContain('nursery_id');
  });

  it('findSessionById → undefined для несуществующего id', async () => {
    const found = await inventoryRepo.findSessionById(ctx.nurseryId, randomUUID());
    expect(found).toBeUndefined();
  });

  it('createItems (пустой массив) — no-op, возвращает []', async () => {
    const items = await inventoryRepo.createItems([]);
    expect(items).toEqual([]);
  });

  it('createItems + findItemsBySession: строки со всеми категориями и подписями растения', async () => {
    const root = await makeLocation('Участок 1');
    const { species, catalog } = await makeSpecies('Абрикос');
    const stage = await systemStage('container');

    const matchedPlant = await makePlant({
      nursery_species_id: species.id,
      stage_id: stage.id,
      location_id: root.id,
    });
    const missingPlant = await makePlant({ location_id: root.id });
    const foreignPlant = await makePlant();
    const movement = await makeMovement(matchedPlant.id);

    const session = await inventoryRepo.createSession(sessionData({ location_id: root.id }));

    await inventoryRepo.createItems([
      {
        session_id: session.id,
        plant_id: matchedPlant.id,
        raw_code: matchedPlant.qr_code,
        category: 'matched',
        scanned_at: '2026-07-25T10:01:00.000Z',
        applied_movement_id: movement.id,
      },
      {
        session_id: session.id,
        plant_id: missingPlant.id,
        raw_code: null,
        category: 'missing',
        scanned_at: null,
      },
      {
        session_id: session.id,
        plant_id: foreignPlant.id,
        raw_code: foreignPlant.qr_code,
        category: 'foreign',
        scanned_at: '2026-07-25T10:02:00.000Z',
      },
      {
        session_id: session.id,
        plant_id: null,
        raw_code: 'ghost-code',
        category: 'unknown',
        scanned_at: '2026-07-25T10:03:00.000Z',
      },
    ]);

    const items = await inventoryRepo.findItemsBySession(session.id);
    expect(items).toHaveLength(4);
    const byCategory = Object.fromEntries(items.map((i) => [i.category, i]));

    // matched — плант-строка с подтянутыми подписями и аудитом движения
    expect(byCategory.matched).toMatchObject({
      category: 'matched',
      plantId: matchedPlant.id,
      rawCode: matchedPlant.qr_code,
      qrCode: matchedPlant.qr_code,
      numericCode: matchedPlant.numeric_code,
      speciesName: 'Абрикос',
      scientificName: catalog.scientific_name,
      stageName: stage.name,
      currentLocationName: 'Участок 1',
      appliedMovementId: movement.id,
    });
    expect(byCategory.matched.itemId).toBeTruthy();

    // missing — плант-строка без scanned_at/raw_code
    expect(byCategory.missing).toMatchObject({
      category: 'missing',
      plantId: missingPlant.id,
      rawCode: null,
      scannedAt: null,
      currentLocationName: 'Участок 1',
    });
    // у missingPlant нет вида/стадии → подписи null
    expect(byCategory.missing.speciesName).toBeNull();
    expect(byCategory.missing.stageName).toBeNull();

    // unknown — без растения, все подписи null
    expect(byCategory.unknown).toMatchObject({
      category: 'unknown',
      plantId: null,
      rawCode: 'ghost-code',
      appliedMovementId: null,
    });
    expect(byCategory.unknown.qrCode).toBeNull();
    expect(byCategory.unknown.speciesName).toBeNull();
    expect(byCategory.unknown.currentLocationName).toBeNull();
  });

  it('findByClientRequestId возвращает сессию для повтора (идемпотентность)', async () => {
    const root = await makeLocation('Участок 1');
    const clientRequestId = randomUUID();
    const created = await inventoryRepo.createSession(
      sessionData({ location_id: root.id, client_request_id: clientRequestId })
    );

    const replayed = await inventoryRepo.findByClientRequestId(ctx.nurseryId, clientRequestId);
    expect(replayed.id).toBe(created.id);
    expect(replayed.nursery_id).toBe(ctx.nurseryId);
  });

  it('findByClientRequestId → undefined для неизвестного ключа', async () => {
    const replayed = await inventoryRepo.findByClientRequestId(ctx.nurseryId, randomUUID());
    expect(replayed).toBeUndefined();
  });

  it('частичный UNIQUE (nursery_id, client_request_id) блокирует дубль', async () => {
    const root = await makeLocation('Участок 1');
    const clientRequestId = randomUUID();
    await inventoryRepo.createSession(
      sessionData({ location_id: root.id, client_request_id: clientRequestId })
    );
    await expect(
      inventoryRepo.createSession(
        sessionData({ location_id: root.id, client_request_id: clientRequestId })
      )
    ).rejects.toThrow();
  });

  it('listSessions + countSessions: пагинация, порядок completed_at DESC', async () => {
    const root = await makeLocation('Участок 1');
    const s1 = await inventoryRepo.createSession(
      sessionData({ location_id: root.id, completed_at: '2026-07-20T10:00:00.000Z' })
    );
    const s2 = await inventoryRepo.createSession(
      sessionData({ location_id: root.id, completed_at: '2026-07-22T10:00:00.000Z' })
    );
    const s3 = await inventoryRepo.createSession(
      sessionData({ location_id: root.id, completed_at: '2026-07-24T10:00:00.000Z' })
    );

    const total = await inventoryRepo.countSessions(ctx.nurseryId);
    expect(total).toBe(3);

    // без пагинации — все, свежие сверху
    const all = await inventoryRepo.listSessions(ctx.nurseryId);
    expect(all.map((s) => s.id)).toEqual([s3.id, s2.id, s1.id]);
    expect(all[0].locationName).toBe('Участок 1');

    // первая страница
    const page1 = await inventoryRepo.listSessions(ctx.nurseryId, { limit: 2, offset: 0 });
    expect(page1.map((s) => s.id)).toEqual([s3.id, s2.id]);

    // вторая страница
    const page2 = await inventoryRepo.listSessions(ctx.nurseryId, { limit: 2, offset: 2 });
    expect(page2.map((s) => s.id)).toEqual([s1.id]);
  });

  it('тенант-изоляция: сессия питомника A не видна питомнику B', async () => {
    const rootA = await makeLocation('Участок A');
    const sessionA = await inventoryRepo.createSession(sessionData({ location_id: rootA.id }));

    const other = await createFullFixture();

    // findSessionById чужого питомника → undefined
    const leaked = await inventoryRepo.findSessionById(other.nurseryId, sessionA.id);
    expect(leaked).toBeUndefined();

    // листинг/счётчик чужого питомника не включают сессию A
    expect(await inventoryRepo.countSessions(other.nurseryId)).toBe(0);
    expect(await inventoryRepo.listSessions(other.nurseryId)).toEqual([]);

    // findByClientRequestId скоуплен по nursery_id
    const leakedReplay = await inventoryRepo.findByClientRequestId(
      other.nurseryId,
      sessionA.client_request_id
    );
    expect(leakedReplay).toBeUndefined();
  });

  it('composite FK не даёт привязать сессию к локации чужого питомника', async () => {
    const other = await createFullFixture();
    const foreignLoc = await makeLocation('Чужой участок', 'area', null, other.nurseryId);
    // location_id существует, но принадлежит другому питомнику → составной FK падает
    await expect(
      inventoryRepo.createSession(sessionData({ location_id: foreignLoc.id }))
    ).rejects.toThrow();
  });
});
