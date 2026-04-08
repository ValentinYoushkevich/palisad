import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

export const useStaffStore = defineStore('staff', {
  state: () => ({
    users: [],
    staffError: '',
    isLoading: false
  }),

  getters: {
    activeUsers: (state) => state.users.filter((user) => Boolean(user.is_active)),
    byRole: (state) => (role) => state.users.filter((user) => user.role === role)
  },

  actions: {
    async fetchUsers(filters = {}) {
      const nurseryStore = useNurseryStore()
      this.staffError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/users`, {
          params: filters
        })
        this.users = response?.data || []
        return { ok: true }
      } catch (error) {
        this.staffError = error?.response?.data?.error || 'Не удалось загрузить сотрудников.'
        return { ok: false, error: this.staffError }
      } finally {
        this.isLoading = false
      }
    },

    async createUser(formData) {
      const nurseryStore = useNurseryStore()
      this.staffError = ''
      this.isLoading = true

      try {
        const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/users`, formData)
        const created = response?.data || null

        if (created) {
          this.users.push(created)
        }

        return { ok: true, data: created }
      } catch (error) {
        this.staffError = error?.response?.data?.error || 'Не удалось создать сотрудника.'
        return { ok: false, error: this.staffError }
      } finally {
        this.isLoading = false
      }
    },

    async updateUser(id, formData) {
      const nurseryStore = useNurseryStore()
      this.staffError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/users/${id}`, formData)
        updateInList(this.users, response?.data)
        return { ok: true }
      } catch (error) {
        this.staffError = error?.response?.data?.error || 'Не удалось обновить сотрудника.'
        return { ok: false, error: this.staffError }
      } finally {
        this.isLoading = false
      }
    },

    async changeRole(id, role) {
      const nurseryStore = useNurseryStore()
      this.staffError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/users/${id}/role`, {
          role
        })
        updateInList(this.users, response?.data)
        return { ok: true }
      } catch (error) {
        this.staffError = error?.response?.data?.error || 'Не удалось изменить роль сотрудника.'
        return { ok: false, error: this.staffError }
      } finally {
        this.isLoading = false
      }
    },

    async toggleStatus(id) {
      const nurseryStore = useNurseryStore()
      this.staffError = ''
      this.isLoading = true

      try {
        const response = await http.patch(`/nurseries/${nurseryStore.nurseryId}/users/${id}/status`)
        updateInList(this.users, response?.data)
        return { ok: true }
      } catch (error) {
        this.staffError = error?.response?.data?.error || 'Не удалось изменить статус сотрудника.'
        return { ok: false, error: this.staffError }
      } finally {
        this.isLoading = false
      }
    }
  }
})

function updateInList(list, updatedUser) {
  if (!updatedUser) {
    return
  }

  const index = list.findIndex((user) => user.id === updatedUser.id)

  if (index === -1) {
    list.push(updatedUser)
    return
  }

  list.splice(index, 1, updatedUser)
}
