<template>
  <Dialog
    :visible="visible"
    header="Новое движение"
    modal
    style="width: 460px"
    @update:visible="emitVisible"
  >
    <div class="field">
      <label for="movementType">Тип движения *</label>
      <Dropdown
        id="movementType"
        v-model="form.typeId"
        :options="movementTypesStore.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      >
        <template #option="{ option }">
          <div class="movementCreate__option">
            <Tag v-if="option.is_system" value="Системный" severity="secondary" />
            <span>{{ option.name }}</span>
            <Tag
              v-if="option.sets_status"
              :value="statusLabel(option.sets_status)"
              :severity="statusSeverity(option.sets_status)"
            />
          </div>
        </template>
      </Dropdown>
    </div>

    <div v-if="isTransfer" class="field">
      <label for="fromLocation">Откуда</label>
      <Dropdown
        id="fromLocation"
        v-model="form.fromLocationId"
        :options="locationsStore.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        showClear
      />
    </div>

    <div v-if="isTransfer" class="field">
      <label for="toLocation">Куда *</label>
      <Dropdown
        id="toLocation"
        v-model="form.toLocationId"
        :options="locationsStore.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      />
    </div>

    <div class="field">
      <label for="movementQuantity">Количество</label>
      <InputNumber id="movementQuantity" v-model="form.quantity" :min="1" class="w-full" />
    </div>

    <div class="field">
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
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
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

<style lang="scss" scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.movementCreate__option {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
