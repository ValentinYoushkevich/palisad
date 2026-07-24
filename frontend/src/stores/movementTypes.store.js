import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useMovementTypesStore = defineStore('movementTypes', {
  state: () => ({
    movementTypes: [],
    movementTypesError: '',
    isLoading: false
  }),

  getters: {
    systemTypes: (state) => state.movementTypes.filter((item) => Boolean(item.is_system)),
    customTypes: (state) => state.movementTypes.filter((item) => !item.is_system),
    activeTypes: (state) => state.movementTypes.filter((item) => Boolean(item.is_active))
  },

  actions: {
    async fetchMovementTypes() {
      const nurseryStore = useNurseryStore()
      this.movementTypesError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/movement-types`)
        const data = response?.data || []
        this.movementTypes = data
        await clearTable('movement_types')
        await upsertMany('movement_types', data)
        return { ok: true }
      } catch (error) {
        this.movementTypesError = error?.response?.data?.error || 'Не удалось загрузить типы движений.'
        // F11: офлайн/сетевой сбой — поднимаем типы движений из кэша Dexie, чтобы история
        // движений и фильтры работали без сети.
        await this.loadFromLocal()
        return { ok: false, error: this.movementTypesError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const local = await db.movement_types.toArray()

      if (local.length) {
        this.movementTypes = local
      }
    },

    async createMovementType(formData) {
      const nurseryStore = useNurseryStore()
      this.movementTypesError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/movement-types`, formData)
        const created = response?.data || null

        if (created) {
          this.movementTypes.push(created)
          await upsertMany('movement_types', [created])
        }

        return { ok: true }
      } catch (error) {
        this.movementTypesError = error?.response?.data?.error || 'Не удалось создать тип движения.'
        return { ok: false, error: this.movementTypesError }
      } finally {
        this.isLoading = false
      }
    },

    async updateMovementType(id, formData) {
      const nurseryStore = useNurseryStore()
      this.movementTypesError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/movement-types/${id}`, formData)
        const updated = response?.data || null
        const index = this.movementTypes.findIndex((item) => item.id === id)

        if (updated && index !== -1) {
          this.movementTypes.splice(index, 1, updated)
          await upsertMany('movement_types', [updated])
        }

        return { ok: true }
      } catch (error) {
        this.movementTypesError = error?.response?.data?.error || 'Не удалось обновить тип движения.'
        return { ok: false, error: this.movementTypesError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteMovementType(id) {
      const nurseryStore = useNurseryStore()
      this.movementTypesError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/movement-types/${id}`)
        this.movementTypes = this.movementTypes.filter((item) => item.id !== id)
        await db.movement_types.delete(id)
        return { ok: true }
      } catch (error) {
        this.movementTypesError = error?.response?.data?.error || 'Не удалось удалить тип движения.'
        return { ok: false, error: this.movementTypesError }
      } finally {
        this.isLoading = false
      }
    }
  }
})
