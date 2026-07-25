<template>
  <div class="layout">
    <header class="layout__header">
      <h1 class="layout__title">Palisad</h1>
      <div class="layout__userPanel">
        <NurserySwitcher />
        <NotificationBell />
        <SyncStatusBadge />
        <div class="layout__identity">
          <p class="layout__username">{{ authStore.userDisplayName }}</p>
          <p class="layout__roles">{{ roleText }}</p>
        </div>
        <button class="layout__logout" type="button" @click="handleLogout">Выход</button>
      </div>
    </header>

    <div class="layout__body">
      <aside class="layout__sidebar">
        <nav class="layout__nav">
          <section class="layout__menuSection">
            <h2 class="layout__menuTitle">Общий доступ</h2>
            <router-link
              v-for="item in commonNavItems"
              :key="item.to"
              class="layout__link"
              :to="item.to"
            >
              {{ item.label }}
            </router-link>
          </section>

          <section v-if="adminNavItems.length > 0" class="layout__menuSection">
            <h2 class="layout__menuTitle">Администрирование</h2>
            <router-link
              v-for="item in adminNavItems"
              :key="item.to"
              class="layout__link"
              :to="item.to"
            >
              {{ item.label }}
            </router-link>
          </section>

          <section v-if="platformNavItems.length > 0" class="layout__menuSection">
            <h2 class="layout__menuTitle">Платформа</h2>
            <router-link
              v-for="item in platformNavItems"
              :key="item.to"
              class="layout__link"
              :to="item.to"
            >
              {{ item.label }}
            </router-link>
          </section>
        </nav>
      </aside>

      <main class="layout__content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { useSyncManager } from '@/composables/useSyncManager'
import NotificationBell from '@/layouts/components/NotificationBell.vue'
import NurserySwitcher from '@/layouts/components/NurserySwitcher.vue'
import SyncStatusBadge from '@/layouts/components/SyncStatusBadge.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { isMobileDevice } from '@/utils/device'
import { useConfirm } from 'primevue/useconfirm'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'AppLayout' })

const authStore = useAuthStore()
const nurseryStore = useNurseryStore()
const notificationsStore = useNotificationsStore()
const router = useRouter()
const confirm = useConfirm()
const { processQueue } = useSyncManager()
const isMobileClient = ref(false)
const roleText = computed(() => authStore.roleLabels.join(', ') || authStore.roleLabel || '—')

const commonNavItems = computed(() => {
  const items = [
    {
      to: '/plants',
      label: 'Растения',
      visible: authStore.isAuthenticated
    },
    {
      to: '/nursery/create',
      label: 'Создать питомник',
      visible: authStore.isAuthenticated
    },
    {
      to: '/scanner',
      label: 'Сканер',
      visible: authStore.canWrite && isMobileClient.value
    },
    {
      to: '/activity',
      label: 'Лента',
      visible: authStore.isAuthenticated
    },
    {
      to: '/labels',
      label: 'Этикетки',
      visible: authStore.canWrite
    },
    {
      to: '/inventory',
      label: 'Инвентаризация',
      visible: authStore.canWrite
    }
  ]

  return items.filter((item) => item.visible)
})

const adminNavItems = computed(() => {
  const items = [
    {
      to: '/locations',
      label: 'Создание участков и секций',
      visible: authStore.canManageStructure
    },
    {
      to: '/catalog',
      label: 'Справочники и типы',
      visible: authStore.canManageStructure
    },
    {
      to: '/reports',
      label: 'Отчёты',
      visible: authStore.canManageStructure
    },
    {
      to: '/prices',
      label: 'Прайс',
      visible: authStore.canManageStructure
    },
    {
      to: '/nursery/settings',
      label: 'Питомник',
      visible: authStore.isAuthenticated && Boolean(nurseryStore.nursery)
    },
    {
      to: '/staff',
      label: 'Сотрудники',
      visible: authStore.canManageStaff
    },
    {
      to: '/subscription',
      label: 'Подписка',
      visible: authStore.isOwner
    }
  ]

  return items.filter((item) => item.visible)
})

const platformNavItems = computed(() => {
  const items = [
    {
      to: '/admin',
      label: 'Админка платформы',
      visible: authStore.isPlatformAdmin
    }
  ]

  return items.filter((item) => item.visible)
})

async function handleLogout() {
  const result = await authStore.logout()

  // F5: очередь синхронизации не пуста — не стираем её молча, спрашиваем подтверждение.
  if (result?.pending) {
    confirm.require({
      header: 'Есть несохранённые изменения',
      message: 'Часть данных ещё не синхронизирована с сервером и будет потеряна при выходе. Выйти всё равно?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Выйти и удалить',
      rejectLabel: 'Отмена',
      acceptClass: 'p-button-danger',
      accept: async () => {
        await authStore.logout({ force: true })
        await router.push('/login')
      }
    })
    return
  }

  await router.push('/login')
}

onMounted(() => {
  isMobileClient.value = isMobileDevice()
  processQueue()
  notificationsStore.startPolling()
})

onBeforeUnmount(() => {
  notificationsStore.stopPolling()
})
</script>

<style lang="scss" scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
}

.layout__header {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #111827;
  border-bottom: 1px solid #1f2937;
}

.layout__title {
  margin: 0;
  color: #f9fafb;
  font-size: 22px;
}

.layout__userPanel {
  display: flex;
  align-items: center;
  gap: 12px;
}

.layout__identity {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout__username {
  margin: 0;
  color: #f9fafb;
  font-weight: 600;
}

.layout__roles {
  margin: 0;
  color: #cbd5e1;
  font-size: 12px;
}

.layout__logout {
  border: 1px solid #475569;
  background: #1f2937;
  color: #f9fafb;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
}

.layout__body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.layout__sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  padding: 16px 12px;
}

.layout__nav {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.layout__menuSection {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.layout__menuTitle {
  margin: 0 0 4px;
  color: #6b7280;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.layout__link {
  color: #111827;
  text-decoration: none;
  border-radius: 6px;
  padding: 8px 10px;
}

.layout__link.router-link-active {
  background: #e5e7eb;
  font-weight: 600;
}

.layout__content {
  flex: 1;
  padding: 16px;
  min-width: 0;
}
</style>
