<template>
  <div class="ui-filter-grid plantFilters">
    <div class="plantFilters__cell plantFilters__cell--select">
      <label class="sr-only" for="plant-filter-status">Статус</label>
      <Select
        v-model="filters.status"
        class="w-full"
        inputId="plant-filter-status"
        :options="STATUS_OPTIONS"
        optionLabel="label"
        optionValue="value"
        placeholder="Статус"
        showClear
        @change="emit('change')"
      />
    </div>
    <div class="plantFilters__cell plantFilters__cell--select">
      <label class="sr-only" for="plant-filter-species">Вид</label>
      <Select
        v-model="filters.speciesId"
        class="w-full"
        inputId="plant-filter-species"
        :options="speciesStore.activeSpecies"
        optionLabel="display_name_ru"
        optionValue="id"
        placeholder="Вид"
        showClear
        filter
        @change="emit('change')"
      />
    </div>
    <div class="plantFilters__cell plantFilters__cell--select">
      <label class="sr-only" for="plant-filter-container">Контейнер</label>
      <Select
        v-model="filters.containerId"
        class="w-full"
        inputId="plant-filter-container"
        :options="containerTypesStore.activeTypes"
        optionLabel="name"
        optionValue="id"
        placeholder="Контейнер"
        showClear
        @change="emit('change')"
      />
    </div>
    <InputText
      v-model="filters.numericCode"
      class="plantFilters__cell plantFilters__cell--input"
      placeholder="Числовой код"
      @input="emit('change')"
    />
    <InputText
      v-model="filters.search"
      class="plantFilters__cell plantFilters__cell--input"
      placeholder="Поиск..."
      @input="emit('change')"
    />
    <Button class="plantFilters__cell plantFilters__cell--reset" label="Сбросить" text @click="resetFilters" />
  </div>
</template>

<script setup>
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { usePlantsStore } from '@/stores/plants.store'
import { useSpeciesStore } from '@/stores/species.store'
import { computed } from 'vue'

defineOptions({ name: 'PlantFiltersPanel' })

const emit = defineEmits(['change'])
const plantsStore = usePlantsStore()
const speciesStore = useSpeciesStore()
const containerTypesStore = useContainerTypesStore()

const STATUS_OPTIONS = [
  { label: 'В росте', value: 'growing' },
  { label: 'На хранении', value: 'storage' },
  { label: 'Продано', value: 'sold' },
  { label: 'Списано', value: 'written_off' }
]

const filters = computed(() => plantsStore.activeFilters)

function resetFilters() {
  plantsStore.resetFilters()
  emit('change')
}
</script>

<style lang="scss" scoped>
.plantFilters__cell--select,
.plantFilters__cell--input {
  grid-column: span 2;
}

.plantFilters__cell--reset {
  grid-column: span 2;
  justify-self: start;
}

.plantFilters :deep(.p-select),
.plantFilters :deep(.p-inputtext) {
  width: 100%;
  min-height: var(--control-height);
}

@media (max-width: 1200px) {
  .plantFilters__cell--select,
  .plantFilters__cell--input,
  .plantFilters__cell--reset {
    grid-column: span 3;
  }
}

@media (max-width: 900px) {
  .plantFilters__cell--select,
  .plantFilters__cell--input,
  .plantFilters__cell--reset {
    grid-column: span 6;
  }
}
</style>
