import ActivityPage from '@/pages/activity/ActivityPage.vue'
import CatalogPage from '@/pages/catalog/CatalogPage.vue'
import LabelsPage from '@/pages/labels/LabelsPage.vue'
import LocationsPage from '@/pages/locations/LocationsPage.vue'
import ChangePasswordPage from '@/pages/login/ChangePasswordPage.vue'
import LoginPage from '@/pages/login/LoginPage.vue'
import CreateNurseryPage from '@/pages/nursery/CreateNurseryPage.vue'
import NurserySettingsPage from '@/pages/nursery/NurserySettingsPage.vue'
import PlantDetailPage from '@/pages/plants/PlantDetailPage.vue'
import PlantsPage from '@/pages/plants/PlantsPage.vue'
import ScannerPage from '@/pages/scanner/ScannerPage.vue'
import StaffPage from '@/pages/staff/StaffPage.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { isMobileDevice } from '@/utils/device'
import { createRouter, createWebHistory } from 'vue-router'

const ROLE_OWNER = 'owner'
const ROLE_AGRONOMIST = 'agronomist'

const routes = [
  {
    path: '/plants',
    name: 'plants',
    component: PlantsPage,
    meta: {
      public: false
    }
  },
  {
    path: '/plants/:id',
    name: 'plant-detail',
    component: PlantDetailPage,
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
    path: '/locations',
    name: 'locations',
    component: LocationsPage,
    meta: {
      public: false
    }
  },
  {
    path: '/catalog',
    name: 'catalog',
    component: CatalogPage,
    meta: {
      public: false
    }
  },
  {
    path: '/activity',
    name: 'activity',
    component: ActivityPage,
    meta: {
      public: false
    }
  },
  {
    path: '/scanner',
    name: 'scanner',
    component: ScannerPage,
    meta: {
      public: false
    }
  },
  {
    path: '/labels',
    name: 'labels',
    component: LabelsPage,
    meta: {
      public: false
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
    path: '/staff',
    name: 'staff',
    component: StaffPage,
    meta: {
      public: false,
      roles: [ROLE_OWNER]
    }
  },
  {
    path: '/subscription',
    name: 'subscription',
    component: () => import('@/pages/subscription/SubscriptionPage.vue'),
    meta: {
      public: false,
      roles: [ROLE_OWNER]
    }
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@/pages/reports/ReportsPage.vue'),
    meta: {
      public: false,
      roles: [ROLE_OWNER, ROLE_AGRONOMIST]
    }
  },
  {
    path: '/prices',
    name: 'prices',
    component: () => import('@/pages/prices/PricesPage.vue'),
    meta: {
      public: false,
      roles: [ROLE_OWNER, ROLE_AGRONOMIST]
    }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/pages/admin/AdminPage.vue'),
    meta: {
      public: false,
      platformAdmin: true
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
  const routeFlags = {
    isPublicRoute: Boolean(to.meta.public),
    isLoginRoute: to.path === '/login',
    isChangePasswordRoute: to.path === '/change-password',
    isNurseryCreateRoute: to.path === '/nursery/create',
    isAdminRoute: to.path === '/admin'
  }

  if (!authStore.isAuthenticated && !authStore.isAuthInitialized) {
    await authStore.initAuth()
  }

  if (!routeFlags.isPublicRoute && !authStore.isAuthenticated) {
    return {
      path: '/login',
      query: {
        redirect: to.fullPath
      }
    }
  }

  if (authStore.isAuthenticated) {
    if (to.path === '/scanner' && !isMobileDevice()) {
      return { path: '/plants' }
    }

    if (authStore.mustChangePassword && !routeFlags.isChangePasswordRoute) {
      return { path: '/change-password' }
    }

    // Платформенный гард проверяем ДО редиректа «нет питомника»: платформенный админ может
    // не иметь питомника, поэтому /admin исключён из nursery-требования ниже. Сервер всё
    // равно гардит каждый запрос через requirePlatformAdmin — здесь только UX-скрытие.
    if (to.meta.platformAdmin && !authStore.isPlatformAdmin) {
      return { path: '/plants' }
    }

    const protectedRedirect = await resolveProtectedRouteRedirect(routeFlags, nurseryStore)
    if (protectedRedirect) {
      return protectedRedirect
    }

    if (routeFlags.isLoginRoute) {
      return { path: '/plants' }
    }

    if (!hasRoleAccess(to.meta.roles, authStore.role)) {
      return { path: '/plants' }
    }
  }

  return true
})

export default router

function hasRoleAccess(requiredRoles, userRole) {
  if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
    return true
  }

  return requiredRoles.includes(userRole)
}

async function resolveProtectedRouteRedirect(routeFlags, nurseryStore) {
  await nurseryStore.initNurseryContext()

  // /admin исключён из требования наличия питомника наравне с /nursery/create:
  // платформенный админ может не иметь своего питомника, но должен попадать в мини-админку.
  if (!nurseryStore.nursery && !routeFlags.isNurseryCreateRoute && !routeFlags.isAdminRoute) {
    return { path: '/nursery/create' }
  }

  if (nurseryStore.nursery && routeFlags.isNurseryCreateRoute) {
    return { path: '/plants' }
  }

  return null
}
