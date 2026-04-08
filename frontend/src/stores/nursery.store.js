import { nurseryApi } from '@/api/nursery.api'
import { subscriptionApi } from '@/api/subscription.api'
import { defineStore } from 'pinia'

export const useNurseryStore = defineStore('nursery', {
  state: () => ({
    nursery: null,
    subscription: null,
    plans: [],
    isLoading: false,
    isInitialized: false
  }),
  getters: {
    nurseryId: (state) => state.nursery?.id || null,
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

      try {
        const response = await nurseryApi.getMy()
        this.nursery = response?.data || null
      } catch (error) {
        if (error?.response?.status === 404) {
          this.nursery = null
          return
        }

        throw error
      } finally {
        this.isLoading = false
      }
    },
    async createNursery(formData) {
      this.isLoading = true

      try {
        const response = await nurseryApi.create(formData)
        this.nursery = response?.data || null
      } finally {
        this.isLoading = false
      }
    },
    async updateNursery(formData) {
      this.isLoading = true

      try {
        const response = await nurseryApi.update(formData)
        this.nursery = response?.data || null
      } finally {
        this.isLoading = false
      }
    },
    async fetchSubscription() {
      const response = await subscriptionApi.getCurrent()
      this.subscription = response?.data || null
    },
    async fetchPlans() {
      const response = await subscriptionApi.getPlans()
      this.plans = response?.data || []
    },
    async changePlan(planId) {
      this.isLoading = true

      try {
        await subscriptionApi.change(planId)
        await this.fetchSubscription()
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
          this.fetchSubscription()
        ])
      } finally {
        this.isInitialized = true
      }
    },
    resetState() {
      this.nursery = null
      this.subscription = null
      this.plans = []
      this.isLoading = false
      this.isInitialized = false
    }
  }
})
