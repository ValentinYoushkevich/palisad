import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const usePlantsStore = defineStore('plants', {
  state: () => ({
    plants: [],
    plantsError: '',
    activeFilters: {
      status: null,
      speciesId: null,
      locationId: null,
      tagId: null,
      containerId: null,
      stageId: null,
      search: '',
      numericCode: ''
    },
    pagination: {
      page: 1,
      perPage: 20,
      total: 0
    },
    isLoading: false,
    isSyncing: false
  }),

  getters: {
    filtered: (state) => {
      let result = state.plants
      const filters = state.activeFilters

      if (filters.status) {
        result = result.filter((item) => item.status === filters.status)
      }

      if (filters.speciesId) {
        result = result.filter((item) => item.nursery_species_id === filters.speciesId)
      }

      if (filters.locationId) {
        result = result.filter((item) => item.location_id === filters.locationId)
      }

      if (filters.tagId) {
        result = result.filter((item) => item.tags?.some((tag) => tag.id === filters.tagId))
      }

      if (filters.containerId) {
        result = result.filter((item) => item.container_id === filters.containerId)
      }

      if (filters.stageId) {
        result = result.filter((item) => item.stage_id === filters.stageId)
      }

      if (filters.numericCode) {
        result = result.filter((item) => item.numeric_code?.includes(filters.numericCode))
      }

      if (filters.search) {
        const normalized = filters.search.toLowerCase()
        result = result.filter((item) => (
          item.scientific_name?.toLowerCase().includes(normalized) ||
          item.display_name_ru?.toLowerCase().includes(normalized) ||
          item.variety?.toLowerCase().includes(normalized)
        ))
      }

      return result
    },
    byQr: (state) => (qrCode) => state.plants.find((item) => item.qr_code === qrCode),
    byNumericCode: (state) => (code) => state.plants.find((item) => item.numeric_code === code)
  },

  actions: {
    async fetchPlants(params = {}) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/plants`, {
          params: {
            page: this.pagination.page,
            perPage: this.pagination.perPage,
            ...params
          }
        })
        const payload = response?.data || {}
        const list = payload.data || []

        this.plants = list
        this.pagination.total = payload.total || 0

        // Server wins: на базовой загрузке (первая страница без фильтров) полностью
        // заменяем локальный кэш, а не just bulkPut — иначе удалённые на сервере растения
        // жили бы в IndexedDB вечно и «воскресали» офлайн (F9). Растения офлайн не
        // создаются, поэтому clearTable не теряет несинхронизированных записей.
        if (this.pagination.page === 1 && !hasActiveFilters(this.activeFilters)) {
          await clearTable('plants')
        }
        await upsertMany('plants', list)
        return { ok: true }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось загрузить растения.'
        return { ok: false, error: this.plantsError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const local = await db.plants.filter((item) => !item.deleted_at).toArray()

      if (local.length) {
        this.plants = local
      }
    },

    async createPlant(formData) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/plants`, formData)
        const created = response?.data || null

        if (created) {
          this.plants.unshift(created)
          await upsertMany('plants', [created])
        }

        return { ok: true, data: created }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось создать растение.'
        return { ok: false, error: this.plantsError, data: null }
      } finally {
        this.isLoading = false
      }
    },

    async bulkCreate(template, count) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/plants/bulk`, {
          template,
          count
        })
        const created = response?.data || []
        this.plants.unshift(...created)
        await upsertMany('plants', created)
        return { ok: true }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось выполнить массовое создание.'
        return { ok: false, error: this.plantsError }
      } finally {
        this.isLoading = false
      }
    },

    async updatePlant(id, formData) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/plants/${id}`, formData)
        const updated = response?.data || null
        updateInList(this.plants, updated)

        if (updated) {
          await upsertMany('plants', [updated])
        }

        return { ok: true }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось обновить растение.'
        return { ok: false, error: this.plantsError }
      } finally {
        this.isLoading = false
      }
    },

    async softDelete(id) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/plants/${id}`)
        this.plants = this.plants.filter((item) => item.id !== id)
        // Помечаем удаление и в кэше — иначе loadFromLocal показал бы «воскресшее»
        // растение офлайн (F9). loadFromLocal фильтрует по deleted_at.
        await db.plants.update(id, { deleted_at: new Date().toISOString() })
        return { ok: true }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось удалить растение.'
        return { ok: false, error: this.plantsError }
      } finally {
        this.isLoading = false
      }
    },

    async restore(id) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/plants/${id}/restore`)
        const restored = response?.data || null

        if (restored) {
          this.plants.unshift(restored)
          // Возвращаем растение и в кэш (deleted_at сброшен сервером), иначе офлайн оно
          // осталось бы помеченным удалённым (F9).
          await upsertMany('plants', [restored])
        }

        return { ok: true, data: restored }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось восстановить растение.'
        return { ok: false, error: this.plantsError, data: null }
      } finally {
        this.isLoading = false
      }
    },

    async addTag(plantId, tagId) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''

      try {
        await http.post(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/tags/${tagId}`)
        await this.refreshPlant(plantId)
        return { ok: true }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось добавить тег.'
        return { ok: false, error: this.plantsError }
      }
    },

    async removeTag(plantId, tagId) {
      const nurseryStore = useNurseryStore()
      this.plantsError = ''

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/tags/${tagId}`)
        await this.refreshPlant(plantId)
        return { ok: true }
      } catch (error) {
        this.plantsError = error?.response?.data?.error || 'Не удалось удалить тег.'
        return { ok: false, error: this.plantsError }
      }
    },

    async findByQr(qrCode) {
      const { isOnline } = useOnlineStatus()
      const local = this.byQr(qrCode)

      if (local) {
        return local
      }

      if (isOnline.value) {
        const nurseryStore = useNurseryStore()
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/plants/by-qr/${qrCode}`)
        return response?.data || null
      }

      return null
    },

    async findByNumericCode(code) {
      const { isOnline } = useOnlineStatus()
      const local = this.byNumericCode(code)

      if (local) {
        return local
      }

      if (isOnline.value) {
        const nurseryStore = useNurseryStore()
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/plants/by-code/${code}`)
        return response?.data || null
      }

      return null
    },

    async refreshPlant(id) {
      const nurseryStore = useNurseryStore()
      const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/plants/${id}`)
      const plant = response?.data || null
      updateInList(this.plants, plant)

      if (plant) {
        await upsertMany('plants', [plant])
      }
    },

    setFilter(key, value) {
      this.activeFilters[key] = value
    },

    resetFilters() {
      this.activeFilters = {
        status: null,
        speciesId: null,
        locationId: null,
        tagId: null,
        containerId: null,
        stageId: null,
        search: '',
        numericCode: ''
      }
    }
  }
})

function hasActiveFilters(filters) {
  return Boolean(
    filters.status ||
    filters.speciesId ||
    filters.locationId ||
    filters.tagId ||
    filters.containerId ||
    filters.stageId ||
    filters.search ||
    filters.numericCode
  )
}

function updateInList(list, updated) {
  if (!updated) {
    return
  }

  const index = list.findIndex((item) => item.id === updated.id)

  if (index !== -1) {
    list.splice(index, 1, updated)
    return
  }

  list.unshift(updated)
}
