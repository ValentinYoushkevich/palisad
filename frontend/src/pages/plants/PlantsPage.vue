<template>
  <section class="plantsPage">
    <div class="plantsPage__header">
      <h2>Реестр растений</h2>
      <div class="plantsPage__actions">
        <Button
          v-if="showCreateActions"
          icon="pi pi-plus"
          label="Добавить"
          @click="createVisible = true"
        />
        <Button
          v-if="showCreateActions"
          icon="pi pi-copy"
          label="Массовый ввод"
          outlined
          @click="bulkVisible = true"
        />
      </div>
    </div>

    <Message v-if="plantsStore.plantsError" severity="error">{{ plantsStore.plantsError }}</Message>
    <PlantFiltersPanel @change="handleFilterChange" />

    <DataTable
      :value="plantsStore.filtered"
      :loading="plantsStore.isLoading"
      lazy
      paginator
      :rows="plantsStore.pagination.perPage"
      :totalRecords="plantsStore.pagination.total"
      stripedRows
      @page="onPage"
    >
      <Column header="QR / Код">
        <template #body="{ data }">
          <div class="plantsPage__mono">{{ data.numeric_code }}</div>
        </template>
      </Column>
      <Column header="Вид / Сорт">
        <template #body="{ data }">
          <div>{{ data.display_name_ru }}</div>
          <div v-if="data.variety" class="plantsPage__muted">{{ data.variety }}</div>
        </template>
      </Column>
      <Column header="Контейнер">
        <template #body="{ data }">
          <Tag v-if="data.container_code" :value="data.container_code" severity="secondary" />
        </template>
      </Column>
      <Column header="Локация">
        <template #body="{ data }">{{ data.location_name || '—' }}</template>
      </Column>
      <Column header="Статус">
        <template #body="{ data }">
          <Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
        </template>
      </Column>
      <Column>
        <template #body="{ data }">
          <Button icon="pi pi-eye" text @click="openPlant(data.id)" />
        </template>
      </Column>
    </DataTable>

    <PlantCreateDialog v-model:visible="createVisible" @created="reloadPlants" />
    <PlantBulkCreateDialog v-model:visible="bulkVisible" @created="reloadPlants" />
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import PlantBulkCreateDialog from '@/pages/plants/components/PlantBulkCreateDialog.vue'
import PlantCreateDialog from '@/pages/plants/components/PlantCreateDialog.vue'
import PlantFiltersPanel from '@/pages/plants/components/PlantFiltersPanel.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useLocationsStore } from '@/stores/locations.store'
import { usePlantsStore } from '@/stores/plants.store'
import { useSpeciesStore } from '@/stores/species.store'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'PlantsPage' })

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

const router = useRouter()
const plantsStore = usePlantsStore()
const authStore = useAuthStore()
const speciesStore = useSpeciesStore()
const locationsStore = useLocationsStore()
const containerTypesStore = useContainerTypesStore()
const { isOnline } = useOnlineStatus()

const createVisible = ref(false)
const bulkVisible = ref(false)
const showCreateActions = computed(() => authStore.canManageStructure && isOnline.value)

onMounted(async () => {
  await Promise.all([
    speciesStore.fetchSpecies(),
    locationsStore.fetchLocations(),
    containerTypesStore.fetchContainerTypes()
  ])

  if (isOnline.value) {
    await plantsStore.fetchPlants()
    return
  }

  await plantsStore.loadFromLocal()
})

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function statusSeverity(status) {
  return STATUS_SEVERITY[status] || 'secondary'
}

async function handleFilterChange() {
  plantsStore.pagination.page = 1
  await plantsStore.fetchPlants(plantsStore.activeFilters)
}

async function onPage(event) {
  plantsStore.pagination.page = event.page + 1
  await plantsStore.fetchPlants(plantsStore.activeFilters)
}

async function reloadPlants() {
  await plantsStore.fetchPlants(plantsStore.activeFilters)
}

function openPlant(id) {
  router.push(`/plants/${id}`)
}
</script>

<style lang="scss" scoped>
.plantsPage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plantsPage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.plantsPage__actions {
  display: flex;
  gap: 8px;
}

.plantsPage__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.plantsPage__muted {
  color: #6b7280;
  font-size: 13px;
}
</style>
