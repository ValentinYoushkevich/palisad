<template>
  <div class="grid grid-cols-6 gap-2">
    <Dropdown
      v-model="filters.status"
      :options="STATUS_OPTIONS"
      optionLabel="label"
      optionValue="value"
      placeholder="Статус"
      showClear
      @change="emit('change')"
    />
    <Dropdown
      v-model="filters.speciesId"
      :options="speciesStore.activeSpecies"
      optionLabel="display_name_ru"
      optionValue="id"
      placeholder="Вид"
      showClear
      filter
      @change="emit('change')"
    />
    <Dropdown
      v-model="filters.containerId"
      :options="containerTypesStore.activeTypes"
      optionLabel="name"
      optionValue="id"
      placeholder="Контейнер"
      showClear
      @change="emit('change')"
    />
    <InputText v-model="filters.numericCode" placeholder="Числовой код" @input="emit('change')" />
    <InputText v-model="filters.search" placeholder="Поиск..." @input="emit('change')" />
    <Button label="Сбросить" text @click="resetFilters" />
  </div>
</template>

<script setup>
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { usePlantsStore } from '@/stores/plants.store'
import { useSpeciesStore } from '@/stores/species.store'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'
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
