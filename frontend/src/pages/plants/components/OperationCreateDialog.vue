<template>
  <Dialog
    :visible="visible"
    header="Новая операция"
    modal
    style="width: 460px"
    @update:visible="emitVisible"
  >
    <div class="field">
      <label for="operationType">Тип операции *</label>
      <Dropdown
        id="operationType"
        v-model="form.type"
        :options="TYPE_OPTIONS"
        optionLabel="label"
        optionValue="value"
        class="w-full"
      />
    </div>

    <div v-if="isTransplant" class="field">
      <label for="newContainerId">Новый контейнер *</label>
      <Dropdown
        id="newContainerId"
        v-model="form.newContainerId"
        :options="containerTypesStore.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      />
    </div>

    <div class="field">
      <label for="operationNotes">Заметки</label>
      <Textarea id="operationNotes" v-model="form.notes" class="w-full" rows="3" />
    </div>

    <Message v-if="operationsStore.operationsError" severity="error">
      {{ operationsStore.operationsError }}
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="operationsStore.isLoading" label="Сохранить" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script setup>
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useOperationsStore } from '@/stores/operations.store'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import { computed, ref } from 'vue'

defineOptions({ name: 'OperationCreateDialog' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  plantId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:visible', 'created'])
const operationsStore = useOperationsStore()
const containerTypesStore = useContainerTypesStore()

const TYPE_OPTIONS = [
  { label: 'Прививка', value: 'grafting' },
  { label: 'Обрезка', value: 'pruning' },
  { label: 'Обработка СЗР', value: 'treatment' },
  { label: 'Пересадка', value: 'transplant' },
  { label: 'Осмотр', value: 'inspection' },
  { label: 'Другое', value: 'other' }
]

const form = ref({
  type: 'inspection',
  notes: '',
  newContainerId: null
})

const isTransplant = computed(() => form.value.type === 'transplant')

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleCreate() {
  const result = await operationsStore.createOperation(props.plantId, form.value)

  if (!result?.ok) {
    return
  }

  form.value = {
    type: 'inspection',
    notes: '',
    newContainerId: null
  }
  emit('created')
  emitVisible(false)
}
</script>

<style lang="scss" scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
</style>
