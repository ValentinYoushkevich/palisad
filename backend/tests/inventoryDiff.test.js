import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { collectSubtreeLocationIds, computeInventoryDiff } from '@/utils/inventoryDiff.js';
import {
  INVENTORY_CATEGORIES,
  createInventorySessionSchema,
} from '@/utils/validators/inventory.validators.js';

describe('collectSubtreeLocationIds', () => {
  it('корень без детей → множество из одного корня', () => {
    const locations = [{ id: 'root', parent_id: null }];
    const result = collectSubtreeLocationIds('root', locations);
    expect(result).toBeInstanceOf(Set);
    expect([...result]).toEqual(['root']);
  });

  it('включает сам корень и все уровни глубокого поддерева', () => {
    const locations = [
      { id: 'area', parent_id: null },
      { id: 'section', parent_id: 'area' },
      { id: 'row', parent_id: 'section' },
      { id: 'place', parent_id: 'row' },
    ];
    const result = collectSubtreeLocationIds('area', locations);
    expect([...result].sort()).toEqual(['area', 'place', 'row', 'section']);
  });

  it('берёт только поддерево, не сиблингов/родителей', () => {
    const locations = [
      { id: 'area', parent_id: null },
      { id: 'sectionA', parent_id: 'area' },
      { id: 'sectionB', parent_id: 'area' },
      { id: 'rowA1', parent_id: 'sectionA' },
      { id: 'rowB1', parent_id: 'sectionB' },
    ];
    const result = collectSubtreeLocationIds('sectionA', locations);
    expect([...result].sort()).toEqual(['rowA1', 'sectionA']);
  });

  it('несколько ветвей от корня', () => {
    const locations = [
      { id: 'root', parent_id: null },
      { id: 'a', parent_id: 'root' },
      { id: 'b', parent_id: 'root' },
      { id: 'a1', parent_id: 'a' },
    ];
    const result = collectSubtreeLocationIds('root', locations);
    expect([...result].sort()).toEqual(['a', 'a1', 'b', 'root']);
  });

  it('терминирует при цикле в дереве (защита от зацикливания)', () => {
    const locations = [
      { id: 'a', parent_id: 'b' },
      { id: 'b', parent_id: 'a' },
    ];
    const result = collectSubtreeLocationIds('a', locations);
    expect([...result].sort()).toEqual(['a', 'b']);
  });

  it('корень отсутствует среди локаций → singleton set только из корня', () => {
    const locations = [
      { id: 'x', parent_id: null },
      { id: 'y', parent_id: 'x' },
    ];
    const result = collectSubtreeLocationIds('missing-root', locations);
    expect([...result]).toEqual(['missing-root']);
  });

  it('пустой список локаций → singleton set только из корня', () => {
    const result = collectSubtreeLocationIds('root', []);
    expect([...result]).toEqual(['root']);
  });
});

