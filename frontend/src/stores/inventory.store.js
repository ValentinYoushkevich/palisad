import { isOnline } from '@/composables/useOnlineStatus'
import { triggerSync } from '@/composables/useSyncManager'
import { SYNC_QUEUE_TYPES } from '@/constants/syncQueue.constants'
import db from '@/db/indexedDb'
import { addToQueue } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { collectSubtreeLocationIds, computeInventoryDiff } from '@/utils/inventoryDiff'
import { defineStore } from 'pinia'

// Активные растения инвентаризуются точно так же, как фильтрует бэкенд:
// deleted_at IS NULL AND status IN ('growing','storage').
const ACTIVE_STATUSES = new Set(['growing', 'storage'])

// Vue-реактивные прокси не переживают structuredClone (запись в Dexie/sync-queue) — снимаем
// простой снапшот сканов перед любой записью в IndexedDB.
function toPlainScans(scans) {
  return (scans || []).map((scan) => ({ code: scan.code, scannedAt: scan.scannedAt }))
}

// Стор инвентаризации (ФЭ5). Вся сверка расхождений считается ЛОКАЛЬНО (офлайн-предпросмотр),
// а завершённая сессия уходит на сервер через sync-очередь (create_inventory_session).
// Actions никогда не бросают, возвращают result-объекты; офлайн-путь короткозамкнут там, где
// нужна сеть (только loadServerSessions). Русские фолбэки ошибок.
export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    currentSession: null,
    previewDiff: null,
    sessions: [],
    currentDetail: null,
    writeOffTypes: [],
    loading: false,
    error: '',
    offline: false
  }),

  getters: {
    scanCount: (state) => state.currentSession?.scans?.length || 0
  },

  actions: {
    // Старт сессии: создаёт локальную scanning-запись в Dexie. Работает офлайн.
    async startSession(location) {
      const nurseryStore = useNurseryStore()
      const record = {
        nurseryId: nurseryStore.nurseryId,
        locationId: location.id,
        locationName: location.name,
        startedAt: new Date().toISOString(),
        status: 'scanning',
        scans: []
      }

      const localId = await db.inventory_sessions_local.add(record)
      this.currentSession = { ...record, localId }
      this.previewDiff = null
      return { ok: true, localId }
    },

    // Добавляет код в текущую сессию с дедупом по обрезанному коду. Работает офлайн.
    async addScan(code) {
      const trimmed = typeof code === 'string' ? code.trim() : ''
      if (!trimmed) {
        return { ok: false, reason: 'blank' }
      }

      if (!this.currentSession) {
        return { ok: false, reason: 'no_session' }
      }

      const scans = this.currentSession.scans || []
      if (scans.some((scan) => scan.code === trimmed)) {
        return { ok: false, duplicate: true }
      }

      const nextScans = [...toPlainScans(scans), { code: trimmed, scannedAt: new Date().toISOString() }]
      await db.inventory_sessions_local.update(this.currentSession.localId, { scans: nextScans })
      this.currentSession.scans = nextScans
      return { ok: true, count: nextScans.length }
    },

    // Активные растения текущего питомника из кэша Dexie (индекс по nursery_id + фильтр). Офлайн.
    async loadCachedActivePlants() {
      const nurseryStore = useNurseryStore()
      const rows = await db.plants
        .where('nursery_id')
        .equals(nurseryStore.nurseryId)
        .toArray()

      return rows.filter((plant) => !plant.deleted_at && ACTIVE_STATUSES.has(plant.status))
    },

    // Локации текущего питомника из кэша Dexie. Офлайн.
    async loadCachedLocations() {
      const nurseryStore = useNurseryStore()
      return db.locations
        .where('nursery_id')
        .equals(nurseryStore.nurseryId)
        .toArray()
    },

    // Локальный предпросмотр расхождений по текущей сессии. Офлайн.
    async computePreview() {
      if (!this.currentSession) {
        return { ok: false, error: 'Нет активной сессии инвентаризации.' }
      }

      const nurseryPlants = await this.loadCachedActivePlants()
      const locations = await this.loadCachedLocations()
      const zone = collectSubtreeLocationIds(this.currentSession.locationId, locations)
      const diff = computeInventoryDiff({
        nurseryPlants,
        zoneLocationIds: zone,
        scans: this.currentSession.scans || []
      })

      this.previewDiff = {
        counts: {
          matched: diff.matched.length,
          missing: diff.missing.length,
          foreign: diff.foreign.length,
          unknown: diff.unknown.length
        },
        ...diff
      }

      return { ok: true, diff: this.previewDiff }
    },

    // Завершает сессию: фиксирует completedAt/clientRequestId/status, считает предпросмотр,
    // ставит create_inventory_session в очередь и (если онлайн) триггерит синк. Локальная
    // запись остаётся до успешного синка — sync-менеджер удалит её сам. Офлайн-совместимо
    // (в офлайне просто копится в очереди).
    async completeSession() {
      if (!this.currentSession) {
        return { ok: false, error: 'Нет активной сессии инвентаризации.' }
      }

      const completedAt = new Date().toISOString()
      const clientRequestId = crypto.randomUUID()

      await db.inventory_sessions_local.update(this.currentSession.localId, {
        completedAt,
        clientRequestId,
        status: 'completed'
      })
      this.currentSession.completedAt = completedAt
      this.currentSession.clientRequestId = clientRequestId
      this.currentSession.status = 'completed'

      await this.computePreview()

      // clientRequestId фиксируется на всё время жизни записи — и синк, и повторная доставка
      // уходят с одним ключом идемпотентности (F2). nurseryId/localId сервер отбросит.
      await addToQueue(SYNC_QUEUE_TYPES.CREATE_INVENTORY_SESSION, {
        nurseryId: this.currentSession.nurseryId,
        localId: this.currentSession.localId,
        locationId: this.currentSession.locationId,
        startedAt: this.currentSession.startedAt,
        completedAt,
        clientRequestId,
        scans: toPlainScans(this.currentSession.scans)
      })

      if (isOnline.value) {
        // Fire-and-forget: очередь — источник истины, синк идёт в фоне (как processQueue() в
        // AppLayout). Не ждём завершения, чтобы вернуть предпросмотр сразу.
        triggerSync()
      }

      return { ok: true, diff: this.previewDiff }
    },

    // История сессий с сервера. ТОЛЬКО онлайн: офлайн → { ok:false, offline:true }.
    async loadServerSessions() {
      this.error = ''

      if (!isOnline.value) {
        this.offline = true
        return { ok: false, offline: true }
      }

      this.offline = false
      this.loading = true

      const nurseryStore = useNurseryStore()

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/inventory-sessions`)
        this.sessions = response?.data?.rows || []
        return { ok: true }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить сессии инвентаризации.'
        return { ok: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    // Детальная серверная сессия (missing/foreign/unknown + counts). ТОЛЬКО онлайн:
    // офлайн → { ok:false, offline:true }.
    async fetchSessionDetail(id) {
      this.error = ''

      if (!isOnline.value) {
        this.offline = true
        return { ok: false, offline: true }
      }

      this.offline = false
      this.loading = true

      const nurseryStore = useNurseryStore()

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/inventory-sessions/${id}`)
        this.currentDetail = response?.data || null
        return { ok: true, detail: this.currentDetail }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить сессию инвентаризации.'
        return { ok: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    // Применение результатов сессии: списание missing и/или перемещение foreign в зону.
    // ТОЛЬКО онлайн. После успеха рефетчит detail — у применённых строк появляется
    // appliedMovementId (источник истины — сервер).
    async applySession(id, { writeOff, transfer }) {
      this.error = ''

      if (!isOnline.value) {
        this.offline = true
        return { ok: false, offline: true }
      }

      this.offline = false

      const nurseryStore = useNurseryStore()

      try {
        const response = await http.post(
          `/nurseries/${nurseryStore.nurseryId}/inventory-sessions/${id}/apply`,
          { writeOff, transfer }
        )
        const result = response?.data || null
        await this.fetchSessionDetail(id)
        return { ok: true, result }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось применить результаты инвентаризации.'
        return { ok: false, error: this.error }
      }
    },

    // Типы движений «списание» из справочника типов движений (кэш/стор). Фильтр совпадает
    // с бэкендом: sets_status === 'written_off' && is_active. Офлайн-совместимо: если стор
    // пуст, поднимаем справочник из кэша Dexie.
    async loadWriteOffTypes() {
      const movementTypesStore = useMovementTypesStore()

      if (!movementTypesStore.movementTypes.length) {
        await movementTypesStore.loadFromLocal()
      }

      this.writeOffTypes = movementTypesStore.movementTypes.filter(
        (type) => type.sets_status === 'written_off' && Boolean(type.is_active)
      )

      return this.writeOffTypes
    },

    resetCurrent() {
      this.currentSession = null
      this.previewDiff = null
    }
  }
})
