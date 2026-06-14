<template>
  <Dialog v-model:visible="localVisible" :header="title" class="catalog-dictionary-dialog" modal style="width: 520px">
    <div class="space-y-3">
      <Message v-if="errorMessage" severity="error">{{ errorMessage }}</Message>
      <div class="space-y-1">
        <label for="stageName">Название</label>
        <InputText id="stageName" v-model="localForm.name" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="stageSlug">Slug</label>
        <InputText id="stageSlug" v-model="localForm.slug" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="stageSort">Порядок</label>
        <InputNumber id="stageSort" v-model="localForm.sort_order" class="w-full" :min="0" showButtons />
      </div>
      <div class="flex items-center gap-2 text-sm text-slate-700">
        <Checkbox v-model="localForm.is_active" inputId="stageActive" binary />
        <label for="stageActive">Активна</label>
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

defineOptions({ name: 'ProductionStageDialog' })

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Добавить стадию'
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

const localForm = ref({
  name: '',
  slug: '',
  sort_order: 0,
  is_active: true
})

const localVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) {
      return
    }
    localForm.value = {
      name: props.initialForm?.name || '',
      slug: props.initialForm?.slug || '',
      sort_order: props.initialForm?.sort_order ?? 0,
      is_active: Boolean(props.initialForm?.is_active)
    }
  },
  { immediate: true }
)

function handleSubmit() {
  emit('submit', {
    name: localForm.value.name || '',
    slug: localForm.value.slug || '',
    sort_order: Number(localForm.value.sort_order) || 0,
    is_active: Boolean(localForm.value.is_active)
  })
}
</script>

<style scoped lang="scss">
.catalog-dictionary-dialog :deep(.p-inputtext),
.catalog-dictionary-dialog :deep(.p-select),
.catalog-dictionary-dialog :deep(.p-inputnumber-input) {
  min-height: 3rem;
}
</style>
