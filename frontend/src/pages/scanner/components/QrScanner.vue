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
import { onMounted, onUnmounted, ref, watch } from 'vue'

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
let isUnmounted = false

async function startScan() {
  if (isScanning.value) {
    return
  }

  errorText.value = ''

  try {
    reader = new BrowserQRCodeReader()
    isScanning.value = true

    const nextControls = await reader.decodeFromVideoDevice(undefined, videoEl.value, (result, error) => {
      if (result) {
        emit('scanned', result.getText())
      }

      if (error && error.name !== 'NotFoundException') {
        errorText.value = 'Ошибка камеры'
        emit('error', error)
      }
    })

    // F21: компонент могли размонтировать/деактивировать, пока резолвился промис
    // decodeFromVideoDevice. Без этого гарда controls появлялись бы уже после onUnmounted,
    // и поток камеры утекал бы (индикатор камеры горит, ресурс не освобождён).
    if (isUnmounted || !props.active) {
      nextControls.stop()
      isScanning.value = false
      return
    }

    controls = nextControls
  } catch (error) {
    errorText.value = 'Нет доступа к камере'
    emit('error', error)
    isScanning.value = false
  }
}

function stopScan() {
  controls?.stop()
  controls = null
  reader = null

  // Подстраховка: гасим дорожки потока напрямую, если zxing оставил srcObject на video.
  const stream = videoEl.value?.srcObject
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach((track) => track.stop())
    videoEl.value.srcObject = null
  }

  isScanning.value = false
}

// F21: реагируем на смену props.active — раньше активность читалась только при монтировании.
watch(
  () => props.active,
  (active) => {
    if (active) {
      startScan()
    } else {
      stopScan()
    }
  }
)

onMounted(() => {
  if (props.active) {
    startScan()
  }
})

onUnmounted(() => {
  isUnmounted = true
  stopScan()
})
</script>
