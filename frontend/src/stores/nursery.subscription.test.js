import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'

const SUBSCRIPTION = {
  id: 'sub-2',
  name: 'Pro',
  plant_limit: 5000,
  user_limit: 10,
  status: 'active',
  expires_at: '2027-01-01T00:00:00.000Z'
}

describe('nursery.store — подписка (Э5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('activateCode', () => {
    it('успех: обновляет subscription и возвращает { ok: true }', async () => {
      http.post.mockResolvedValue({ data: SUBSCRIPTION })
      const store = useNurseryStore()

      const result = await store.activateCode('AAAA-BBBB-CCCC')

      expect(result).toEqual({ ok: true })
      expect(http.post).toHaveBeenCalledWith('/subscriptions/activate-code', { code: 'AAAA-BBBB-CCCC' })
      expect(store.subscription).toEqual(SUBSCRIPTION)
    })

    it('ошибка: возвращает { ok: false, error } с текстом сервера', async () => {
      http.post.mockRejectedValue({
        response: { data: { error: 'Код недействителен или уже использован' } }
      })
      const store = useNurseryStore()

      const result = await store.activateCode('bad')

      expect(result).toEqual({ ok: false, error: 'Код недействителен или уже использован' })
    })
  })

  describe('createPlanRequest', () => {
    it('успех: возвращает { ok: true } и подтягивает список заявок', async () => {
      http.post.mockResolvedValue({ data: { id: 'req-1' } })
      http.get.mockResolvedValue({ data: [{ id: 'req-1', plan_name: 'Pro', status: 'new' }] })
      const store = useNurseryStore()

      const result = await store.createPlanRequest('plan-1', 'позвоните мне')

      expect(result).toEqual({ ok: true })
      expect(http.post).toHaveBeenCalledWith('/plan-requests', { planId: 'plan-1', comment: 'позвоните мне' })
      expect(http.get).toHaveBeenCalledWith('/plan-requests/my')
      expect(store.planRequests).toEqual([{ id: 'req-1', plan_name: 'Pro', status: 'new' }])
    })

    it('409: возвращает { ok: false, error } с текстом про существующую заявку', async () => {
      http.post.mockRejectedValue({
        response: { data: { error: 'У вас уже есть открытая заявка на этот план' } }
      })
      const store = useNurseryStore()

      const result = await store.createPlanRequest('plan-1', '')

      expect(result).toEqual({ ok: false, error: 'У вас уже есть открытая заявка на этот план' })
    })
  })

  describe('fetchMyRequests', () => {
    it('заполняет planRequests из ответа', async () => {
      http.get.mockResolvedValue({ data: [{ id: 'r1' }, { id: 'r2' }] })
      const store = useNurseryStore()

      await store.fetchMyRequests()

      expect(http.get).toHaveBeenCalledWith('/plan-requests/my')
      expect(store.planRequests).toEqual([{ id: 'r1' }, { id: 'r2' }])
    })

    it('на ошибке не падает и оставляет пустой список', async () => {
      http.get.mockRejectedValue(new Error('network'))
      const store = useNurseryStore()

      await expect(store.fetchMyRequests()).resolves.toBeUndefined()
      expect(store.planRequests).toEqual([])
    })
  })
})
