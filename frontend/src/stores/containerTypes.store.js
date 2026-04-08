import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useContainerTypesStore = defineStore('containerTypes', {
  state: () => ({
    containerTypes: [],
    containerTypesError: '',
    isLoading: false
  }),

  getters: {
    systemTypes: (state) => state.containerTypes.filter((item) => Boolean(item.is_system)),
    customTypes: (state) => state.containerTypes.filter((item) => !item.is_system),
    activeTypes: (state) => state.containerTypes.filter((item) => Boolean(item.is_active)),
    byKind: (state) => (kind) => state.containerTypes.filter(
      (item) => item.container_kind === kind && Boolean(item.is_active)
    )
  },

  actions: {
    async fetchContainerTypes() {
      const nurseryStore = useNurseryStore()
      this.containerTypesError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/container-types`)
        const data = response?.data || []
        this.containerTypes = data
        await clearTable('container_types')
        await upsertMany('container_types', data)
        return { ok: true }
      } catch (error) {
        this.containerTypesError = error?.response?.data?.error || 'Не удалось загрузить типы контейнеров.'
        return { ok: false, error: this.containerTypesError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const local = await db.container_types.toArray()

      if (local.length) {
        this.containerTypes = local
      }
    },

    async createContainerType(formData) {
      const nurseryStore = useNurseryStore()
      this.containerTypesError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/container-types`, formData)
        const created = response?.data || null

        if (created) {
          this.containerTypes.push(created)
          await upsertMany('container_types', [created])
        }

        return { ok: true }
      } catch (error) {
        this.containerTypesError = error?.response?.data?.error || 'Не удалось создать тип контейнера.'
        return { ok: false, error: this.containerTypesError }
      } finally {
        this.isLoading = false
      }
    },

    async updateContainerType(id, formData) {
      const nurseryStore = useNurseryStore()
      this.containerTypesError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/container-types/${id}`, formData)
        const updated = response?.data || null
        const index = this.containerTypes.findIndex((item) => item.id === id)

        if (updated && index !== -1) {
          this.containerTypes.splice(index, 1, updated)
          await upsertMany('container_types', [updated])
        }

        return { ok: true }
      } catch (error) {
        this.containerTypesError = error?.response?.data?.error || 'Не удалось обновить тип контейнера.'
        return { ok: false, error: this.containerTypesError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteContainerType(id) {
      const nurseryStore = useNurseryStore()
      this.containerTypesError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/container-types/${id}`)
        this.containerTypes = this.containerTypes.filter((item) => item.id !== id)
        await db.container_types.delete(id)
        return { ok: true }
      } catch (error) {
        this.containerTypesError = error?.response?.data?.error || 'Не удалось удалить тип контейнера.'
        return { ok: false, error: this.containerTypesError }
      } finally {
        this.isLoading = false
      }
    }
  }
})
