import { clearDomainTables } from '@/db/indexedDb'
import { getPendingPhotos } from '@/db/pendingPhotos.service'
import { getFailedCount, getPending } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useNotificationsStore } from '@/stores/notifications.store'
import { clearCachedNurseryContext, useNurseryStore } from '@/stores/nursery.store'
import { defineStore } from 'pinia'

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
    user: parseStoredUser(),
    authError: '',
    isLoading: false,
    isAuthInitialized: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
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
    async hasUnsyncedData() {
      const [pending, failed, pendingPhotos] = await Promise.all([
        getPending(),
        getFailedCount(),
        getPendingPhotos()
      ])

      return pending.length > 0 || failed > 0 || pendingPhotos.length > 0
    },
    async logout({ force = false } = {}) {
      // F5: logout деструктивен — clearSession → clearDomainTables чистит sync_queue и
      // pending_photos. Без явного force сначала проверяем несинхронизированную очередь и
      // сигналим вызывающему (pending: true), чтобы UI показал подтверждение и не потерял
      // данные молча (по образцу гарда ensureCanSwitch при переключении питомника).
      if (!force && await this.hasUnsyncedData()) {
        return { ok: false, pending: true }
      }

      const nurseryStore = useNurseryStore()
      const notificationsStore = useNotificationsStore()

      try {
        await http.post('/auth/logout')
      } finally {
        await this.clearSession()
        nurseryStore.resetState()
        notificationsStore.resetState()
      }

      return { ok: true }
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

        await this.clearSession()
      } catch (error) {
        const status = error?.response?.status
        // Только явный отказ авторизации (401) сбрасывает сессию. Сетевая/офлайн-ошибка
        // рефреша НЕ должна разлогинивать — иначе офлайн-старт с валидной сессией из
        // localStorage выбрасывает на /login (F4).
        if (status === 401) {
          await this.clearSession()
        } else if (import.meta.env.DEV) {
          console.warn('initAuth network error, keeping cached session', error)
        }
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
          // F10: раньше здесь был голый `return` (undefined) → ChangePasswordPage
          // трактовал успех как ошибку (`if (!result?.ok)`). Возвращаем явный ok.
          return { ok: true }
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
    async clearSession() {
      this.setUser(null)
      // Чистим офлайн-кэш контекста питомника, чтобы он не протёк на следующего
      // пользователя того же браузера при истечении сессии (не только при явном logout).
      clearCachedNurseryContext()
      // Session has been checked and is empty; do not re-run refresh on every navigation.
      this.isAuthInitialized = true
      // F6: доменные данные (Dexie) и SW-кэш ответов /api/ тоже принадлежат прошлому
      // аккаунту — без их очистки следующий пользователь того же браузера видел бы чужие
      // растения офлайн. Централизуем здесь: вызывается и при вынужденном сбросе по 401
      // (истёкший refresh в http.js), и при явном logout (уже после гарда F5).
      await clearDomainTables()
      await clearOfflineCaches()
    }
  }
})

// F6: удаляем только кэши ответов /api/ (растения/справочники прошлого аккаунта). App shell
// и хэшированные ассеты — это код приложения, не пользовательские данные, их сохраняем,
// чтобы офлайн-оболочка продолжала открываться. Имена кэшей заданы в public/sw.js
// (palisad-api-*), плюс подхватываем возможный легаси api-v1 от старого Workbox.
async function clearOfflineCaches() {
  if (typeof caches === 'undefined') {
    return
  }

  try {
    const keys = await caches.keys()
    await Promise.all(
      keys.filter((key) => key.includes('api')).map((key) => caches.delete(key))
    )
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to clear offline API caches', error)
    }
  }
}

function roleToLabel(role) {
  const roleLabels = {
    [ROLE_OWNER]: 'Owner (Админ)',
    [ROLE_AGRONOMIST]: 'Agronomist',
    [ROLE_WORKER]: 'Worker',
    [ROLE_OBSERVER]: 'Observer'
  }

  return roleLabels[role] || role || '—'
}
