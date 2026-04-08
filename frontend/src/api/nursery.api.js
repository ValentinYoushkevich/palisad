import api from '@/api'

export const nurseryApi = {
  create: (data) => api.post('/nurseries', data),
  getMy: () => api.get('/nurseries/my'),
  update: (data) => api.patch('/nurseries/my', data)
}
