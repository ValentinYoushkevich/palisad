<template>
  <div class="flex min-h-[calc(100vh-96px)] items-center justify-center p-4">
    <div class="flex w-full max-w-[480px] flex-col gap-3 rounded-xl bg-white p-4">
      <h2>Создание питомника</h2>

      <div class="flex flex-col gap-1.5">
        <label for="name">Название *</label>
        <InputText id="name" v-model="name" class="w-full" placeholder="Мой питомник" />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="address">Адрес</label>
        <Textarea id="address" v-model="address" class="w-full" rows="2" />
      </div>

      <Button
        :loading="nurseryStore.isLoading"
        class="w-full"
        label="Создать питомник"
        @click="handleCreate"
      />
      <Message v-if="errorText" severity="error">{{ errorText }}</Message>
    </div>
  </div>
</template>

<script setup>
import { useNurseryStore } from '@/stores/nursery.store'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'CreateNurseryPage' })

const router = useRouter()
const nurseryStore = useNurseryStore()
const name = ref('')
const address = ref('')
const errorText = ref('')

async function handleCreate() {
  const nextName = name.value.trim()

  if (!nextName) {
    errorText.value = 'Введите название.'
    return
  }

  errorText.value = ''

  const result = await nurseryStore.createNursery({
    name: nextName,
    address: address.value
  })

  if (!result?.ok) {
    errorText.value = result?.error || nurseryStore.nurseryError || 'Ошибка создания питомника.'
    return
  }

  await nurseryStore.fetchSubscription()
  await router.push('/plants')
}
</script>
