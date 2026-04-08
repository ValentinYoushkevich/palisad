<template>
  <div class="layout">
    <header class="layout__header">
      <h1 class="layout__title">Palisad</h1>
      <div class="layout__links">
        <router-link class="layout__link" to="/plants">Растения</router-link>
        <router-link v-if="!nurseryStore.nursery" class="layout__link" to="/nursery/create">Создать питомник</router-link>
        <router-link v-if="nurseryStore.nursery" class="layout__link" to="/nursery/settings">Питомник</router-link>
        <router-link v-if="authStore.canManageStructure" class="layout__link" to="/locations">Локации</router-link>
        <router-link v-if="authStore.canManageStaff" class="layout__link" to="/staff">Сотрудники</router-link>
      </div>
    </header>
    <main class="layout__content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth.store'
import { useNurseryStore } from '@/stores/nursery.store'

defineOptions({ name: 'AppLayout' })

const authStore = useAuthStore()
const nurseryStore = useNurseryStore()
</script>

<style lang="scss" scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout__header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #111827;
}

.layout__title {
  margin: 0;
  color: #f9fafb;
  font-size: 20px;
}

.layout__link {
  color: #f9fafb;
  text-decoration: none;
}

.layout__links {
  display: flex;
  align-items: center;
  gap: 16px;
}

.layout__content {
  flex: 1;
  padding: 16px;
}
</style>
