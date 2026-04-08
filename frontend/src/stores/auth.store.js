import http from '@/services/http'
import axios from 'axios'
import { defineStore } from 'pinia'

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const USER_KEY = 'authUser'

const ROLE_OWNER = 'owner'
const ROLE_AGRONOMIST = 'agronomist'
const ROLE_WORKER = 'worker'
const ROLE_OBSERVER = 'observer'

function parseStoredUser() {
  const rawUser = localStorage.getItem(USER_KEY)

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Invalid user in localStorage', error)
    }
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
    user: parseStoredUser()
  }),
  getters: {
    isAuthorized: (state) => Boolean(state.accessToken),
    role: (state) => state.user?.role || '',
    mustChangePassword: (state) => Boolean(state.user?.must_change_password),
    isOwner: (state) => state.user?.role === ROLE_OWNER,
    isAgronomist: (state) => state.user?.role === ROLE_AGRONOMIST,
    isWorker: (state) => state.user?.role === ROLE_WORKER,
    isObserver: (state) => state.user?.role === ROLE_OBSERVER
  },
  actions: {
    setUser(user) {
      this.user = user || null

      if (this.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(this.user))
      } else {
        localStorage.removeItem(USER_KEY)
      }
    },
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
    },
    async login(credentials) {
      const response = await axios.post('/api/auth/login', credentials)
      const accessToken = response?.data?.accessToken || ''
      const refreshToken = response?.data?.refreshToken || ''
      const user = response?.data?.user || null

      if (!accessToken || !refreshToken || !user) {
        throw new Error('Invalid login response')
      }

      this.setTokens(accessToken, refreshToken)
      this.setUser(user)
      return user
    },
    async logout() {
      try {
        await http.post('/auth/logout')
      } finally {
        this.clearTokens()
        this.setUser(null)
      }
    },
    async changePassword(payload) {
      const response = await http.post('/auth/change-password', payload)
      const nextUser = response?.data?.user || null

      if (nextUser) {
        this.setUser(nextUser)
      } else if (this.user) {
        this.setUser({
          ...this.user,
          must_change_password: false
        })
      }

      return response?.data || null
    },
    clearSession() {
      this.clearTokens()
      this.setUser(null)
    }
  }
})
