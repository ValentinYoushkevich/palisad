<template>
  <div class="grid grid-cols-6 gap-2">
    <div class="min-w-0">
      <label class="sr-only" for="plant-filter-status">Статус</label>
      <Select
        v-model="filters.status"
        inputId="plant-filter-status"
        :options="STATUS_OPTIONS"
        optionLabel="label"
        optionValue="value"
        placeholder="Статус"
        showClear
        @change="emit('change')"
      />
    </div>
    <div class="min-w-0">
      <label class="sr-only" for="plant-filter-species">Вид</label>
      <Select
        v-model="filters.speciesId"
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
    <div class="min-w-0">
      <label class="sr-only" for="plant-filter-container">Контейнер</label>
      <Select
        v-model="filters.containerId"
        inputId="plant-filter-container"
        :options="containerTypesStore.activeTypes"
        optionLabel="name"
        optionValue="id"
        placeholder="Контейнер"
        showClear
        @change="emit('change')"
      />
    </div>
    <InputText v-model="filters.numericCode" placeholder="Числовой код" @input="emit('change')" />
    <InputText v-model="filters.search" placeholder="Поиск..." @input="emit('change')" />
    <Button label="Сбросить" text @click="resetFilters" />
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
