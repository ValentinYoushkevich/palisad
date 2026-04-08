<template>
  <div class="createNursery">
    <div class="createNursery__card">
      <h2>Создание питомника</h2>

      <div class="createNursery__field">
        <label for="name">Название *</label>
        <InputText id="name" v-model="name" class="w-full" placeholder="Мой питомник" />
      </div>

      <div class="createNursery__field">
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
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
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

<style lang="scss" scoped>
.createNursery {
  min-height: calc(100vh - 96px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.createNursery__card {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #ffffff;
  border-radius: 12px;
  padding: 16px;
}

.createNursery__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