describe('computeInventoryDiff', () => {
  // Растение-хелпер: активное растение с кодами и локацией. Доп. поля прокидываются.
  function plant(id, location_id, extra = {}) {
    return { id, qr_code: `qr-${id}`, numeric_code: `nc-${id}`, location_id, ...extra };
  }
  function scan(code, scannedAt = `2026-07-25T10:00:00Z`) {
    return { code, scannedAt };
  }

  it('matched: растение в зоне и отсканировано', () => {
    const p = plant('p1', 'zone', { speciesName: 'Абрикос' });
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('qr-p1')],
    });
    expect(res.matched).toEqual([{ plant: p, rawCode: 'qr-p1', scannedAt: '2026-07-25T10:00:00Z' }]);
    expect(res.matched[0].plant.speciesName).toBe('Абрикос'); // весь объект прокинут
    expect(res.missing).toEqual([]);
    expect(res.foreign).toEqual([]);
    expect(res.unknown).toEqual([]);
  });

  it('глубокое под-поддерево зоны → matched', () => {
    const p = plant('p1', 'deepPlace');
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      // зона включает глубокий узел (собран collectSubtreeLocationIds выше)
      zoneLocationIds: new Set(['area', 'section', 'row', 'deepPlace']),
      scans: [scan('qr-p1')],
    });
    expect(res.matched.map((m) => m.plant.id)).toEqual(['p1']);
    expect(res.missing).toEqual([]);
  });

  it('игнорирует null-коды при построении лукапов (резолв по присутствующему коду)', () => {
    const noQr = { id: 'p1', qr_code: null, numeric_code: 'nc-p1', location_id: 'zone' };
    const noNumeric = { id: 'p2', qr_code: 'qr-p2', numeric_code: null, location_id: 'zone' };
    const res = computeInventoryDiff({
      nurseryPlants: [noQr, noNumeric],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('nc-p1'), scan('qr-p2')],
    });
    expect(res.matched.map((m) => m.plant.id).sort()).toEqual(['p1', 'p2']);
    expect(res.unknown).toEqual([]);
  });

  it('резолвит скан по числовому коду, если не найден по QR', () => {
    const p = plant('p1', 'zone');
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('nc-p1')],
    });
    expect(res.matched.map((m) => m.plant.id)).toEqual(['p1']);
  });

  it('missing: растение в зоне, но не отсканировано', () => {
    const p1 = plant('p1', 'zone');
    const p2 = plant('p2', 'zone');
    const res = computeInventoryDiff({
      nurseryPlants: [p1, p2],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('qr-p1')],
    });
    expect(res.matched.map((m) => m.plant.id)).toEqual(['p1']);
    expect(res.missing).toEqual([{ plant: p2 }]);
  });

  it('foreign: отсканировано, но растение в другой зоне', () => {
    const p = plant('p1', 'otherZone');
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('qr-p1')],
    });
    expect(res.foreign).toEqual([{ plant: p, rawCode: 'qr-p1', scannedAt: '2026-07-25T10:00:00Z' }]);
    expect(res.matched).toEqual([]);
    expect(res.missing).toEqual([]); // p1 не в зоне → не missing
  });

  it('foreign: отсканированное растение с location_id = null', () => {
    const p = plant('p1', null);
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('qr-p1')],
    });
    expect(res.foreign.map((f) => f.plant.id)).toEqual(['p1']);
    expect(res.matched).toEqual([]);
  });

  it('unknown: код не найден среди активных растений', () => {
    const res = computeInventoryDiff({
      nurseryPlants: [plant('p1', 'zone')],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('does-not-exist')],
    });
    expect(res.unknown).toEqual([
      { rawCode: 'does-not-exist', scannedAt: '2026-07-25T10:00:00Z' },
    ]);
  });

  it('дубли одного кода (3×) → одна запись, первый scannedAt выигрывает', () => {
    const p = plant('p1', 'zone');
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      zoneLocationIds: new Set(['zone']),
      scans: [
        scan('qr-p1', '2026-07-25T10:00:00Z'),
        scan('qr-p1', '2026-07-25T11:00:00Z'),
        scan('qr-p1', '2026-07-25T12:00:00Z'),
      ],
    });
    expect(res.matched).toHaveLength(1);
    expect(res.matched[0].scannedAt).toBe('2026-07-25T10:00:00Z');
  });

  it('пустые/пробельные коды игнорируются; коды тримятся', () => {
    const p = plant('p1', 'zone');
    const res = computeInventoryDiff({
      nurseryPlants: [p],
      zoneLocationIds: new Set(['zone']),
      scans: [scan(''), scan('   '), scan('  qr-p1  ')],
    });
    expect(res.matched.map((m) => m.rawCode)).toEqual(['qr-p1']);
    expect(res.unknown).toEqual([]);
  });

  it('пустые сканы + растения в зоне → все missing', () => {
    const p1 = plant('p1', 'zone');
    const p2 = plant('p2', 'zone');
    const res = computeInventoryDiff({
      nurseryPlants: [p1, p2],
      zoneLocationIds: new Set(['zone']),
      scans: [],
    });
    expect(res.missing).toEqual([{ plant: p1 }, { plant: p2 }]);
    expect(res.matched).toEqual([]);
    expect(res.foreign).toEqual([]);
    expect(res.unknown).toEqual([]);
  });

  it('пустая зона + сканы растений вне зоны → только foreign', () => {
    const p1 = plant('p1', 'other');
    const p2 = plant('p2', 'other');
    const res = computeInventoryDiff({
      nurseryPlants: [p1, p2],
      zoneLocationIds: new Set(['emptyZone']),
      scans: [scan('qr-p1'), scan('qr-p2')],
    });
    expect(res.foreign.map((f) => f.plant.id)).toEqual(['p1', 'p2']);
    expect(res.matched).toEqual([]);
    expect(res.missing).toEqual([]);
    expect(res.unknown).toEqual([]);
  });

  it('детерминированный порядок: matched/foreign/unknown в порядке сканов', () => {
    const inZone = plant('inzone', 'zone');
    const elsewhere = plant('elsew', 'other');
    const res = computeInventoryDiff({
      nurseryPlants: [inZone, elsewhere],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('nope1'), scan('qr-elsew'), scan('qr-inzone'), scan('nope2')],
    });
    expect(res.unknown.map((u) => u.rawCode)).toEqual(['nope1', 'nope2']);
    expect(res.foreign.map((f) => f.rawCode)).toEqual(['qr-elsew']);
    expect(res.matched.map((m) => m.rawCode)).toEqual(['qr-inzone']);
  });

  it('missing в порядке nurseryPlants', () => {
    const a = plant('a', 'zone');
    const b = plant('b', 'zone');
    const c = plant('c', 'zone');
    const res = computeInventoryDiff({
      nurseryPlants: [a, b, c],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('qr-b')],
    });
    expect(res.missing.map((m) => m.plant.id)).toEqual(['a', 'c']);
  });

  it('соседний соседний зона: matched, missing, foreign, unknown вместе', () => {
    const inZoneScanned = plant('p1', 'zone');
    const inZoneMissing = plant('p2', 'zone');
    const foreignPlant = plant('p3', 'other');
    const res = computeInventoryDiff({
      nurseryPlants: [inZoneScanned, inZoneMissing, foreignPlant],
      zoneLocationIds: new Set(['zone']),
      scans: [scan('qr-p1'), scan('qr-p3'), scan('ghost')],
    });
    expect(res.matched.map((m) => m.plant.id)).toEqual(['p1']);
    expect(res.missing.map((m) => m.plant.id)).toEqual(['p2']);
    expect(res.foreign.map((m) => m.plant.id)).toEqual(['p3']);
    expect(res.unknown.map((u) => u.rawCode)).toEqual(['ghost']);
  });
});

