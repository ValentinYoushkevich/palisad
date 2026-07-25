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

import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { usePricesStore } from '@/stores/prices.store'

const PRICE_ROWS = [
  {
    id: 'p1',
    nurserySpeciesId: 's1',
    containerTypeId: 'c1',
    price: '100.50',
    speciesName: 'Туя западная',
    containerName: 'Горшок 3л',
    containerCode: 'P3'
  }
]

describe('prices.store (Э4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    onlineState.online = true
    localStorage.clear()
    useNurseryStore().nursery = { id: 'n1' }
  })

  describe('fetchPrices', () => {
    it('успех: наполняет prices из rows, { ok: true }, сбрасывает offline', async () => {
      http.get.mockResolvedValue({ data: { rows: PRICE_ROWS } })
      const store = usePricesStore()

      const result = await store.fetchPrices()

      expect(result).toEqual({ ok: true })
      expect(http.get).toHaveBeenCalledWith('/nurseries/n1/prices')
      expect(store.prices).toEqual(PRICE_ROWS)
      expect(store.error).toBe('')
      expect(store.offline).toBe(false)
    })

    it('ошибка HTTP: ставит error, возвращает { ok: false, error }', async () => {
      http.get.mockRejectedValue({ response: { data: { error: 'Некорректные параметры' } } })
      const store = usePricesStore()

      const result = await store.fetchPrices()

      expect(result).toEqual({ ok: false, error: 'Некорректные параметры' })
      expect(store.error).toBe('Некорректные параметры')
      expect(store.prices).toEqual([])
    })

    it('офлайн: без сетевого запроса, возвращает { ok: false, offline: true }', async () => {
      onlineState.online = false
      const store = usePricesStore()

      const result = await store.fetchPrices()

      expect(result).toEqual({ ok: false, offline: true })
      expect(http.get).not.toHaveBeenCalled()
      expect(store.offline).toBe(true)
    })
  })

  describe('upsertPrice', () => {
    it('успех (создание): PUT с телом, добавляет строку, { ok: true }', async () => {
      const created = {
        id: 'p2',
        nurserySpeciesId: 's2',
        containerTypeId: 'c2',
        price: '55.00'
      }
      http.put.mockResolvedValue({ data: created })
      const store = usePricesStore()

      const result = await store.upsertPrice({ speciesId: 's2', containerId: 'c2', price: 55 })

      expect(result).toEqual({ ok: true })
      expect(http.put).toHaveBeenCalledWith('/nurseries/n1/prices', {
        speciesId: 's2',
        containerId: 'c2',
        price: 55
      })
      expect(store.prices).toContainEqual(created)
    })

    it('успех (обновление): заменяет строку по паре (вид, контейнер), без дублей', async () => {
      http.get.mockResolvedValue({ data: { rows: PRICE_ROWS } })
      const store = usePricesStore()
      await store.fetchPrices()

      const updated = { ...PRICE_ROWS[0], price: '120.00' }
      http.put.mockResolvedValue({ data: updated })

      await store.upsertPrice({ speciesId: 's1', containerId: 'c1', price: 120 })

      expect(store.prices).toHaveLength(1)
      expect(store.prices[0].price).toBe('120.00')
    })

    it('ошибка HTTP: ставит error, возвращает { ok: false, error }', async () => {
      http.put.mockRejectedValue({ response: { data: { error: 'Цена не может быть отрицательной' } } })
      const store = usePricesStore()

      const result = await store.upsertPrice({ speciesId: 's1', containerId: 'c1', price: -1 })

      expect(result).toEqual({ ok: false, error: 'Цена не может быть отрицательной' })
      expect(store.error).toBe('Цена не может быть отрицательной')
    })

    it('офлайн: без сетевого запроса, возвращает { ok: false, offline: true }', async () => {
      onlineState.online = false
      const store = usePricesStore()

      const result = await store.upsertPrice({ speciesId: 's1', containerId: 'c1', price: 10 })

      expect(result).toEqual({ ok: false, offline: true })
      expect(http.put).not.toHaveBeenCalled()
      expect(store.offline).toBe(true)
    })
  })

  describe('deletePrice', () => {
    it('успех: DELETE по id, убирает строку из state, { ok: true }', async () => {
      http.get.mockResolvedValue({ data: { rows: PRICE_ROWS } })
      const store = usePricesStore()
      await store.fetchPrices()

      http.delete.mockResolvedValue({})

      const result = await store.deletePrice('p1')

      expect(result).toEqual({ ok: true })
      expect(http.delete).toHaveBeenCalledWith('/nurseries/n1/prices/p1')
      expect(store.prices).toEqual([])
    })

    it('ошибка HTTP: ставит error, возвращает { ok: false, error }', async () => {
      http.delete.mockRejectedValue({ response: { data: { error: 'Позиция не найдена' } } })
      const store = usePricesStore()

      const result = await store.deletePrice('p1')

      expect(result).toEqual({ ok: false, error: 'Позиция не найдена' })
      expect(store.error).toBe('Позиция не найдена')
    })

    it('офлайн: без сетевого запроса, возвращает { ok: false, offline: true }', async () => {
      onlineState.online = false
      const store = usePricesStore()

      const result = await store.deletePrice('p1')

      expect(result).toEqual({ ok: false, offline: true })
      expect(http.delete).not.toHaveBeenCalled()
      expect(store.offline).toBe(true)
    })
  })
})
