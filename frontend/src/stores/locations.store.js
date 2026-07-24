import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useLocationsStore = defineStore('locations', {
  state: () => ({
    locations: [],
    locationsError: '',
    isLoading: false
  }),

  getters: {
    tree: (state) => buildTree(state.locations),
    flatList: (state) => state.locations.map((location) => ({
      ...location,
      label: location.name,
      value: location.id
    })),
    byType: (state) => (type) => state.locations.filter((location) => location.type === type)
  },

  actions: {
    async fetchLocations() {
      const nurseryStore = useNurseryStore()
      this.locationsError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/locations`)
        const data = response?.data || []
        this.locations = data
        await this.syncToLocal(data)
        return { ok: true }
      } catch (error) {
        this.locationsError = error?.response?.data?.error || 'Не удалось загрузить локации.'
        // F11: офлайн/сетевой сбой — поднимаем локации из кэша Dexie, чтобы названия и
        // фильтры по локациям работали без сети.
        await this.loadFromLocal()
        return { ok: false, error: this.locationsError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const localLocations = await db.locations.toArray()

      if (localLocations.length) {
        this.locations = localLocations
      }
    },

    async syncToLocal(locations) {
      await clearTable('locations')
      await upsertMany('locations', locations)
    },

    async createLocation(formData) {
      const nurseryStore = useNurseryStore()
      this.locationsError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/locations`, formData)
        const created = response?.data || null

        if (created) {
          this.locations.push(created)
          await upsertMany('locations', [created])
        }

        return { ok: true }
      } catch (error) {
        this.locationsError = error?.response?.data?.error || 'Не удалось создать локацию.'
        return { ok: false, error: this.locationsError }
      } finally {
        this.isLoading = false
      }
    },

    async updateLocation(id, formData) {
      const nurseryStore = useNurseryStore()
      this.locationsError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/locations/${id}`, formData)
        const updated = response?.data || null
        updateInList(this.locations, updated)

        if (updated) {
          await upsertMany('locations', [updated])
        }

        return { ok: true }
      } catch (error) {
        this.locationsError = error?.response?.data?.error || 'Не удалось обновить локацию.'
        return { ok: false, error: this.locationsError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteLocation(id) {
      const nurseryStore = useNurseryStore()
      this.locationsError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/locations/${id}`)
        this.locations = this.locations.filter((location) => location.id !== id)
        await db.locations.delete(id)
        return { ok: true }
      } catch (error) {
        this.locationsError = error?.response?.data?.error || 'Не удалось удалить локацию.'
        return { ok: false, error: this.locationsError }
      } finally {
        this.isLoading = false
      }
    }
  }
})

function buildTree(items, parentId = null) {
  return items
    .filter((item) => item.parent_id === parentId)
    .map((item) => ({
      ...item,
      key: item.id,
      children: buildTree(items, item.id)
    }))
}

function updateInList(list, updatedItem) {
  if (!updatedItem) {
    return
  }

  const index = list.findIndex((item) => item.id === updatedItem.id)

  if (index === -1) {
    list.push(updatedItem)
    return
  }

  list.splice(index, 1, updatedItem)
}
