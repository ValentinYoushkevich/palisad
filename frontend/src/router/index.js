import HomePage from '@/pages/home/HomePage.vue'
import ChangePasswordPage from '@/pages/login/ChangePasswordPage.vue'
import LoginPage from '@/pages/login/LoginPage.vue'
import CreateNurseryPage from '@/pages/nursery/CreateNurseryPage.vue'
import NurserySettingsPage from '@/pages/nursery/NurserySettingsPage.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/plants',
    name: 'plants',
    component: HomePage,
    meta: {
      public: false
    }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: {
      public: true
    }
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: ChangePasswordPage,
    meta: {
      public: true
    }
  },
  {
    path: '/nursery/create',
    name: 'nursery-create',
    component: CreateNurseryPage,
    meta: {
      public: false
    }
  },
  {
    path: '/nursery/settings',
    name: 'nursery-settings',
    component: NurserySettingsPage,
    meta: {
      public: false
    }
  },
  {
    path: '/',
    redirect: '/plants'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const nurseryStore = useNurseryStore()
  const isPublicRoute = Boolean(to.meta.public)
  const isLoginRoute = to.path === '/login'
  const isChangePasswordRoute = to.path === '/change-password'
  const isNurseryCreateRoute = to.path === '/nursery/create'

  if (!authStore.isAuthenticated) {
    await authStore.initAuth()
  }

  if (!isPublicRoute && !authStore.isAuthenticated) {
    return {
      path: '/login',
      query: {
        redirect: to.fullPath
      }
    }
  }

  if (authStore.isAuthenticated) {
    if (authStore.mustChangePassword && !isChangePasswordRoute) {
      return { path: '/change-password' }
    }

    await nurseryStore.initNurseryContext()

    if (!nurseryStore.nursery && !isNurseryCreateRoute) {
      return { path: '/nursery/create' }
    }

    if (nurseryStore.nursery && isNurseryCreateRoute) {
      return { path: '/plants' }
    }

    if (isLoginRoute) {
      return { path: '/plants' }
    }
  }

  return true
})

export default router
