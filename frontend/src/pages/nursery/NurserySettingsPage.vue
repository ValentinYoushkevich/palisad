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

      <p v-if="authStore.isOwner" class="mt-2 text-sm text-slate-600">
        Смена тарифа, активация кода и заявки — на странице подписки.
      </p>
      <Button
        v-if="authStore.isOwner"
        class="mt-1"
        label="Управление подпиской"
        outlined
        @click="router.push('/subscription')"
      />
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

onMounted(async () => {
  await nurseryStore.fetchNursery()

  if (!nurseryStore.nursery) {
    await router.push('/nursery/create')
    return
  }

  await nurseryStore.fetchSubscription()
})
</script>
