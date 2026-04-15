<template>
  <Dialog v-model:visible="localVisible" :header="title" class="catalog-dictionary-dialog" modal style="width: 460px">
    <div class="space-y-3">
      <Message v-if="errorMessage" severity="error">{{ errorMessage }}</Message>
      <div class="space-y-1">
        <label for="tagName">Название</label>
        <InputText id="tagName" v-model="localForm.name" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="tagColor">Цвет (HEX)</label>
        <div class="flex items-center gap-3">
          <ColorPicker id="tagColor" v-model="tagColorValue" format="hex" />
          <InputText :modelValue="normalizedColor" class="w-full" readonly />
        </div>
      </div>
      <div class="flex items-center gap-2 text-sm text-slate-700">
        <Checkbox v-model="localForm.is_active" inputId="tagActive" binary />
        <label for="tagActive">Активен</label>
      </div>
    </div>
    <template #footer>
      <Button label="Отмена" text @click="localVisible = false" />
      <Button :label="saveLabel" :loading="loading" @click="handleSubmit" />
    </template>
  </Dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

defineOptions({ name: 'TagFormDialog' })

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Добавить тег'
  },
  saveLabel: {
    type: String,
    default: 'Сохранить'
  },
  loading: {
    type: Boolean,
    default: false
  },
  errorMessage: {
    type: String,
    default: ''
  },
  initialForm: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'submit'])

const localForm = ref({ name: '', color: '#3B82F6', is_active: true })

const localVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const normalizedColor = computed(() => normalizeHexColor(localForm.value.color))
const tagColorValue = computed({
  get: () => normalizedColor.value.replace('#', ''),
  set: (value) => {
    localForm.value.color = normalizeHexColor(`#${String(value || '').replace('#', '')}`)
  }
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) {
      return
    }
    localForm.value = {
      name: props.initialForm?.name || '',
      color: normalizeHexColor(props.initialForm?.color),
      is_active: Boolean(props.initialForm?.is_active)
    }
  },
  { immediate: true }
)

function normalizeHexColor(value) {
  const normalized = String(value || '').trim().replace('#', '')
  if (!normalized) {
    return '#3B82F6'
  }
  return `#${normalized.toUpperCase().slice(0, 6)}`
}

function handleSubmit() {
  emit('submit', {
    name: localForm.value.name || '',
    color: normalizeHexColor(localForm.value.color),
    is_active: Boolean(localForm.value.is_active)
  })
}
</script>
