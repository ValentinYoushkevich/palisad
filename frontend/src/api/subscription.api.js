import api from '@/api'

export const subscriptionApi = {
  getCurrent: () => api.get('/subscriptions/current'),
  getPlans: () => api.get('/plans'),
  change: (planId) => api.post('/subscriptions/change', { planId })
}
