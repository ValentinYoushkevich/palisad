<template>
  <div class="flex flex-col gap-4 p-4">
    <h2>Настройки питомника</h2>

    <div v-if="nurseryStore.nursery" class="rounded-xl bg-white p-4">
      <p><strong>Название:</strong> {{ nurseryStore.nursery.name }}</p>
      <p><strong>Адрес:</strong> {{ nurseryStore.nursery.address || '—' }}</p>
      <Button class="mt-2" label="Редактировать" outlined @click="editVisible = true" />
    </div>

    <div class="rounded-xl bg-white p-4">
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

      <div v-if="planVisible" class="mt-3 flex flex-col items-start">
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
