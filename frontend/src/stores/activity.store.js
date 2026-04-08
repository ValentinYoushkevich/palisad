import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useActivityStore = defineStore('activity', {
  state: () => ({
    logs: [],
    activityError: '',
    filters: {
      dateFrom: null,
      dateTo: null,
      userId: null,
      eventType: null
    },
    pagination: {
      page: 1,
      perPage: 30,
      total: 0
    },
    isLoading: false
  }),

  getters: {
    hasActiveFilters: (state) => {
      const filters = state.filters
      return Boolean(filters.dateFrom || filters.dateTo || filters.userId || filters.eventType)
    }
  },

  actions: {
    async fetchLogs(reset = false) {
      const nurseryStore = useNurseryStore()
      this.activityError = ''

      if (reset) {
        this.pagination.page = 1
        this.logs = []
      }

      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/activity`, {
          params: {
            page: this.pagination.page,
            perPage: this.pagination.perPage,
            ...buildFilterParams(this.filters)
          }
        })
        const payload = response?.data || {}
        const records = payload.data || []

        if (reset) {
          this.logs = records
        } else {
          this.logs.push(...records)
        }

        this.pagination.total = payload.total || 0
        return { ok: true }
      } catch (error) {
        this.activityError = error?.response?.data?.error || 'Не удалось загрузить ленту активности.'
        return { ok: false, error: this.activityError }
      } finally {
        this.isLoading = false
      }
    },

    async loadMore() {
      if (this.logs.length >= this.pagination.total) {
        return
      }

      this.pagination.page += 1
      await this.fetchLogs(false)
    },

    setFilter(key, value) {
      this.filters[key] = value
    },

    async resetFilters() {
      this.filters = {
        dateFrom: null,
        dateTo: null,
        userId: null,
        eventType: null
      }
      await this.fetchLogs(true)
    }
  }
})

function buildFilterParams(filters) {
  const params = {}

  if (filters.dateFrom) {
    params.dateFrom = normalizeDate(filters.dateFrom)
  }

  if (filters.dateTo) {
    params.dateTo = normalizeDate(filters.dateTo)
  }

  if (filters.userId) {
    params.userId = filters.userId
  }

  if (filters.eventType) {
    params.eventType = filters.eventType
  }

  return params
}

function normalizeDate(value) {
  if (typeof value === 'string') {
    return value
  }

  return value.toISOString()
}
