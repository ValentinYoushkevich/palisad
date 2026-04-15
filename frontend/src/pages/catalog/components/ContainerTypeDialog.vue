<template>
  <Dialog v-model:visible="localVisible" :header="title" class="catalog-dictionary-dialog" modal style="width: 560px">
    <div class="grid gap-3 md:grid-cols-2">
      <div class="md:col-span-2">
        <Message v-if="errorMessage" severity="error">{{ errorMessage }}</Message>
      </div>
      <div class="space-y-1">
        <label for="containerName">Название</label>
        <InputText id="containerName" v-model="localForm.name" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="containerCode">Код</label>
        <InputText id="containerCode" v-model="localForm.code" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="containerKind">Вид контейнера</label>
        <Select id="containerKind" v-model="localForm.container_kind" :options="kindOptions" optionLabel="label" optionValue="value" class="w-full" />
      </div>
      <div class="space-y-1">
        <label for="containerVolume">Объём (л)</label>
        <InputNumber id="containerVolume" v-model="localForm.volume_liters" class="w-full" :min="0" :useGrouping="false" />
      </div>
      <div class="space-y-1">
        <label for="containerSide">Сторона (см)</label>
        <InputNumber id="containerSide" v-model="localForm.side_cm" class="w-full" :min="0" :useGrouping="false" />
      </div>
      <div class="mt-7 flex items-center gap-2 text-sm text-slate-700">
        <Checkbox v-model="localForm.is_active" inputId="containerActive" binary />
        <label for="containerActive">Активен</label>
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

defineOptions({ name: 'ContainerTypeDialog' })

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Добавить тип контейнера'
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
  kindOptions: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'submit'])

const localForm = ref({
  code: '',
  name: '',
  container_kind: 'pot',
  volume_liters: null,
  side_cm: null,
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
      code: props.initialForm?.code || '',
      name: props.initialForm?.name || '',
      container_kind: props.initialForm?.container_kind || 'pot',
      volume_liters: props.initialForm?.volume_liters ?? null,
      side_cm: props.initialForm?.side_cm ?? null,
      is_active: Boolean(props.initialForm?.is_active)
    }
  },
  { immediate: true }
)

function handleSubmit() {
  emit('submit', {
    code: localForm.value.code || '',
    name: localForm.value.name || '',
    container_kind: localForm.value.container_kind || 'pot',
    volume_liters: localForm.value.volume_liters,
    side_cm: localForm.value.side_cm,
    is_active: Boolean(localForm.value.is_active)
  })
}
</script>

<style scoped lang="scss">
.catalog-dictionary-dialog :deep(.p-inputtext),
.catalog-dictionary-dialog :deep(.p-inputnumber-input),
.catalog-dictionary-dialog :deep(.p-select) {
  min-height: 3rem;
}
</style>
