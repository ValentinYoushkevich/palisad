<template>
  <div class="qrScanner">
    <video ref="videoEl" class="qrScanner__video">
      <track kind="captions" label="captions" src="" srclang="ru">
    </video>
    <div v-if="errorText" class="qrScanner__error">{{ errorText }}</div>
    <div v-if="isScanning" class="qrScanner__hint">Наведите камеру на QR-код</div>
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

<style lang="scss" scoped>
.qrScanner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qrScanner__video {
  width: 100%;
  max-height: 300px;
  object-fit: cover;
  border-radius: 8px;
}

.qrScanner__error {
  color: #dc2626;
  text-align: center;
  font-size: 14px;
}

.qrScanner__hint {
  color: #6b7280;
  text-align: center;
  font-size: 14px;
}
</style>
