import { useAuthStore } from '@/stores/auth.store'
import axios from 'axios'

const http = axios.create({
  baseURL: '/api'
})

let isRefreshing = false
let pendingRequests = []

function resolvePendingRequests(newAccessToken) {
  pendingRequests.forEach((callback) => callback(newAccessToken))
  pendingRequests = []
}

function rejectPendingRequests() {
  pendingRequests.forEach((callback) => callback(''))
  pendingRequests = []
}

async function refreshAccessToken() {
  const authStore = useAuthStore()

  if (!authStore.refreshToken) {
    throw new Error('No refresh token')
  }

  const response = await axios.post('/api/auth/refresh', {
    refreshToken: authStore.refreshToken
  })

  const nextAccessToken = response?.data?.accessToken || ''
  const nextRefreshToken = response?.data?.refreshToken || authStore.refreshToken

  if (!nextAccessToken) {
    throw new Error('Invalid refresh response')
  }

  authStore.setTokens(nextAccessToken, nextRefreshToken)
  return nextAccessToken
}

function logoutAndRedirect() {
  const authStore = useAuthStore()
  authStore.clearSession()
  window.location.href = '/login'
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
      return Promise.reject(error)
    }

    const isRefreshRequest = originalRequest?.url?.includes('/auth/refresh')

    if (status === 403) {
      logoutAndRedirect()
      return Promise.reject(error)
    }

    if (status !== 401 || originalRequest._retry || isRefreshRequest) {
      if (status === 401 && isRefreshRequest) {
        logoutAndRedirect()
      }
      return Promise.reject(error)
    }

    originalRequest._retry = true

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingRequests.push((token) => {
          if (!token) {
            reject(error)
            return
          }
          originalRequest.headers.Authorization = `Bearer ${token}`
          resolve(http(originalRequest))
        })
      })
    }

    isRefreshing = true

    try {
      const newAccessToken = await refreshAccessToken()
      resolvePendingRequests(newAccessToken)
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      return http(originalRequest)
    } catch (refreshError) {
      rejectPendingRequests()
      logoutAndRedirect()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default http
