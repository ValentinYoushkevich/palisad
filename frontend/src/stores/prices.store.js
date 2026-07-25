import { isOnline } from '@/composables/useOnlineStatus'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

// Прайс — read/write, но ТОЛЬКО онлайн: ничего не кэшируем в Dexie/localStorage. При офлайне
// action не ходит в сеть и резолвится в { ok: false, offline: true }, а страница показывает
// заглушку (по образцу reports.store). Флаг offline — последнее состояние сети на момент
// запроса, страница читает его для UX.
export const usePricesStore = defineStore('prices', {
  state: () => ({
    prices: [],
    loading: false,
    error: '',
    offline: false
  }),
  actions: {
    async fetchPrices() {
      this.error = ''

      if (!isOnline.value) {
        this.offline = true
        return { ok: false, offline: true }
      }

      this.offline = false
      this.loading = true

      const nurseryStore = useNurseryStore()

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/prices`)
        this.prices = response?.data?.rows || []
        return { ok: true }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить прайс.'
        return { ok: false, error: this.error }
      } finally {
        this.loading = false
      }
    },

    async upsertPrice({ speciesId, containerId, price }) {
      this.error = ''

      if (!isOnline.value) {
        this.offline = true
        return { ok: false, offline: true }
      }

      this.offline = false

      const nurseryStore = useNurseryStore()

      try {
        const response = await http.put(`/nurseries/${nurseryStore.nurseryId}/prices`, {
          speciesId,
          containerId,
          price
        })
        this.applyRow(response?.data || null)
        return { ok: true }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось сохранить цену.'
        return { ok: false, error: this.error }
      }
    },

    async deletePrice(id) {
      this.error = ''

      if (!isOnline.value) {
        this.offline = true
        return { ok: false, offline: true }
      }

      this.offline = false

      const nurseryStore = useNurseryStore()

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/prices/${id}`)
        this.prices = this.prices.filter((row) => row.id !== id)
        return { ok: true }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось удалить цену.'
        return { ok: false, error: this.error }
      }
    },

    // Локально применяем строку upsert'а: заменяем существующую по паре (вид, контейнер) или
    // добавляем новую — чтобы не рефетчить весь список после каждой правки ячейки.
    applyRow(row) {
      if (!row) {
        return
      }

      const index = this.prices.findIndex(
        (item) =>
          item.nurserySpeciesId === row.nurserySpeciesId &&
          item.containerTypeId === row.containerTypeId
      )

      if (index === -1) {
        this.prices.push(row)
        return
      }

      this.prices.splice(index, 1, row)
    }
  }
})
