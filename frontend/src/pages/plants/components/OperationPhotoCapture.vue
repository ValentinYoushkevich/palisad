<template>
  <span class="inline-flex items-center">
    <!-- На мобильных сразу открывается камера, на десктопе — обычный выбор файла. -->
    <input
      ref="inputRef"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      aria-label="Прикрепить фото к операции"
      @change="onChange"
    >

    <Button
      v-if="!previewUrl"
      class="ui-action-icon"
      icon="pi pi-camera"
      severity="secondary"
      size="small"
      outlined
      :disabled="busy"
      @click="openPicker"
    />

    <span v-else class="inline-flex items-center gap-1">
      <img :src="previewUrl" alt="Предпросмотр фото" class="h-8 w-8 rounded object-cover">
      <Button icon="pi pi-check" severity="success" size="small" :loading="busy" @click="confirm" />
      <Button icon="pi pi-times" severity="secondary" size="small" outlined :disabled="busy" @click="cancel" />
    </span>
  </span>
</template>

<script setup>
import { onUnmounted, ref } from 'vue'

defineOptions({ name: 'OperationPhotoCapture' })

// busy управляется родителем на время attach — блокируем повторный выбор и показываем спиннер.
defineProps({
  busy: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['attach'])

const inputRef = ref(null)
const previewUrl = ref('')
const selectedFile = ref(null)

function openPicker() {
  inputRef.value?.click()
}

function onChange(event) {
  const file = event.target?.files?.[0]
  if (!file) {
    return
  }

  revoke()
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function confirm() {
  if (!selectedFile.value) {
    return
  }

  emit('attach', selectedFile.value)
  reset()
}

function cancel() {
  reset()
}

function reset() {
  revoke()
  selectedFile.value = null
  if (inputRef.value) {
    inputRef.value.value = ''
  }
}

function revoke() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

onUnmounted(revoke)
</script>
