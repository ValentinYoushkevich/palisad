import HomePage from '@/pages/home/HomePage.vue'
import ChangePasswordPage from '@/pages/login/ChangePasswordPage.vue'
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
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: ChangePasswordPage,
    meta: {
      requireAuth: true
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
  const isLoginRoute = to.path === '/login'
  const isChangePasswordRoute = to.path === '/change-password'

  if (authStore.isAuthorized) {
    if (authStore.mustChangePassword && !isChangePasswordRoute) {
      return { path: '/change-password' }
    }

    if (isLoginRoute) {
      return { path: '/' }
    }

    return true
  }

  if (requiresAuth) {
    return {
      path: '/login',
      query: {
        redirect: to.fullPath
      }
    }
  }

  return true
})

export default router
