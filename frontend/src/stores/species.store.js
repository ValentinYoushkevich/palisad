import { useDebounceFn } from '@/composables/useDebounceFn'
import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useSpeciesStore = defineStore('species', {
  state: () => ({
    species: [],
    searchResults: [],
    speciesError: '',
    isSearching: false,
    isLoading: false
  }),

  getters: {
    activeSpecies: (state) => state.species.filter((item) => Boolean(item.is_active))
  },

  actions: {
    async fetchSpecies() {
      const nurseryStore = useNurseryStore()
      this.speciesError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/species`)
        const data = response?.data || []
        this.species = data
        await this.syncToLocal(data)
        return { ok: true }
      } catch (error) {
        this.speciesError = error?.response?.data?.error || 'Не удалось загрузить виды.'
        return { ok: false, error: this.speciesError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const localSpecies = await db.species.toArray()

      if (localSpecies.length) {
        this.species = localSpecies
      }
    },

    async syncToLocal(items) {
      await clearTable('species')
      await upsertMany('species', items)
    },

    searchGbif: useDebounceFn(async function (query) {
      if (!query || query.length < 2) {
        this.searchResults = []
        return
      }

      const nurseryStore = useNurseryStore()
      this.speciesError = ''
      this.isSearching = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/species/search`, {
          params: { q: query }
        })
        this.searchResults = response?.data || []
      } catch (error) {
        this.speciesError = error?.response?.data?.error || 'Не удалось выполнить поиск вида.'
      } finally {
        this.isSearching = false
      }
    }, 400),

    async createSpecies(formData) {
      const nurseryStore = useNurseryStore()
      this.speciesError = ''
      this.isLoading = true

      try {
        const response = await http.post(
          `/nurseries/${nurseryStore.nurseryId}/species/attach-by-name`,
          formData
        )
        const data = response?.data || null

        if (data && !data.alreadyExists) {
          this.species.push(data)
          await upsertMany('species', [data])
        }

        return { ok: true, data }
      } catch (error) {
        this.speciesError = error?.response?.data?.error || 'Не удалось создать вид.'
        return { ok: false, error: this.speciesError, data: null }
      } finally {
        this.isLoading = false
      }
    },

    async updateSpecies(id, formData) {
      const nurseryStore = useNurseryStore()
      this.speciesError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/species/${id}`, formData)
        const data = response?.data || null
        updateInList(this.species, data)

        if (data) {
          await upsertMany('species', [data])
        }

        return { ok: true }
      } catch (error) {
        this.speciesError = error?.response?.data?.error || 'Не удалось обновить вид.'
        return { ok: false, error: this.speciesError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteSpecies(id) {
      const nurseryStore = useNurseryStore()
      this.speciesError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/species/${id}`)
        await this.fetchSpecies()
        return { ok: true }
      } catch (error) {
        this.speciesError = error?.response?.data?.error || 'Не удалось удалить вид.'
        return { ok: false, error: this.speciesError }
      } finally {
        this.isLoading = false
      }
    }
  }
})

function updateInList(list, updated) {
  if (!updated) {
    return
  }

  const index = list.findIndex((item) => item.id === updated.id)

  if (index === -1) {
    list.push(updated)
    return
  }

  list.splice(index, 1, updated)
}
