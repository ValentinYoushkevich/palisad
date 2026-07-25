import http from '@/services/http'
import { defineStore } from 'pinia'

export const useAdminStore = defineStore('admin', {
  state: () => ({
    codes: [],
    codesTotal: 0,
    requests: [],
    requestsTotal: 0,
    plans: [],
    isLoading: false,
    error: '',
    lastIssued: []
  }),
  actions: {
    async fetchPlans() {
      this.error = ''

      try {
        const response = await http.get('/plans')
        this.plans = response?.data || []
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить планы.'
      }
    },
    async fetchCodes({ page = 1, perPage = 20, status } = {}) {
      this.error = ''
      this.isLoading = true

      try {
        const response = await http.get('/admin/license-codes', {
          params: { page, perPage, ...(status ? { status } : {}) }
        })
        const payload = response?.data || {}
        this.codes = payload.data || []
        this.codesTotal = payload.total || 0
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить коды.'
      } finally {
        this.isLoading = false
      }
    },
    async issueCodes({ planId, durationDays, note, count = 1 }) {
      this.error = ''
      this.isLoading = true

      try {
        const response = await http.post('/admin/license-codes', {
          planId,
          durationDays,
          note,
          count
        })
        this.lastIssued = response?.data || []
        // Показываем свежевыпущенные коды в общей таблице сразу — тянем первую страницу.
        await this.fetchCodes({ page: 1, perPage: 20 })
        return { ok: true, codes: this.lastIssued }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось выпустить коды.'
        return { ok: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },
    async revokeCode(id, params = {}) {
      this.error = ''

      try {
        await http.post(`/admin/license-codes/${id}/revoke`)
        await this.fetchCodes(params)
        return { ok: true }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось отозвать код.'
        return { ok: false, error: this.error }
      }
    },
    async fetchRequests({ page = 1, perPage = 20, status } = {}) {
      this.error = ''
      this.isLoading = true

      try {
        const response = await http.get('/admin/plan-requests', {
          params: { page, perPage, ...(status ? { status } : {}) }
        })
        const payload = response?.data || {}
        this.requests = payload.data || []
        this.requestsTotal = payload.total || 0
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить заявки.'
      } finally {
        this.isLoading = false
      }
    },
    async processRequest(id, params = {}) {
      this.error = ''

      try {
        await http.post(`/admin/plan-requests/${id}/process`)
        await this.fetchRequests(params)
        return { ok: true }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось обработать заявку.'
        return { ok: false, error: this.error }
      }
    }
  }
})
