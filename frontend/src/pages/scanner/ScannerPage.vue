<template>
  <section class="flex flex-col gap-3">
    <h2>Сканирование QR-кода</h2>

    <div v-if="!manualMode">
      <QrScanner @error="handleCameraError" @scanned="handleScanned" />
      <div class="mt-2 flex justify-center">
        <Button label="Ввести код вручную" text @click="manualMode = true" />
      </div>
    </div>

    <div v-else class="max-w-[520px]">
      <div class="flex flex-col gap-1.5">
        <label for="manualCode">Числовой код растения</label>
        <div class="flex gap-2">
          <InputText
            id="manualCode"
            v-model="manualCode"
            class="flex-1"
            placeholder="Введите код..."
            @keyup.enter="handleManualSearch"
          />
          <Button :loading="isSearching" label="Найти" @click="handleManualSearch" />
        </div>
        <small>Код указан на этикетке под QR-кодом</small>
      </div>
      <Button label="Открыть камеру" text @click="manualMode = false" />
    </div>

    <Message v-if="notFound" severity="warn">
      Растение не найдено. Проверьте код или отсканируйте снова.
    </Message>
  </section>
</template>

<script setup>
import QrScanner from '@/components/QrScanner.vue'
import { usePlantsStore } from '@/stores/plants.store'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'ScannerPage' })

const router = useRouter()
const plantsStore = usePlantsStore()
const manualMode = ref(false)
const manualCode = ref('')
const isSearching = ref(false)
const notFound = ref(false)

async function handleScanned(qrCode) {
  notFound.value = false
  const plant = await plantsStore.findByQr(qrCode)

  if (plant?.id) {
    router.push(`/plants/${plant.id}`)
    return
  }

  notFound.value = true
}

function handleCameraError() {
  manualMode.value = true
}

async function handleManualSearch() {
  if (!manualCode.value.trim()) {
    return
  }

  isSearching.value = true
  notFound.value = false

  const plant = await plantsStore.findByNumericCode(manualCode.value.trim())
  if (plant?.id) {
    router.push(`/plants/${plant.id}`)
  } else {
    notFound.value = true
  }

  isSearching.value = false
}
</script>
