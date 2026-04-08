import HomePage from '@/pages/home/HomePage.vue'
import LoginPage from '@/pages/login/LoginPage.vue'
import { useAuthStore } from '@/stores/auth.store'
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
    meta: {
      requireAuth: true
    }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: {
      requireAuth: false
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  const requiresAuth = Boolean(to.meta.requireAuth)

  if (!requiresAuth) {
    return true
  }

  if (authStore.isAuthorized) {
    return true
  }

  return {
    path: '/login',
    query: {
      redirect: to.fullPath
    }
  }
})

export default router
