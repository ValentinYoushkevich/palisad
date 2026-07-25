import { collectSubtreeLocationIds, computeInventoryDiff } from '@/utils/inventoryDiff'
import { describe, expect, it } from 'vitest'

// Хелпер: минимальное активное растение (доп. поля прокидываются в результат как есть).
function plant(id, { qr = null, numeric = null, location = null, ...rest } = {}) {
  return { id, qr_code: qr, numeric_code: numeric, location_id: location, ...rest }
}

describe('collectSubtreeLocationIds', () => {
  it('включает сам корень и весь спуск по дереву', () => {
    const locations = [
      { id: 'root', parent_id: null },
      { id: 'a', parent_id: 'root' },
      { id: 'b', parent_id: 'a' },
      { id: 'c', parent_id: 'root' },
      { id: 'other', parent_id: null }
    ]

    const set = collectSubtreeLocationIds('root', locations)

    expect(set).toEqual(new Set(['root', 'a', 'b', 'c']))
    expect(set.has('other')).toBe(false)
  })

  it('глубокое поддерево: спускается через несколько уровней', () => {
    const locations = [
      { id: 'l1', parent_id: null },
      { id: 'l2', parent_id: 'l1' },
      { id: 'l3', parent_id: 'l2' },
      { id: 'l4', parent_id: 'l3' }
    ]

    expect(collectSubtreeLocationIds('l1', locations)).toEqual(new Set(['l1', 'l2', 'l3', 'l4']))
  })

  it('защита от циклов: не зацикливается на parent-ссылках по кругу', () => {
    const locations = [
      { id: 'x', parent_id: 'z' },
      { id: 'y', parent_id: 'x' },
      { id: 'z', parent_id: 'y' }
    ]

    const set = collectSubtreeLocationIds('x', locations)

    expect(set).toEqual(new Set(['x', 'y', 'z']))
  })

  it('rootId отсутствует среди локаций → множество из одного корня', () => {
    expect(collectSubtreeLocationIds('ghost', [{ id: 'a', parent_id: null }])).toEqual(new Set(['ghost']))
  })
})

describe('computeInventoryDiff', () => {
  it('раскладывает по всем 4 категориям (matched/missing/foreign/unknown)', () => {
    const nurseryPlants = [
      plant('p1', { qr: 'QR1', location: 'zone' }), // matched (в зоне, отсканирован)
      plant('p2', { numeric: '1002', location: 'zone' }), // missing (в зоне, не отсканирован)
      plant('p3', { qr: 'QR3', location: 'outside' }) // foreign (отсканирован, вне зоны)
    ]
    const zone = new Set(['zone'])
    const scans = [
      { code: 'QR1', scannedAt: 't1' },
      { code: 'QR3', scannedAt: 't2' },
      { code: 'NOPE', scannedAt: 't3' } // unknown (не резолвится)
    ]

    const diff = computeInventoryDiff({ nurseryPlants, zoneLocationIds: zone, scans })

    expect(diff.matched).toEqual([{ plant: nurseryPlants[0], rawCode: 'QR1', scannedAt: 't1' }])
    expect(diff.missing).toEqual([{ plant: nurseryPlants[1] }])
    expect(diff.foreign).toEqual([{ plant: nurseryPlants[2], rawCode: 'QR3', scannedAt: 't2' }])
    expect(diff.unknown).toEqual([{ rawCode: 'NOPE', scannedAt: 't3' }])
  })

  it('резолвит по числовому коду и матчит растение в глубоком поддереве зоны', () => {
    const locations = [
      { id: 'root', parent_id: null },
      { id: 'mid', parent_id: 'root' },
      { id: 'leaf', parent_id: 'mid' }
    ]
    const zone = collectSubtreeLocationIds('root', locations)
    const deep = plant('p1', { numeric: '555', location: 'leaf' })

    const diff = computeInventoryDiff({
      nurseryPlants: [deep],
      zoneLocationIds: zone,
      scans: [{ code: '555', scannedAt: 't1' }]
    })

    expect(diff.matched).toEqual([{ plant: deep, rawCode: '555', scannedAt: 't1' }])
    expect(diff.missing).toEqual([])
  })

  it('растение с location_id === null → foreign (null не входит в зону)', () => {
    const homeless = plant('p1', { qr: 'QR1', location: null })

    const diff = computeInventoryDiff({
      nurseryPlants: [homeless],
      zoneLocationIds: new Set(['zone']),
      scans: [{ code: 'QR1', scannedAt: 't1' }]
    })

    expect(diff.foreign).toEqual([{ plant: homeless, rawCode: 'QR1', scannedAt: 't1' }])
    expect(diff.matched).toEqual([])
  })

  it('дублирующиеся сканы дедупятся по коду (первое вхождение выигрывает)', () => {
    const p1 = plant('p1', { qr: 'QR1', location: 'zone' })

    const diff = computeInventoryDiff({
      nurseryPlants: [p1],
      zoneLocationIds: new Set(['zone']),
      scans: [
        { code: 'QR1', scannedAt: 't1' },
        { code: ' QR1 ', scannedAt: 't2' },
        { code: 'QR1', scannedAt: 't3' }
      ]
    })

    expect(diff.matched).toEqual([{ plant: p1, rawCode: 'QR1', scannedAt: 't1' }])
  })

  it('пустые/пробельные коды игнорируются', () => {
    const diff = computeInventoryDiff({
      nurseryPlants: [],
      zoneLocationIds: new Set(['zone']),
      scans: [{ code: '   ', scannedAt: 't1' }, { code: '', scannedAt: 't2' }]
    })

    expect(diff.unknown).toEqual([])
    expect(diff.matched).toEqual([])
  })

  it('пустые сканы → все растения зоны попадают в missing', () => {
    const nurseryPlants = [
      plant('p1', { qr: 'QR1', location: 'zone' }),
      plant('p2', { qr: 'QR2', location: 'zone' }),
      plant('p3', { qr: 'QR3', location: 'outside' })
    ]

    const diff = computeInventoryDiff({
      nurseryPlants,
      zoneLocationIds: new Set(['zone']),
      scans: []
    })

    expect(diff.missing).toEqual([{ plant: nurseryPlants[0] }, { plant: nurseryPlants[1] }])
    expect(diff.matched).toEqual([])
    expect(diff.foreign).toEqual([])
  })

  it('пустая зона → всё отсканированное уходит в foreign, missing пуст', () => {
    const p1 = plant('p1', { qr: 'QR1', location: 'somewhere' })

    const diff = computeInventoryDiff({
      nurseryPlants: [p1],
      zoneLocationIds: new Set(),
      scans: [{ code: 'QR1', scannedAt: 't1' }]
    })

    expect(diff.foreign).toEqual([{ plant: p1, rawCode: 'QR1', scannedAt: 't1' }])
    expect(diff.missing).toEqual([])
    expect(diff.matched).toEqual([])
  })
})