describe('createInventorySessionSchema', () => {
  function body(overrides = {}) {
    return {
      locationId: randomUUID(),
      startedAt: '2026-07-25T10:00:00.000Z',
      completedAt: '2026-07-25T10:05:00.000Z',
      clientRequestId: randomUUID(),
      scans: [{ code: 'ABC-1', scannedAt: '2026-07-25T10:01:00.000Z' }],
      ...overrides,
    };
  }

  it('валидное тело проходит', () => {
    const res = createInventorySessionSchema.safeParse(body());
    expect(res.success).toBe(true);
  });

  it('тримит код скана', () => {
    const res = createInventorySessionSchema.safeParse(
      body({ scans: [{ code: '  ABC-1  ', scannedAt: '2026-07-25T10:01:00.000Z' }] })
    );
    expect(res.success).toBe(true);
    expect(res.data.scans[0].code).toBe('ABC-1');
  });

  it('принимает datetime со смещением (offset)', () => {
    const res = createInventorySessionSchema.safeParse(
      body({ startedAt: '2026-07-25T10:00:00+03:00', completedAt: '2026-07-25T13:00:00+03:00' })
    );
    expect(res.success).toBe(true);
  });

  it('пустой массив сканов допустим', () => {
    const res = createInventorySessionSchema.safeParse(body({ scans: [] }));
    expect(res.success).toBe(true);
  });

  it('completedAt == startedAt допустимо', () => {
    const res = createInventorySessionSchema.safeParse(
      body({ startedAt: '2026-07-25T10:00:00.000Z', completedAt: '2026-07-25T10:00:00.000Z' })
    );
    expect(res.success).toBe(true);
  });

  it('completedAt раньше startedAt → ошибка по пути completedAt', () => {
    const res = createInventorySessionSchema.safeParse(
      body({ startedAt: '2026-07-25T10:10:00.000Z', completedAt: '2026-07-25T10:05:00.000Z' })
    );
    expect(res.success).toBe(false);
    expect(res.error.issues[0].path).toEqual(['completedAt']);
  });

  it('более 5000 сканов → ошибка', () => {
    const scans = Array.from({ length: 5001 }, () => ({
      code: 'x',
      scannedAt: '2026-07-25T10:01:00.000Z',
    }));
    const res = createInventorySessionSchema.safeParse(body({ scans }));
    expect(res.success).toBe(false);
  });

  it('ровно 5000 сканов проходит', () => {
    const scans = Array.from({ length: 5000 }, () => ({
      code: 'x',
      scannedAt: '2026-07-25T10:01:00.000Z',
    }));
    const res = createInventorySessionSchema.safeParse(body({ scans }));
    expect(res.success).toBe(true);
  });

  it('пустой код скана → ошибка', () => {
    const res = createInventorySessionSchema.safeParse(
      body({ scans: [{ code: '   ', scannedAt: '2026-07-25T10:01:00.000Z' }] })
    );
    expect(res.success).toBe(false);
  });

  it('невалидный uuid локации → ошибка', () => {
    const res = createInventorySessionSchema.safeParse(body({ locationId: 'not-a-uuid' }));
    expect(res.success).toBe(false);
  });

  it('невалидный datetime → ошибка', () => {
    const res = createInventorySessionSchema.safeParse(body({ startedAt: '25.07.2026' }));
    expect(res.success).toBe(false);
  });

  it('экспортирует канон категорий', () => {
    expect(INVENTORY_CATEGORIES).toEqual(['matched', 'missing', 'foreign', 'unknown']);
  });
});
