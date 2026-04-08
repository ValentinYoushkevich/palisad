import db from '@/db/indexedDb'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
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
    user: parseStoredUser(),
    authError: '',
    isLoading: false,
    isAuthInitialized: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    isAuthorized: (state) => Boolean(state.accessToken),
    role: (state) => state.user?.role || '',
    mustChangePassword: (state) => Boolean(state.user?.mustChangePassword || state.user?.must_change_password),
    isOwner: (state) => state.user?.role === ROLE_OWNER,
    isAgronomist: (state) => state.user?.role === ROLE_AGRONOMIST,
    isWorker: (state) => state.user?.role === ROLE_WORKER,
    isObserver: (state) => state.user?.role === ROLE_OBSERVER,
    canWrite: (state) => [ROLE_OWNER, ROLE_AGRONOMIST, ROLE_WORKER].includes(state.user?.role),
    canManageStructure: (state) => [ROLE_OWNER, ROLE_AGRONOMIST].includes(state.user?.role),
    canManageStaff: (state) => state.user?.role === ROLE_OWNER,
    roleLabel: (state) => roleToLabel(state.user?.role),
    roleLabels: (state) => {
      if (!state.user?.role) {
        return []
      }

      return [roleToLabel(state.user.role)]
    },
    userDisplayName: (state) => (
      state.user?.name ||
      state.user?.fullName ||
      state.user?.full_name ||
      state.user?.email ||
      'Пользователь'
    )
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
    async login(email, password) {
      this.isLoading = true
      this.authError = ''

      try {
        const response = await http.post('/auth/login', {
          email,
          password
        })
        const mustChangePassword = Boolean(
          response?.data?.mustChangePassword || response?.data?.must_change_password
        )
        const responseUser = response?.data?.user || null
        const nextUser = responseUser || this.user || {
          email,
          role: '',
          mustChangePassword
        }

        this.setUser({
          ...nextUser,
          mustChangePassword,
          must_change_password: mustChangePassword
        })
        this.isAuthInitialized = true

        if (this.mustChangePassword) {
          return { redirect: '/change-password', ok: true }
        }

        return { redirect: '/plants', ok: true }
      } catch (error) {
        this.authError = error?.response?.data?.error || 'Не удалось выполнить вход. Проверьте данные.'
        return { ok: false, error: this.authError, redirect: null }
      } finally {
        this.isLoading = false
      }
    },
    async logout() {
      const nurseryStore = useNurseryStore()

      try {
        await http.post('/auth/logout')
      } finally {
        this.clearSession()
        nurseryStore.resetState()
        await clearLocalDb()
      }
    },
    async initAuth() {
      if (this.isAuthInitialized) {
        return
      }

      try {
        const response = await http.post('/auth/refresh')
        const mustChangePassword = Boolean(
          response?.data?.mustChangePassword || response?.data?.must_change_password
        )
        const responseUser = response?.data?.user || null

        if (responseUser) {
          this.setUser({
            ...responseUser,
            mustChangePassword,
            must_change_password: mustChangePassword
          })
          return
        }

        if (response?.status >= 200 && response?.status < 300) {
          const fallbackUser = this.user || {
            role: '',
            mustChangePassword
          }

          this.setUser({
            ...fallbackUser,
            mustChangePassword: Boolean(fallbackUser.mustChangePassword || mustChangePassword),
            must_change_password: Boolean(fallbackUser.must_change_password || mustChangePassword)
          })
          return
        }

        this.clearSession()
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('initAuth failed', error)
        }
        this.clearSession()
      } finally {
        this.isAuthInitialized = true
      }
    },
    async changePassword(currentPassword, newPassword) {
      this.isLoading = true
      this.authError = ''

      try {
        const response = await http.post('/auth/change-password', {
          currentPassword,
          newPassword
        })
        const nextUser = response?.data?.user || null

        if (nextUser) {
          this.setUser(nextUser)
          return
        }

        if (this.user) {
          this.setUser({
            ...this.user,
            mustChangePassword: false,
            must_change_password: false
          })
        }
        return { ok: true }
      } catch (error) {
        this.authError = error?.response?.data?.error || 'Не удалось обновить пароль.'
        return { ok: false, error: this.authError }
      } finally {
        this.isLoading = false
      }
    },
    clearSession() {
      this.clearTokens()
      this.setUser(null)
      // Session has been checked and is empty; do not re-run refresh on every navigation.
      this.isAuthInitialized = true
    }
  }
})

async function clearLocalDb() {
  const tables = [
    'plants',
    'locations',
    'species',
    'tags',
    'movement_types',
    'container_types',
    'operations',
    'movements',
    'pending_photos',
    'sync_queue'
  ]

  await Promise.all(tables.map((tableName) => db.table(tableName).clear()))
}

function roleToLabel(role) {
  const roleLabels = {
    [ROLE_OWNER]: 'Owner',
    [ROLE_AGRONOMIST]: 'Agronomist',
    [ROLE_WORKER]: 'Worker',
    [ROLE_OBSERVER]: 'Observer'
  }

  return roleLabels[role] || role || '—'
}
