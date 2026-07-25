import { isOnline } from '@/composables/useOnlineStatus'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

// Отчёты — read-only и ТОЛЬКО онлайн: ничего не кэшируем в Dexie/localStorage. При офлайне
// action не ходит в сеть и резолвится в { ok: false, offline: true }, а страница показывает
// заглушку. Каждый отчёт держит свой слот { data, loading, error }; общий флаг offline —
// последнее состояние сети на момент запроса.
function createSlot() {
  return { data: null, loading: false, error: '' }
}

// Оставляем только заданные query-параметры (пустые не отправляем на бэкенд).
function buildQuery({ dateFrom, dateTo, groupBy } = {}) {
  const query = {}
  if (dateFrom) {
    query.dateFrom = dateFrom
  }
  if (dateTo) {
    query.dateTo = dateTo
  }
  if (groupBy) {
    query.groupBy = groupBy
  }
  return query
}

// Единая загрузка отчёта: офлайн-гард → GET nursery-скоупного эндпоинта → раскладка в слот.
async function loadReport(store, slotKey, endpoint, params) {
  const slot = store[slotKey]
  slot.error = ''

  if (!isOnline.value) {
    store.offline = true
    return { ok: false, offline: true }
  }

  store.offline = false
  slot.loading = true

  const nurseryStore = useNurseryStore()

  try {
    const response = await http.get(
      `/nurseries/${nurseryStore.nurseryId}/reports/${endpoint}`,
      { params: buildQuery(params) }
    )
    slot.data = response?.data || null
    return { ok: true }
  } catch (error) {
    slot.error = error?.response?.data?.error || 'Не удалось загрузить отчёт.'
    return { ok: false, error: slot.error }
  } finally {
    slot.loading = false
  }
}

export const useReportsStore = defineStore('reports', {
  state: () => ({
    writeOffs: createSlot(),
    stockFlow: createSlot(),
    laborCost: createSlot(),
    offline: false
  }),
  actions: {
    fetchWriteOffs(params) {
      return loadReport(this, 'writeOffs', 'write-offs', params)
    },
    fetchStockFlow(params) {
      return loadReport(this, 'stockFlow', 'stock-flow', params)
    },
    fetchLaborCost(params) {
      return loadReport(this, 'laborCost', 'labor-cost', params)
    }
  }
})
