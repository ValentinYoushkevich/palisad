import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

// Управляем онлайн/офлайн через hoisted-состояние (безопасно для фабрики vi.mock).
const onlineState = vi.hoisted(() => ({ online: true }))
vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: { value: onlineState.online } }),
  isOnline: { get value() { return onlineState.online } }
}))

import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { useReportsStore } from '@/stores/reports.store'

const WRITE_OFFS = {
  period: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z' },
  totalWrittenOff: 12,
  openingCount: 100,
  rate: 0.12,
  rows: [{ key: '2026-01', label: 'Январь 2026', count: 12, share: 1 }]
}

const STOCK_FLOW = {
  period: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z' },
  rows: [{ key: 's1', label: 'Туя', opening: 3, inflow: 2, sold: 1, writtenOff: 1, transfersNet: 0, closing: 3 }],
  totals: { opening: 3, inflow: 2, sold: 1, writtenOff: 1, transfersNet: 0, closing: 3 }
}

const LABOR_COST = {
  period: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z' },
  totalMinutes: 840,
  operationsCount: 20,
  operationsWithoutNorm: 3,
  rows: [{ key: 'sp1', label: 'Туя', minutes: 840, operations: 20, plants: 8, minutesPerPlant: 105 }]
}

// (action, slot, endpoint, payload) — три отчёта проверяем одним набором сценариев.
const CASES = [
  { name: 'fetchWriteOffs', slot: 'writeOffs', endpoint: 'write-offs', payload: WRITE_OFFS, groupBy: 'month' },
  { name: 'fetchStockFlow', slot: 'stockFlow', endpoint: 'stock-flow', payload: STOCK_FLOW, groupBy: 'species' },
  { name: 'fetchLaborCost', slot: 'laborCost', endpoint: 'labor-cost', payload: LABOR_COST, groupBy: 'species' }
]

const PARAMS = { dateFrom: '2026-01-01', dateTo: '2026-06-30' }

describe('reports.store (Э4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    onlineState.online = true
    localStorage.clear()
    useNurseryStore().nursery = { id: 'n1' }
  })

  for (const testCase of CASES) {
    describe(testCase.name, () => {
      it('успех: наполняет data, возвращает { ok: true }, сбрасывает offline', async () => {
        http.get.mockResolvedValue({ data: testCase.payload })
        const store = useReportsStore()

        const result = await store[testCase.name]({ ...PARAMS, groupBy: testCase.groupBy })

        expect(result).toEqual({ ok: true })
        expect(http.get).toHaveBeenCalledWith(`/nurseries/n1/reports/${testCase.endpoint}`, {
          params: { ...PARAMS, groupBy: testCase.groupBy }
        })
        expect(store[testCase.slot].data).toEqual(testCase.payload)
        expect(store[testCase.slot].error).toBe('')
        expect(store.offline).toBe(false)
      })

      it('ошибка HTTP: ставит error, возвращает { ok: false, error }', async () => {
        http.get.mockRejectedValue({ response: { data: { error: 'Некорректные параметры' } } })
        const store = useReportsStore()

        const result = await store[testCase.name]({ ...PARAMS, groupBy: testCase.groupBy })

        expect(result).toEqual({ ok: false, error: 'Некорректные параметры' })
        expect(store[testCase.slot].error).toBe('Некорректные параметры')
        expect(store[testCase.slot].data).toBeNull()
      })

      it('офлайн: без сетевого запроса, возвращает { ok: false, offline: true }', async () => {
        onlineState.online = false
        const store = useReportsStore()

        const result = await store[testCase.name]({ ...PARAMS, groupBy: testCase.groupBy })

        expect(result).toEqual({ ok: false, offline: true })
        expect(http.get).not.toHaveBeenCalled()
        expect(store.offline).toBe(true)
        expect(store[testCase.slot].data).toBeNull()
      })
    })
  }
})
