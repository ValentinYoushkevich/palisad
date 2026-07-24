import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

import db from '@/db/indexedDb'
import { addToQueue } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useAuthStore } from '@/stores/auth.store'

async function resetTables() {
  await db.table('sync_queue').clear()
  await db.table('pending_photos').clear()
  await db.plants.clear()
  await db.species.clear()
}

describe('auth.store', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    await resetTables()
  })

  afterEach(() => {
    // Не оставляем мок Cache API между тестами — иначе clearSession в других тестах
    // пойдёт в мок вместо no-op ветки (jsdom не имеет caches).
    delete globalThis.caches
  })

  describe('F10 — успешная смена пароля не должна выглядеть как ошибка', () => {
    it('возвращает { ok: true }, когда сервер вернул нового пользователя', async () => {
      http.post.mockResolvedValue({ data: { user: { id: 'u1', role: 'worker' } } })
      const store = useAuthStore()

      const result = await store.changePassword('old', 'new')

      expect(result).toEqual({ ok: true })
    })

    it('возвращает { ok: true }, когда сервер не вернул пользователя (сброс флага)', async () => {
      http.post.mockResolvedValue({ data: {} })
      const store = useAuthStore()
      store.setUser({ id: 'u1', role: 'worker', mustChangePassword: true })

      const result = await store.changePassword('old', 'new')

      expect(result.ok).toBe(true)
      expect(store.user.mustChangePassword).toBe(false)
    })

    it('возвращает { ok: false, error } при ошибке сервера', async () => {
      http.post.mockRejectedValue({ response: { data: { error: 'Неверный текущий пароль' } } })
      const store = useAuthStore()

      const result = await store.changePassword('old', 'new')

      expect(result).toMatchObject({ ok: false, error: 'Неверный текущий пароль' })
    })
  })

  describe('F5 — logout не стирает несинхронизированную очередь молча', () => {
    it('очередь sync_queue не пуста → { ok: false, pending: true }, ничего не тронуто', async () => {
      await addToQueue('create_operation', { plantId: 'p1', nurseryId: 'n1', type: 'note' })
      const store = useAuthStore()

      const result = await store.logout()

      expect(result).toEqual({ ok: false, pending: true })
      expect(http.post).not.toHaveBeenCalled()
      expect(await db.table('sync_queue').count()).toBe(1)
    })

    it('есть pending_photos → { ok: false, pending: true }', async () => {
      await db.table('pending_photos').add({
        operation_id: 'op1',
        status: 'pending',
        mime_type: 'image/webp',
        created_at: Date.now()
      })
      const store = useAuthStore()

      const result = await store.logout()

      expect(result.pending).toBe(true)
      expect(await db.table('pending_photos').count()).toBe(1)
    })

    it('очередь пуста → logout проходит и чистит доменные таблицы', async () => {
      http.post.mockResolvedValue({})
      await db.plants.put({ id: 'pl1', nursery_id: 'n1' })
      const store = useAuthStore()

      const result = await store.logout()

      expect(result).toEqual({ ok: true })
      expect(http.post).toHaveBeenCalledWith('/auth/logout')
      expect(await db.plants.count()).toBe(0)
    })

    it('force: true игнорирует очередь и разлогинивает (после подтверждения UI)', async () => {
      http.post.mockResolvedValue({})
      await addToQueue('create_operation', { plantId: 'p1', nurseryId: 'n1', type: 'note' })
      const store = useAuthStore()

      const result = await store.logout({ force: true })

      expect(result).toEqual({ ok: true })
      expect(await db.table('sync_queue').count()).toBe(0)
    })

    it('офлайн: сетевая ошибка /auth/logout не роняет промис — локальная очистка проходит', async () => {
      // F5: без catch промис logout реджектился, и accept-ветка AppLayout/ChangePasswordPage
      // не доходила до router.push('/login').
      http.post.mockRejectedValue(new TypeError('Network Error'))
      const store = useAuthStore()
      store.setUser({ id: 'u1', role: 'worker' })

      const result = await store.logout({ force: true })

      expect(result).toEqual({ ok: true })
      expect(store.user).toBeNull()
    })
  })

  describe('F6 — clearSession чистит офлайн-данные прошлого аккаунта', () => {
    it('чистит доменные таблицы Dexie и SW-кэши ответов /api/, сохраняя shell/assets', async () => {
      await db.plants.put({ id: 'pl1', nursery_id: 'n1' })
      await db.species.put({ id: 's1', nursery_id: 'n1', name: 'Дуб' })

      const deleteMock = vi.fn().mockResolvedValue(true)
      globalThis.caches = {
        keys: vi.fn().mockResolvedValue([
          'palisad-api-v1',
          'palisad-shell-v1',
          'palisad-assets-v1',
          'api-v1'
        ]),
        delete: deleteMock
      }

      const store = useAuthStore()
      store.setUser({ id: 'u1', role: 'owner' })

      await store.clearSession()

      expect(store.user).toBeNull()
      expect(await db.plants.count()).toBe(0)
      expect(await db.species.count()).toBe(0)

      // Удаляются только кэши с 'api' в имени (в т.ч. легаси api-v1), код приложения цел.
      expect(deleteMock).toHaveBeenCalledWith('palisad-api-v1')
      expect(deleteMock).toHaveBeenCalledWith('api-v1')
      expect(deleteMock).not.toHaveBeenCalledWith('palisad-shell-v1')
      expect(deleteMock).not.toHaveBeenCalledWith('palisad-assets-v1')
    })

    it('без Cache API (jsdom) не падает', async () => {
      const store = useAuthStore()
      await expect(store.clearSession()).resolves.toBeUndefined()
    })
  })
})
