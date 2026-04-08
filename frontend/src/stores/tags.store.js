import { clearTable, upsertMany } from '@/db/dbUtils'
import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useTagsStore = defineStore('tags', {
  state: () => ({
    tags: [],
    tagsError: '',
    isLoading: false
  }),

  getters: {
    activeTags: (state) => state.tags.filter((item) => Boolean(item.is_active))
  },

  actions: {
    async fetchTags() {
      const nurseryStore = useNurseryStore()
      this.tagsError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/tags`)
        const data = response?.data || []
        this.tags = data
        await clearTable('tags')
        await upsertMany('tags', data)
        return { ok: true }
      } catch (error) {
        this.tagsError = error?.response?.data?.error || 'Не удалось загрузить теги.'
        return { ok: false, error: this.tagsError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal() {
      const localTags = await db.tags.toArray()

      if (localTags.length) {
        this.tags = localTags
      }
    },

    async createTag(formData) {
      const nurseryStore = useNurseryStore()
      this.tagsError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/tags`, formData)
        const created = response?.data || null

        if (created) {
          this.tags.push(created)
          await upsertMany('tags', [created])
        }

        return { ok: true }
      } catch (error) {
        this.tagsError = error?.response?.data?.error || 'Не удалось создать тег.'
        return { ok: false, error: this.tagsError }
      } finally {
        this.isLoading = false
      }
    },

    async updateTag(id, formData) {
      const nurseryStore = useNurseryStore()
      this.tagsError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/tags/${id}`, formData)
        const updated = response?.data || null
        const index = this.tags.findIndex((item) => item.id === id)

        if (updated && index !== -1) {
          this.tags.splice(index, 1, updated)
          await upsertMany('tags', [updated])
        }

        return { ok: true }
      } catch (error) {
        this.tagsError = error?.response?.data?.error || 'Не удалось обновить тег.'
        return { ok: false, error: this.tagsError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteTag(id) {
      const nurseryStore = useNurseryStore()
      this.tagsError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/tags/${id}`)
        await this.fetchTags()
        return { ok: true }
      } catch (error) {
        this.tagsError = error?.response?.data?.error || 'Не удалось удалить тег.'
        return { ok: false, error: this.tagsError }
      } finally {
        this.isLoading = false
      }
    }
  }
})
