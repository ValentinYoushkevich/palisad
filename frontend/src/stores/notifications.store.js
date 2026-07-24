import { isOnline } from '@/composables/useOnlineStatus'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

// Пуллинг при активной сессии (без WebSocket — чтобы не усложнять офлайн-архитектуру).
const POLL_INTERVAL_MS = 60000

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    items: [],
    unreadCount: 0,
    isLoading: false,
    error: '',
    pollTimer: null,
    onlineHandler: null
  }),
  getters: {
    hasUnread: (state) => state.unreadCount > 0
  },
  actions: {
    async fetchNotifications() {
      // F20: офлайн не дёргаем сеть — тик поллинга молча пропускается, ошибку не выставляем
      // (иначе UI показал бы ложную ошибку загрузки при штатном офлайне).
      if (!isOnline.value) {
        return
      }

      const nurseryStore = useNurseryStore()
      const nurseryId = nurseryStore.activeNurseryId

      if (!nurseryId) {
        return
      }

      this.isLoading = true
      this.error = ''

      try {
        const response = await http.get(`/nurseries/${nurseryId}/notifications`)
        this.items = response?.data?.data || []
        this.unreadCount = response?.data?.unreadCount ?? 0
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось загрузить уведомления.'
      } finally {
        this.isLoading = false
      }
    },
    async markRead(id) {
      const nurseryStore = useNurseryStore()
      const nurseryId = nurseryStore.activeNurseryId

      if (!nurseryId) {
        return
      }

      try {
        await http.patch(`/nurseries/${nurseryId}/notifications/${id}/read`)
        const item = this.items.find((n) => n.id === id)
        if (item && !item.is_read) {
          item.is_read = true
          this.unreadCount = Math.max(0, this.unreadCount - 1)
        }
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось обновить уведомление.'
      }
    },
    async markAllRead() {
      const nurseryStore = useNurseryStore()
      const nurseryId = nurseryStore.activeNurseryId

      if (!nurseryId) {
        return
      }

      try {
        await http.post(`/nurseries/${nurseryId}/notifications/read-all`)
        this.items.forEach((n) => {
          n.is_read = true
        })
        this.unreadCount = 0
      } catch (error) {
        this.error = error?.response?.data?.error || 'Не удалось обновить уведомления.'
      }
    },
    startPolling() {
      if (this.pollTimer) {
        return
      }

      this.fetchNotifications()
      this.pollTimer = globalThis.setInterval(() => {
        this.fetchNotifications()
      }, POLL_INTERVAL_MS)

      // F20: при возврате в онлайн подтягиваем уведомления сразу, не дожидаясь тика (до 60 с).
      // Тики, попавшие на офлайн, fetchNotifications пропускает сам.
      if (!this.onlineHandler && typeof window !== 'undefined') {
        this.onlineHandler = () => {
          this.fetchNotifications()
        }
        window.addEventListener('online', this.onlineHandler)
      }
    },
    stopPolling() {
      if (this.pollTimer) {
        globalThis.clearInterval(this.pollTimer)
        this.pollTimer = null
      }

      if (this.onlineHandler && typeof window !== 'undefined') {
        window.removeEventListener('online', this.onlineHandler)
        this.onlineHandler = null
      }
    },
    resetState() {
      this.stopPolling()
      this.items = []
      this.unreadCount = 0
      this.error = ''
      this.isLoading = false
    }
  }
})
