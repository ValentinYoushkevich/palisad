<template>
  <Dialog
    :visible="visible"
    header="Новое движение"
    modal
    style="width: 460px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="movementType">Тип движения *</label>
      <Select
        id="movementType"
        v-model="form.typeId"
        :options="movementTypesStore.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      >
        <template #option="{ option }">
          <div class="flex items-center gap-1.5">
            <Tag v-if="option.is_system" value="Системный" severity="secondary" />
            <span>{{ option.name }}</span>
            <Tag
              v-if="option.sets_status"
              :value="statusLabel(option.sets_status)"
              :severity="statusSeverity(option.sets_status)"
            />
          </div>
        </template>
      </Select>
    </div>

    <div v-if="isTransfer" class="mb-3 flex flex-col gap-1.5">
      <label for="fromLocation">Откуда</label>
      <Select
        id="fromLocation"
        v-model="form.fromLocationId"
        :options="locationsStore.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        showClear
      />
    </div>

    <div v-if="isTransfer" class="mb-3 flex flex-col gap-1.5">
      <label for="toLocation">Куда *</label>
      <Select
        id="toLocation"
        v-model="form.toLocationId"
        :options="locationsStore.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      />
    </div>

    <div class="mb-3 flex flex-col gap-1.5">
      <label for="movementQuantity">Количество</label>
      <InputNumber id="movementQuantity" v-model="form.quantity" :min="1" class="w-full" />
    </div>

    <div class="mb-3 flex flex-col gap-1.5">
      <label for="movementNotes">Заметки</label>
      <Textarea id="movementNotes" v-model="form.notes" class="w-full" rows="2" />
    </div>

    <Message v-if="setsStatus" severity="warn">
      После этого движения статус растения изменится на: <strong>{{ statusLabel(setsStatus) }}</strong>
    </Message>
    <Message v-if="movementsStore.movementsError" severity="error">
      {{ movementsStore.movementsError }}
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="movementsStore.isLoading" label="Записать" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script setup>
import { useLocationsStore } from '@/stores/locations.store'
import { useMovementsStore } from '@/stores/movements.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { computed, ref } from 'vue'

defineOptions({ name: 'MovementCreateDialog' })

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
const movementsStore = useMovementsStore()
const movementTypesStore = useMovementTypesStore()
const locationsStore = useLocationsStore()

const STATUS_LABELS = {
  growing: 'В росте',
  storage: 'На хранении',
  sold: 'Продано',
  written_off: 'Списано'
}

const STATUS_SEVERITY = {
  growing: 'success',
  storage: 'info',
  sold: 'secondary',
  written_off: 'danger'
}

const form = ref({
  typeId: null,
  fromLocationId: null,
  toLocationId: null,
  quantity: 1,
  notes: ''
})

const selectedType = computed(() => movementTypesStore.activeTypes.find((item) => item.id === form.value.typeId))
const isTransfer = computed(() => {
  const slug = selectedType.value?.slug
  return slug === 'transfer' || slug === 'arrival'
})
const setsStatus = computed(() => selectedType.value?.sets_status ?? null)

function emitVisible(value) {
  emit('update:visible', value)
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function statusSeverity(status) {
  return STATUS_SEVERITY[status] || 'secondary'
}

async function handleCreate() {
  const result = await movementsStore.createMovement(props.plantId, form.value)

  if (!result?.ok) {
    return
  }

  form.value = {
    typeId: null,
    fromLocationId: null,
    toLocationId: null,
    quantity: 1,
    notes: ''
  }

  emit('created')
  emitVisible(false)
}
</script>
