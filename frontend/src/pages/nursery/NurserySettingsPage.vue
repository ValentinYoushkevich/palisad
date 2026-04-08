<template>
  <div class="nurserySettings">
    <h2>Настройки питомника</h2>

    <div v-if="nurseryStore.nursery" class="nurserySettings__card">
      <p><strong>Название:</strong> {{ nurseryStore.nursery.name }}</p>
      <p><strong>Адрес:</strong> {{ nurseryStore.nursery.address || '—' }}</p>
      <Button class="mt-2" label="Редактировать" outlined @click="editVisible = true" />
    </div>

    <div class="nurserySettings__card">
      <h3>Тариф</h3>
      <p>
        Текущий план:
        <strong>{{ nurseryStore.subscription?.name || '—' }}</strong>
      </p>
      <p>Растений: до {{ nurseryStore.plantLimit ?? '∞' }}</p>
      <p>Пользователей: до {{ nurseryStore.userLimit ?? '∞' }}</p>

      <Button
        v-if="authStore.isOwner"
        class="mt-2"
        label="Сменить план"
        outlined
        @click="planVisible = !planVisible"
      />

      <div v-if="planVisible" class="nurserySettings__plans">
        <Button
          v-for="plan in nurseryStore.plans"
          :key="plan.id"
          :disabled="nurseryStore.subscription?.id === plan.id"
          :label="`Перейти на ${plan.name}`"
          severity="secondary"
          text
          @click="handleChangePlan(plan.id)"
        />
      </div>
    </div>

    <NurseryEditDialog v-model:visible="editVisible" />
  </div>
</template>

<script setup>
import NurseryEditDialog from '@/pages/nursery/components/NurseryEditDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useNurseryStore } from '@/stores/nursery.store'
import Button from 'primevue/button'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'NurserySettingsPage' })

const router = useRouter()
const nurseryStore = useNurseryStore()
const authStore = useAuthStore()
const editVisible = ref(false)
const planVisible = ref(false)

onMounted(async () => {
  await nurseryStore.fetchNursery()

  if (!nurseryStore.nursery) {
    await router.push('/nursery/create')
    return
  }

  await Promise.all([
    nurseryStore.fetchSubscription(),
    nurseryStore.fetchPlans()
  ])
})

async function handleChangePlan(planId) {
  await nurseryStore.changePlan(planId)
  planVisible.value = false
}
</script>

<style lang="scss" scoped>
.nurserySettings {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nurserySettings__card {
  background: #ffffff;
  border-radius: 12px;
  padding: 16px;
}

.nurserySettings__plans {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
</style>
