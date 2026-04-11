<template>
  <Dialog
    :visible="visible"
    header="Новое растение"
    modal
    style="width: 520px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="plantSpecies">Вид *</label>
      <Select
        id="plantSpecies"
        v-model="form.speciesId"
        :options="speciesStore.activeSpecies"
        optionLabel="display_name_ru"
        optionValue="id"
        class="w-full"
        filter
      />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="plantVariety">Сорт</label>
      <InputText id="plantVariety" v-model="form.variety" class="w-full" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="plantDate">Дата посадки</label>
      <DatePicker id="plantDate" v-model="form.plantedAt" class="w-full" dateFormat="yy-mm-dd" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <span>Источник</span>
      <SelectButton v-model="form.source" :options="SOURCE_OPTIONS" optionLabel="label" optionValue="value" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="plantContainer">Контейнер</label>
      <Select
        id="plantContainer"
        v-model="form.containerId"
        :options="containerTypesStore.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="plantLocation">Местонахождение</label>
      <Select
        id="plantLocation"
        v-model="form.locationId"
        :options="locationsStore.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        filter
      />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="plantNotes">Заметки</label>
      <Textarea id="plantNotes" v-model="form.notes" class="w-full" rows="2" />
    </div>

    <Message v-if="plantsStore.plantsError" severity="error">{{ plantsStore.plantsError }}</Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="plantsStore.isLoading" label="Создать" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script setup>
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useLocationsStore } from '@/stores/locations.store'
import { usePlantsStore } from '@/stores/plants.store'
import { useSpeciesStore } from '@/stores/species.store'
import { ref } from 'vue'

defineOptions({ name: 'PlantCreateDialog' })

defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'created'])
const plantsStore = usePlantsStore()
const speciesStore = useSpeciesStore()
const locationsStore = useLocationsStore()
const containerTypesStore = useContainerTypesStore()

const SOURCE_OPTIONS = [
  { label: 'Своё', value: 'own' },
  { label: 'Куплено', value: 'purchased' }
]

const form = ref({
  speciesId: null,
  variety: '',
  plantedAt: null,
  source: 'own',
  containerId: null,
  locationId: null,
  notes: ''
})

function emitVisible(value) {
  emit('update:visible', value)
}

function normalizePayload() {
  return {
    speciesId: form.value.speciesId,
    variety: form.value.variety || null,
    plantedAt: form.value.plantedAt ? toIsoDate(form.value.plantedAt) : null,
    source: form.value.source || null,
    containerId: form.value.containerId || null,
    locationId: form.value.locationId || null,
    notes: form.value.notes || null
  }
}

async function handleCreate() {
  const result = await plantsStore.createPlant(normalizePayload())

  if (!result?.ok) {
    return
  }

  form.value = {
    speciesId: null,
    variety: '',
    plantedAt: null,
    source: 'own',
    containerId: null,
    locationId: null,
    notes: ''
  }

  emit('created')
  emitVisible(false)
}

function toIsoDate(value) {
  if (typeof value === 'string') {
    return value
  }

  const date = new Date(value)
  return date.toISOString().slice(0, 10)
}
</script>
