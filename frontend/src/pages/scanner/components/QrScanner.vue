<template>
  <div class="flex flex-col gap-2">
    <video ref="videoEl" class="max-h-[300px] w-full rounded-lg object-cover">
      <track kind="captions" label="captions" src="" srclang="ru">
    </video>
    <div v-if="errorText" class="text-center text-sm text-red-600">{{ errorText }}</div>
    <div v-if="isScanning" class="text-center text-sm text-gray-500">Наведите камеру на QR-код</div>
  </div>
</template>

<script setup>
import { BrowserQRCodeReader } from '@zxing/browser'
import { onMounted, onUnmounted, ref } from 'vue'

defineOptions({ name: 'QrScanner' })

const props = defineProps({
  active: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['scanned', 'error'])
const videoEl = ref(null)
const isScanning = ref(false)
const errorText = ref('')

let reader = null
let controls = null

onMounted(async () => {
  if (!props.active) {
    return
  }

  try {
    reader = new BrowserQRCodeReader()
    isScanning.value = true

    controls = await reader.decodeFromVideoDevice(undefined, videoEl.value, (result, error) => {
      if (result) {
        emit('scanned', result.getText())
      }

      if (error && error.name !== 'NotFoundException') {
        errorText.value = 'Ошибка камеры'
        emit('error', error)
      }
    })
  } catch (error) {
    errorText.value = 'Нет доступа к камере'
    emit('error', error)
    isScanning.value = false
  }
})

onUnmounted(() => {
  controls?.stop()
  isScanning.value = false
})
</script>
