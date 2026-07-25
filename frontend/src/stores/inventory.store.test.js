import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

// Управляем онлайн/офлайн через hoisted-состояние (безопасно для фабрики vi.mock).
const onlineState = vi.hoisted(() => ({ online: true }))
vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: { value: onlineState.online } }),
  isOnline: { get value() { return onlineState.online } }
}))

// triggerSync мокаем no-op'ом: реальный прогон очереди в сторовых тестах не нужен и мог бы
// гонять фоновый POST/markDone, ломая ассерты по sync_queue.
vi.mock('@/composables/useSyncManager', () => ({
  triggerSync: vi.fn()
}))

import { triggerSync } from '@/composables/useSyncManager'
import db from '@/db/indexedDb'
import { useInventoryStore } from '@/stores/inventory.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useNurseryStore } from '@/stores/nursery.store'
import http from '@/services/http'

async function resetTables() {
  await db.table('inventory_sessions_local').clear()
  await db.table('sync_queue').clear()
  await db.plants.clear()
  await db.locations.clear()
}

describe('inventory.store (ФЭ5)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    onlineState.online = true
    useNurseryStore().nursery = { id: 'n1' }
    await resetTables()
  })

  describe('startSession', () => {
    it('создаёт запись в Dexie и выставляет currentSession с localId', async () => {
      const store = useInventoryStore()

      const result = await store.startSession({ id: 'loc1', name: 'Зона A' })

      expect(result.ok).toBe(true)
      expect(result.localId).toBeDefined()

      const stored = await db.table('inventory_sessions_local').get(result.localId)
      expect(stored).toMatchObject({
        nurseryId: 'n1',
        locationId: 'loc1',
        locationName: 'Зона A',
        status: 'scanning',
        scans: []
      })
      expect(store.currentSession).toMatchObject({
        localId: result.localId,
        locationId: 'loc1',
        status: 'scanning'
      })
    })
  })

  describe('addScan', () => {
    it('добавляет скан; повтор того же кода (с пробелами) → duplicate:true, одна запись', async () => {
      const store = useInventoryStore()
      await store.startSession({ id: 'loc1', name: 'Зона A' })

      const first = await store.addScan('ABC')
      expect(first).toEqual({ ok: true, count: 1 })

      const dup = await store.addScan(' ABC ')
      expect(dup).toEqual({ ok: false, duplicate: true })

      expect(store.currentSession.scans).toHaveLength(1)
      expect(store.currentSession.scans[0].code).toBe('ABC')

      const stored = await db.table('inventory_sessions_local').get(store.currentSession.localId)
      expect(stored.scans).toHaveLength(1)
      expect(stored.scans[0].code).toBe('ABC')
    })

    it('пустой/пробельный код → { ok:false, reason:blank }', async () => {
      const store = useInventoryStore()
      await store.startSession({ id: 'loc1', name: 'Зона A' })

      expect(await store.addScan('   ')).toEqual({ ok: false, reason: 'blank' })
      expect(store.currentSession.scans).toHaveLength(0)
    })
  })

  describe('computePreview', () => {
    it('категоризирует по seed-данным Dexie (плоское дерево зоны, часть активна/в зоне)', async () => {
      // Дерево локаций: zone → sub (обе в зоне), out — вне зоны.
      await db.locations.bulkPut([
        { id: 'zone', nursery_id: 'n1', parent_id: null, type: 'zone' },
        { id: 'sub', nursery_id: 'n1', parent_id: 'zone', type: 'shelf' },
        { id: 'out', nursery_id: 'n1', parent_id: null, type: 'zone' }
      ])
      await db.plants.bulkPut([
        { id: 'p1', nursery_id: 'n1', qr_code: 'QR1', numeric_code: null, location_id: 'zone', status: 'growing' },
        { id: 'p2', nursery_id: 'n1', qr_code: 'QR2', numeric_code: null, location_id: 'sub', status: 'storage' },
        { id: 'p3', nursery_id: 'n1', qr_code: 'QR3', numeric_code: null, location_id: 'out', status: 'growing' },
        // Неактивные — должны быть отфильтрованы loadCachedActivePlants.
        { id: 'p4', nursery_id: 'n1', qr_code: 'QR4', numeric_code: null, location_id: 'zone', status: 'sold' },
        { id: 'p5', nursery_id: 'n1', qr_code: 'QR5', numeric_code: null, location_id: 'zone', status: 'growing', deleted_at: '2024-01-01T00:00:00Z' }
      ])

      const store = useInventoryStore()
      await store.startSession({ id: 'zone', name: 'Зона A' })
      await store.addScan('QR1') // matched: p1 в zone
      await store.addScan('QR3') // foreign: p3 в out
      await store.addScan('ZZZ') // unknown

      const result = await store.computePreview()

      expect(result.ok).toBe(true)
      expect(result.diff.counts).toEqual({ matched: 1, missing: 1, foreign: 1, unknown: 1 })
      expect(result.diff.matched[0].plant.id).toBe('p1')
      expect(result.diff.foreign[0].plant.id).toBe('p3')
      // p2 (в sub, в зоне, не отсканирован) → missing; p4/p5 (неактивные) не считаются.
      expect(result.diff.missing).toEqual([{ plant: expect.objectContaining({ id: 'p2' }) }])
      expect(store.previewDiff.counts).toEqual({ matched: 1, missing: 1, foreign: 1, unknown: 1 })
    })
  })

  describe('completeSession', () => {
    it('фиксирует completedAt/clientRequestId/status, персистит и ставит create_inventory_session в очередь', async () => {
      const store = useInventoryStore()
      await store.startSession({ id: 'zone', name: 'Зона A' })
      await store.addScan('QR1')

      const result = await store.completeSession()

      expect(result.ok).toBe(true)
      expect(result.diff).toBeDefined()
      expect(store.currentSession.status).toBe('completed')
      expect(store.currentSession.clientRequestId).toBeTruthy()
      expect(store.currentSession.completedAt).toBeTruthy()

      // Персист в Dexie.
      const stored = await db.table('inventory_sessions_local').get(store.currentSession.localId)
      expect(stored.status).toBe('completed')
      expect(stored.clientRequestId).toBe(store.currentSession.clientRequestId)
      expect(stored.completedAt).toBe(store.currentSession.completedAt)

      // Онлайн → триггерим фоновый синк.
      expect(triggerSync).toHaveBeenCalledTimes(1)

      // Элемент очереди create_inventory_session с корректным payload.
      const queue = await db.table('sync_queue').toArray()
      expect(queue).toHaveLength(1)
      expect(queue[0].type).toBe('create_inventory_session')
      expect(queue[0].payload).toMatchObject({
        nurseryId: 'n1',
        localId: store.currentSession.localId,
        clientRequestId: store.currentSession.clientRequestId,
        locationId: 'zone'
      })
      expect(queue[0].payload.scans).toEqual([expect.objectContaining({ code: 'QR1' })])
    })

    it('офлайн: тоже ставит в очередь, но синк не триггерится', async () => {
      onlineState.online = false
      const store = useInventoryStore()
      await store.startSession({ id: 'zone', name: 'Зона A' })
      await store.addScan('QR1')

      const result = await store.completeSession()

      expect(result.ok).toBe(true)
      expect(triggerSync).not.toHaveBeenCalled()
      expect(await db.table('sync_queue').count()).toBe(1)
    })
  })

  describe('loadServerSessions', () => {
    it('офлайн → { ok:false, offline:true } без сетевого запроса', async () => {
      onlineState.online = false
      const store = useInventoryStore()

      const result = await store.loadServerSessions()

      expect(result).toEqual({ ok: false, offline: true })
      expect(http.get).not.toHaveBeenCalled()
      expect(store.offline).toBe(true)
    })

    it('онлайн: наполняет sessions из data.rows', async () => {
      http.get.mockResolvedValue({ data: { rows: [{ id: 's1' }] } })
      const store = useInventoryStore()

      const result = await store.loadServerSessions()

      expect(result).toEqual({ ok: true })
      expect(http.get).toHaveBeenCalledWith('/nurseries/n1/inventory-sessions')
      expect(store.sessions).toEqual([{ id: 's1' }])
    })
  })

  describe('fetchSessionDetail (ФЭ6)', () => {
    it('онлайн: GET detail, выставляет currentDetail и возвращает { ok:true, detail }', async () => {
      const detail = { id: 's1', locationName: 'Зона A', counts: { matched: 2, missing: 1, foreign: 0, unknown: 0 }, items: { missing: [], foreign: [], unknown: [] } }
      http.get.mockResolvedValue({ data: detail })
      const store = useInventoryStore()

      const result = await store.fetchSessionDetail('s1')

      expect(result).toEqual({ ok: true, detail })
      expect(http.get).toHaveBeenCalledWith('/nurseries/n1/inventory-sessions/s1')
      expect(store.currentDetail).toEqual(detail)
    })

    it('офлайн → { ok:false, offline:true } без сетевого запроса', async () => {
      onlineState.online = false
      const store = useInventoryStore()

      const result = await store.fetchSessionDetail('s1')

      expect(result).toEqual({ ok: false, offline: true })
      expect(http.get).not.toHaveBeenCalled()
      expect(store.offline).toBe(true)
    })
  })

  describe('applySession (ФЭ6)', () => {
    it('онлайн: POST тела на /apply, { ok:true, result }, рефетч detail через GET', async () => {
      const applyResult = { applied: { writtenOff: 2, transferred: 1 }, skipped: [] }
      http.post.mockResolvedValue({ data: applyResult })
      http.get.mockResolvedValue({ data: { id: 's1', items: { missing: [], foreign: [], unknown: [] } } })
      const store = useInventoryStore()

      const body = { writeOff: { plantIds: ['pl1'], movementTypeId: 'mt1' }, transfer: { plantIds: [] } }
      const result = await store.applySession('s1', body)

      expect(result).toEqual({ ok: true, result: applyResult })
      expect(http.post).toHaveBeenCalledWith('/nurseries/n1/inventory-sessions/s1/apply', body)
      // Рефетч detail после применения.
      expect(http.get).toHaveBeenCalledWith('/nurseries/n1/inventory-sessions/s1')
    })

    it('офлайн → { ok:false, offline:true } без POST', async () => {
      onlineState.online = false
      const store = useInventoryStore()

      const result = await store.applySession('s1', {
        writeOff: { plantIds: [], movementTypeId: null },
        transfer: { plantIds: ['pl2'] }
      })

      expect(result).toEqual({ ok: false, offline: true })
      expect(http.post).not.toHaveBeenCalled()
      expect(store.offline).toBe(true)
    })
  })

  describe('loadWriteOffTypes (ФЭ6)', () => {
    it('возвращает только sets_status=written_off && is_active из справочника', async () => {
      useMovementTypesStore().movementTypes = [
        { id: 'mt1', name: 'Списание брака', sets_status: 'written_off', is_active: true },
        { id: 'mt2', name: 'Списание (архив)', sets_status: 'written_off', is_active: false },
        { id: 'mt3', name: 'Продажа', sets_status: 'sold', is_active: true },
        { id: 'mt4', name: 'Перемещение', sets_status: null, is_active: true }
      ]
      const store = useInventoryStore()

      const result = await store.loadWriteOffTypes()

      expect(result.map((type) => type.id)).toEqual(['mt1'])
      expect(store.writeOffTypes.map((type) => type.id)).toEqual(['mt1'])
    })
  })
})
