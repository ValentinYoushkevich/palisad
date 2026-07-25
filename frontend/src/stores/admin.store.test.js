import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

import http from '@/services/http'
import { useAdminStore } from '@/stores/admin.store'

const ISSUED_CODES = [
  { id: 'c1', code: 'AAAA-BBBB-CCCC', plan_id: 'plan-1', duration_days: 30, status: 'issued' },
  { id: 'c2', code: 'DDDD-EEEE-FFFF', plan_id: 'plan-1', duration_days: 30, status: 'issued' }
]

describe('admin.store (Э6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('fetchCodes', () => {
    it('заполняет codes и codesTotal из ответа', async () => {
      http.get.mockResolvedValue({ data: { data: ISSUED_CODES, total: 42, page: 1, perPage: 20 } })
      const store = useAdminStore()

      await store.fetchCodes({ page: 1, perPage: 20, status: 'issued' })

      expect(http.get).toHaveBeenCalledWith('/admin/license-codes', {
        params: { page: 1, perPage: 20, status: 'issued' }
      })
      expect(store.codes).toEqual(ISSUED_CODES)
      expect(store.codesTotal).toBe(42)
    })
  })

  describe('issueCodes', () => {
    it('успех: возвращает { ok, codes }, ставит lastIssued и делает refetch', async () => {
      http.post.mockResolvedValue({ data: ISSUED_CODES })
      http.get.mockResolvedValue({ data: { data: ISSUED_CODES, total: 2 } })
      const store = useAdminStore()

      const result = await store.issueCodes({ planId: 'plan-1', durationDays: 30, count: 2 })

      expect(result).toEqual({ ok: true, codes: ISSUED_CODES })
      expect(store.lastIssued).toEqual(ISSUED_CODES)
      expect(http.post).toHaveBeenCalledWith('/admin/license-codes', {
        planId: 'plan-1',
        durationDays: 30,
        note: undefined,
        count: 2
      })
      // refetch первой страницы кодов
      expect(http.get).toHaveBeenCalledWith('/admin/license-codes', expect.anything())
      expect(store.codes).toEqual(ISSUED_CODES)
    })

    it('ошибка: возвращает { ok: false, error } с текстом сервера', async () => {
      http.post.mockRejectedValue({ response: { data: { error: 'План не найден' } } })
      const store = useAdminStore()

      const result = await store.issueCodes({ planId: 'bad', durationDays: 30, count: 1 })

      expect(result).toEqual({ ok: false, error: 'План не найден' })
      expect(http.get).not.toHaveBeenCalled()
    })
  })

  describe('revokeCode', () => {
    it('успех: возвращает { ok: true } и делает refetch текущей страницы', async () => {
      http.post.mockResolvedValue({ data: { id: 'c1', status: 'revoked' } })
      http.get.mockResolvedValue({ data: { data: [], total: 0 } })
      const store = useAdminStore()

      const result = await store.revokeCode('c1', { page: 2, perPage: 20, status: 'issued' })

      expect(result).toEqual({ ok: true })
      expect(http.post).toHaveBeenCalledWith('/admin/license-codes/c1/revoke')
      expect(http.get).toHaveBeenCalledWith('/admin/license-codes', {
        params: { page: 2, perPage: 20, status: 'issued' }
      })
    })

    it('409: возвращает { ok: false, error }', async () => {
      http.post.mockRejectedValue({ response: { data: { error: 'Код уже активирован' } } })
      const store = useAdminStore()

      const result = await store.revokeCode('c1', { page: 1, perPage: 20 })

      expect(result).toEqual({ ok: false, error: 'Код уже активирован' })
      expect(http.get).not.toHaveBeenCalled()
    })
  })

  describe('fetchRequests', () => {
    it('заполняет requests и requestsTotal из ответа', async () => {
      const requests = [{ id: 'r1', account_email: 'a@b.c', plan_name: 'Pro', status: 'new' }]
      http.get.mockResolvedValue({ data: { data: requests, total: 7 } })
      const store = useAdminStore()

      await store.fetchRequests({ page: 1, perPage: 20, status: 'new' })

      expect(http.get).toHaveBeenCalledWith('/admin/plan-requests', {
        params: { page: 1, perPage: 20, status: 'new' }
      })
      expect(store.requests).toEqual(requests)
      expect(store.requestsTotal).toBe(7)
    })
  })

  describe('processRequest', () => {
    it('успех: возвращает { ok: true } и делает refetch', async () => {
      http.post.mockResolvedValue({ data: { id: 'r1', status: 'processed' } })
      http.get.mockResolvedValue({ data: { data: [], total: 0 } })
      const store = useAdminStore()

      const result = await store.processRequest('r1', { page: 1, perPage: 20, status: 'new' })

      expect(result).toEqual({ ok: true })
      expect(http.post).toHaveBeenCalledWith('/admin/plan-requests/r1/process')
      expect(http.get).toHaveBeenCalledWith('/admin/plan-requests', {
        params: { page: 1, perPage: 20, status: 'new' }
      })
    })

    it('409: возвращает { ok: false, error }', async () => {
      http.post.mockRejectedValue({ response: { data: { error: 'Заявка уже обработана' } } })
      const store = useAdminStore()

      const result = await store.processRequest('r1', { page: 1, perPage: 20 })

      expect(result).toEqual({ ok: false, error: 'Заявка уже обработана' })
      expect(http.get).not.toHaveBeenCalled()
    })
  })
})
