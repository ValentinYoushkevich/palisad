import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

// Управляем онлайн/офлайн через hoisted-состояние (безопасно для фабрики vi.mock).
const onlineState = vi.hoisted(() => ({ online: true }))
vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: { value: onlineState.online } })
}))

import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { usePlantsStore } from '@/stores/plants.store'

describe('plants.store — поиск по QR/коду для сканера (F12)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    onlineState.online = true
    useNurseryStore().nursery = { id: 'n1' }
    await db.plants.clear()
  })

  it('локальный кэш имеет приоритет — без сетевого запроса', async () => {
    const store = usePlantsStore()
    store.plants = [{ id: 'p1', qr_code: 'qr-1' }]

    const result = await store.findByQr('qr-1')

    expect(result.id).toBe('p1')
    expect(http.get).not.toHaveBeenCalled()
  })

  it('findByQr: 404 (в т.ч. код чужого питомника) → null, без исключения', async () => {
    http.get.mockRejectedValue({ response: { status: 404 } })
    const store = usePlantsStore()

    await expect(store.findByQr('qr-x')).resolves.toBeNull()
  })

  it('findByNumericCode: серверная ошибка 500 → null, без исключения', async () => {
    http.get.mockRejectedValue({ response: { status: 500 } })
    const store = usePlantsStore()

    await expect(store.findByNumericCode('12345')).resolves.toBeNull()
  })

  it('findByQr: успешный ответ возвращает растение', async () => {
    http.get.mockResolvedValue({ data: { id: 'p2', qr_code: 'qr-2' } })
    const store = usePlantsStore()

    const result = await store.findByQr('qr-2')

    expect(result.id).toBe('p2')
  })

  it('офлайн без локальной записи → null и без запроса', async () => {
    onlineState.online = false
    const store = usePlantsStore()

    const result = await store.findByNumericCode('999')

    expect(result).toBeNull()
    expect(http.get).not.toHaveBeenCalled()
  })
})
