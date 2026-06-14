import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useProductionStagesStore = defineStore('productionStages', {
  state: () => ({
    stages: [],
    stagesError: '',
    isLoading: false
  }),

  getters: {
    systemStages: (state) => state.stages.filter((item) => Boolean(item.is_system)),
    customStages: (state) => state.stages.filter((item) => !item.is_system),
    activeStages: (state) => state.stages.filter((item) => Boolean(item.is_active)),
    stageById: (state) => (id) => state.stages.find((item) => item.id === id) || null
  },

  actions: {
    async fetchStages() {
      const nurseryStore = useNurseryStore()
      this.stagesError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/production-stages`)
        const data = response?.data || []
        this.stages = data
        await clearTable('production_stages')
        await upsertMany('production_stages', data)
        return { ok: true }
      } catch (error) {
        this.stagesError = error?.response?.data?.error || 'Не удалось загрузить стадии.'
        return { ok: false, error: this.stagesError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const local = await db.production_stages.toArray()

      if (local.length) {
        this.stages = local
      }
    },

    async createStage(formData) {
      const nurseryStore = useNurseryStore()
      this.stagesError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/production-stages`, formData)
        const created = response?.data || null

        if (created) {
          this.stages.push(created)
          await upsertMany('production_stages', [created])
        }

        return { ok: true }
      } catch (error) {
        this.stagesError = error?.response?.data?.error || 'Не удалось создать стадию.'
        return { ok: false, error: this.stagesError }
      } finally {
        this.isLoading = false
      }
    },

    async updateStage(id, formData) {
      const nurseryStore = useNurseryStore()
      this.stagesError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/production-stages/${id}`, formData)
        const updated = response?.data || null
        const index = this.stages.findIndex((item) => item.id === id)

        if (updated && index !== -1) {
          this.stages.splice(index, 1, updated)
          await upsertMany('production_stages', [updated])
        }

        return { ok: true }
      } catch (error) {
        this.stagesError = error?.response?.data?.error || 'Не удалось обновить стадию.'
        return { ok: false, error: this.stagesError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteStage(id) {
      const nurseryStore = useNurseryStore()
      this.stagesError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/production-stages/${id}`)
        this.stages = this.stages.filter((item) => item.id !== id)
        await db.production_stages.delete(id)
        return { ok: true }
      } catch (error) {
        this.stagesError = error?.response?.data?.error || 'Не удалось удалить стадию.'
        return { ok: false, error: this.stagesError }
      } finally {
        this.isLoading = false
      }
    }
  }
})
