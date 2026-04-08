import api from '@/api'

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  changePassword: (data) => api.post('/auth/change-password', data),
  register: (data) => api.post('/auth/register', data)
}
