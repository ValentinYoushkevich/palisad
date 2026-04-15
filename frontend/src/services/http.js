import { refreshAndRetryRequest } from '@/helpers/httpRefresh.helper'
import { useAuthStore } from '@/stores/auth.store'
import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  withCredentials: true
})

let isRefreshing = false
let pendingRequests = []
let isRedirectingToLogin = false

function resolvePendingRequests(isSuccess) {
  pendingRequests.forEach((callback) => callback(isSuccess))
  pendingRequests = []
}

function rejectPendingRequests() {
  pendingRequests.forEach((callback) => callback(false))
  pendingRequests = []
}

async function refreshAccessToken() {
  const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
  return response?.status >= 200 && response?.status < 300
}

function logoutAndRedirect() {
  const authStore = useAuthStore()
  authStore.clearSession()

  // Avoid recursive reloads when refresh fails on the login page.
  if (globalThis.location.pathname === '/login' || isRedirectingToLogin) {
    return
  }

  isRedirectingToLogin = true
  globalThis.location.assign('/login')
}

http.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  const requestConfig = { ...config }

  if (!requestConfig.headers) {
    requestConfig.headers = {}
  }

  if (authStore.accessToken) {
    requestConfig.headers.Authorization = `Bearer ${authStore.accessToken}`
  }

  return requestConfig
})

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const originalRequest = error?.config

    if (!originalRequest) {
      throw error
    }

    const isRefreshRequest = originalRequest?.url?.includes('/auth/refresh')
    const isLoginRequest = originalRequest?.url?.includes('/auth/login')

    if (status !== 401 || originalRequest._retry || isRefreshRequest || isLoginRequest) {
      if (status === 401 && isRefreshRequest) {
        logoutAndRedirect()
      }
      throw error
    }

    originalRequest._retry = true

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingRequests.push((isSuccess) => {
          if (!isSuccess) {
            reject(error)
            return
          }
          resolve(http(originalRequest))
        })
      })
    }

    isRefreshing = true

    const response = await refreshAndRetryRequest({
      refreshAccessToken,
      resolvePendingRequests,
      rejectPendingRequests,
      logoutAndRedirect,
      http,
      originalRequest
    }).finally(() => {
      isRefreshing = false
    })

    return response
  }
)

export default http
