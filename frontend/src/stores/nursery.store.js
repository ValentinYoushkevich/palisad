import http from '@/services/http'
import { defineStore } from 'pinia'

export const useNurseryStore = defineStore('nursery', {
  state: () => ({
    nursery: null,
    nurseries: [],
    subscription: null,
    plans: [],
    nurseryError: '',
    isLoading: false,
    isInitialized: false
  }),
  getters: {
    nurseryId: (state) => state.nursery?.id || null,
    activeNurseryId: (state) => state.nursery?.id || null,
    planFeatures: (state) => state.subscription || {},
    plantLimit: (state) => state.subscription?.plant_limit ?? 300,
    userLimit: (state) => state.subscription?.user_limit ?? 2,
    hasFeature: (state) => (feature) => {
      if (!state.subscription) {
        return false
      }

      return Boolean(state.subscription[feature])
    }
  },
  actions: {
    async fetchNursery() {
      this.isLoading = true
      this.nurseryError = ''

      try {
        const response = await http.get('/nurseries/my')
        this.nursery = response?.data || null
      } catch (error) {
        if (error?.response?.status === 404) {
          this.nursery = null
          return
        }

        this.nurseryError = error?.response?.data?.error || 'Не удалось загрузить питомник.'
        throw error
      } finally {
        this.isLoading = false
      }
    },
    async createNursery(formData) {
      this.isLoading = true
      this.nurseryError = ''

      try {
        const response = await http.post('/nurseries', formData)
        this.nursery = response?.data || null
        await this.fetchNurseries()
        return { ok: true }
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Ошибка создания питомника.'
        return { ok: false, error: this.nurseryError }
      } finally {
        this.isLoading = false
      }
    },
    async fetchNurseries() {
      try {
        const response = await http.get('/nurseries')
        this.nurseries = response?.data || []
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Не удалось загрузить питомники.'
        throw error
      }
    },
    async switchNursery(nurseryId) {
      if (!nurseryId || nurseryId === this.activeNurseryId) {
        return { ok: true }
      }

      this.isLoading = true
      this.nurseryError = ''

      try {
        await http.post(`/nurseries/${nurseryId}/switch`)
        return { ok: true }
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Не удалось переключить питомник.'
        return { ok: false, error: this.nurseryError }
      } finally {
        this.isLoading = false
      }
    },
    async updateNursery(formData) {
      this.isLoading = true
      this.nurseryError = ''

      try {
        const response = await http.patch('/nurseries/my', formData)
        this.nursery = response?.data || null
        return { ok: true }
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Ошибка обновления питомника.'
        return { ok: false, error: this.nurseryError }
      } finally {
        this.isLoading = false
      }
    },
    async fetchSubscription() {
      this.nurseryError = ''

      try {
        const response = await http.get('/subscriptions/current')
        this.subscription = response?.data || null
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Не удалось загрузить подписку.'
        throw error
      }
    },
    async fetchPlans() {
      this.nurseryError = ''

      try {
        const response = await http.get('/plans')
        this.plans = response?.data || []
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Не удалось загрузить планы.'
        throw error
      }
    },
    async changePlan(planId) {
      this.isLoading = true
      this.nurseryError = ''

      try {
        await http.post('/subscriptions/change', { planId })
        await this.fetchSubscription()
        return { ok: true }
      } catch (error) {
        this.nurseryError = error?.response?.data?.error || 'Не удалось сменить тариф.'
        return { ok: false, error: this.nurseryError }
      } finally {
        this.isLoading = false
      }
    },
    async initNurseryContext() {
      if (this.isInitialized) {
        return
      }

      try {
        await Promise.all([
          this.fetchNursery(),
          this.fetchNurseries(),
          this.fetchSubscription()
        ])
      } finally {
        this.isInitialized = true
      }
    },
    resetState() {
      this.nursery = null
      this.nurseries = []
      this.subscription = null
      this.plans = []
      this.isLoading = false
      this.isInitialized = false
    }
  }
})
