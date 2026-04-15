<template>
  <Dialog v-model:visible="localVisible" :header="title" class="catalog-dictionary-dialog" modal style="width: 520px">
    <div class="space-y-3">
      <Message v-if="errorMessage" severity="error">{{ errorMessage }}</Message>
      <div class="space-y-1">
        <label for="movementName">Название</label>
        <InputText id="movementName" v-model="localForm.name" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="movementSlug">Slug</label>
        <InputText id="movementSlug" v-model="localForm.slug" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="movementStatus">Меняет статус</label>
        <Select id="movementStatus" v-model="movementStatusValue" :options="statusOptions" optionLabel="label" optionValue="value" class="w-full" />
      </div>
      <div class="flex items-center gap-2 text-sm text-slate-700">
        <Checkbox v-model="localForm.is_active" inputId="movementActive" binary />
        <label for="movementActive">Активен</label>
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

defineOptions({ name: 'MovementTypeDialog' })

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Добавить тип движения'
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
  },
  statusOptions: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'submit'])

const localForm = ref({
  name: '',
  slug: '',
  sets_status: null,
  is_active: true
})

const localVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const movementStatusValue = computed({
  get: () => localForm.value.sets_status ?? '__none__',
  set: (value) => {
    localForm.value.sets_status = value === '__none__' ? null : value
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
      slug: props.initialForm?.slug || '',
      sets_status: props.initialForm?.sets_status ?? null,
      is_active: Boolean(props.initialForm?.is_active)
    }
  },
  { immediate: true }
)

function handleSubmit() {
  emit('submit', {
    name: localForm.value.name || '',
    slug: localForm.value.slug || '',
    sets_status: localForm.value.sets_status || null,
    is_active: Boolean(localForm.value.is_active)
  })
}
</script>
