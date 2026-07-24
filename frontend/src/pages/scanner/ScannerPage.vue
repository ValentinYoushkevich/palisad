<template>
  <section class="page-shell scannerPage">
    <div class="page-panel scannerPage__panel">
    <h2>Сканирование QR-кода</h2>

    <div v-if="canUseCamera && !manualMode">
      <QrScanner @error="handleCameraError" @scanned="handleScanned" />
      <div class="mt-2 flex justify-center">
        <Button label="Ввести код вручную" text @click="manualMode = true" />
      </div>
    </div>

    <div v-else class="max-w-[560px]">
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
      <Button v-if="canUseCamera" label="Открыть камеру" text @click="openCamera" />
      <Message v-else severity="info">
        Сканирование камерой доступно только с мобильного устройства.
      </Message>
    </div>

    <Message v-if="notFound" severity="warn">
      Растение не найдено. Проверьте код или отсканируйте снова.
    </Message>
    </div>
  </section>
</template>

<script setup>
import QrScanner from '@/pages/scanner/components/QrScanner.vue'
import { usePlantsStore } from '@/stores/plants.store'
import { isMobileDevice } from '@/utils/device'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'ScannerPage' })

const router = useRouter()
const plantsStore = usePlantsStore()
const canUseCamera = isMobileDevice()
const manualMode = ref(!canUseCamera)
const manualCode = ref('')
const isSearching = ref(false)
const notFound = ref(false)

async function handleScanned(qrCode) {
  notFound.value = false

  // F12: защищаемся от исключения (даже если стор перестанет глотать ошибку) — иначе
  // необработанный reject из обработчика события камеры.
  try {
    const plant = await plantsStore.findByQr(qrCode)

    if (plant?.id) {
      router.push(`/plants/${plant.id}`)
      return
    }

    notFound.value = true
  } catch {
    notFound.value = true
  }
}

function handleCameraError() {
  manualMode.value = true
}

function openCamera() {
  if (!canUseCamera) {
    return
  }

  manualMode.value = false
}

async function handleManualSearch() {
  if (!manualCode.value.trim()) {
    return
  }

  isSearching.value = true
  notFound.value = false

  // F12: гарантируем сброс isSearching в finally — иначе при исключении кнопка «Найти»
  // навсегда остаётся в состоянии loading.
  try {
    const plant = await plantsStore.findByNumericCode(manualCode.value.trim())
    if (plant?.id) {
      router.push(`/plants/${plant.id}`)
    } else {
      notFound.value = true
    }
  } catch {
    notFound.value = true
  } finally {
    isSearching.value = false
  }
}
</script>

<style lang="scss" scoped>
.scannerPage {
  display: flex;
  flex-direction: column;
}

.scannerPage__panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 280px;
}
</style>
