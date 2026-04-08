import { defineStore } from 'pinia'

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || ''
  }),
  getters: {
    isAuthorized: (state) => Boolean(state.accessToken)
  },
  actions: {
    setTokens(accessToken, refreshToken) {
      this.accessToken = accessToken || ''
      this.refreshToken = refreshToken || ''

      if (this.accessToken) {
        localStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken)
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
      }

      if (this.refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, this.refreshToken)
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY)
      }
    },
    clearTokens() {
      this.setTokens('', '')
    }
  }
})
