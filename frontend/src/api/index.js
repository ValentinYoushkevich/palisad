import http from '@/services/http'

const api = {
  get: (url, config) => http.get(url, config),
  post: (url, data, config) => http.post(url, data, config),
  patch: (url, data, config) => http.patch(url, data, config),
  put: (url, data, config) => http.put(url, data, config),
  delete: (url, config) => http.delete(url, config)
}

export default api
