<template>
  <section class="page-shell flex flex-col gap-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2>Карточка растения</h2>
        <p class="text-sm text-gray-500">
          ID: <span class="font-mono">{{ shortPlantId }}</span>
          <span class="ml-1 text-xs text-gray-400">({{ plantId }})</span>
        </p>
      </div>
      <div class="flex gap-2">
        <Button label="Назад к реестру" text @click="router.push('/plants')" />
        <Button v-if="authStore.canWrite" icon="pi pi-plus" label="Добавить операцию" @click="createOperationVisible = true" />
        <Button
          v-if="authStore.canWrite"
          icon="pi pi-arrow-right-arrow-left"
          label="Добавить движение"
          outlined
          @click="createMovementVisible = true"
        />
      </div>
    </div>

    <Message v-if="operationsStore.operationsError" severity="error">
      {{ operationsStore.operationsError }}
    </Message>

    <div class="page-panel flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">Производственная стадия</h3>
        <Tag v-if="currentStageName" :value="currentStageName" severity="info" />
        <span v-else class="text-sm text-gray-500">Стадия не задана</span>
      </div>
      <ul v-if="stageHistory.length" class="flex flex-col gap-1 text-sm">
        <li v-for="entry in stageHistory" :key="entry.id" class="flex items-center justify-between border-b border-slate-100 py-1">
          <span>{{ entry.stage_name || '—' }}</span>
          <span class="text-xs text-gray-500">
            {{ formatDateTime(entry.created_at) }}<template v-if="entry.changed_by_name"> · {{ entry.changed_by_name }}</template>
          </span>
        </li>
      </ul>
      <p v-else class="text-sm text-gray-500">История смены стадий пуста.</p>
    </div>

    <div class="page-panel">
      <OperationTimeline
        :operations="operationsStore.forPlant(plantId)"
        :isLoading="operationsStore.isLoading"
        :canEdit="authStore.canWrite"
        @delete="handleDelete"
      />
    </div>
    <div class="page-panel">
      <MovementHistory
        :movements="movementsStore.forPlant(plantId)"
        :isLoading="movementsStore.isLoading"
        :canDelete="canDeleteMovement"
        @delete="handleDeleteMovement"
      />
    </div>

    <OperationCreateDialog
      v-model:visible="createOperationVisible"
      :plantId="plantId"
      @created="reloadOperations"
    />
    <MovementCreateDialog
      v-model:visible="createMovementVisible"
      :plantId="plantId"
      @created="reloadMovements"
    />
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import MovementCreateDialog from '@/pages/plants/components/MovementCreateDialog.vue'
import MovementHistory from '@/pages/plants/components/MovementHistory.vue'
import OperationCreateDialog from '@/pages/plants/components/OperationCreateDialog.vue'
import OperationTimeline from '@/pages/plants/components/OperationTimeline.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useLocationsStore } from '@/stores/locations.store'
import { useMovementsStore } from '@/stores/movements.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useOperationsStore } from '@/stores/operations.store'
import { usePlantsStore } from '@/stores/plants.store'
import { useProductionStagesStore } from '@/stores/productionStages.store'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

defineOptions({ name: 'PlantDetailPage' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const plantsStore = usePlantsStore()
const operationsStore = useOperationsStore()
const movementsStore = useMovementsStore()
const containerTypesStore = useContainerTypesStore()
const movementTypesStore = useMovementTypesStore()
const locationsStore = useLocationsStore()
const productionStagesStore = useProductionStagesStore()
const { isOnline } = useOnlineStatus()
const createOperationVisible = ref(false)
const createMovementVisible = ref(false)

const plantId = computed(() => String(route.params.id || ''))
const shortPlantId = computed(() => plantId.value.slice(0, 8))
const canDeleteMovement = computed(() => authStore.isOwner || authStore.isAgronomist)

const plant = computed(() => plantsStore.plants.find((item) => item.id === plantId.value) || null)
const stageHistory = computed(() => plant.value?.stageHistory || [])
const currentStageName = computed(() => {
  const stageId = plant.value?.stage_id
  if (!stageId) {
    return ''
  }
  const fromStore = productionStagesStore.stageById(stageId)
  if (fromStore) {
    return fromStore.name
  }
  return stageHistory.value.find((entry) => entry.stage_id === stageId)?.stage_name || ''
})

function formatDateTime(value) {
  if (!value) {
    return ''
  }
  try {
    return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

onMounted(async () => {
  await Promise.all([
    containerTypesStore.fetchContainerTypes(),
    movementTypesStore.fetchMovementTypes(),
    locationsStore.fetchLocations(),
    productionStagesStore.fetchStages()
  ])

  if (isOnline.value) {
    await plantsStore.refreshPlant(plantId.value)
    await Promise.all([
      operationsStore.fetchOperations(plantId.value),
      movementsStore.fetchMovements(plantId.value)
    ])
    return
  }

  await Promise.all([
    operationsStore.loadFromLocal(plantId.value),
    movementsStore.loadFromLocal(plantId.value)
  ])
})

async function reloadOperations() {
  await operationsStore.fetchOperations(plantId.value)
}

async function reloadMovements() {
  await movementsStore.fetchMovements(plantId.value)
}

async function handleDelete(operation) {
  if (!operation?.id) {
    return
  }

  await operationsStore.softDelete(operation.id, plantId.value)
}

async function handleDeleteMovement(movement) {
  if (!movement?.id) {
    return
  }

  await movementsStore.deleteMovement(movement.id, plantId.value)
}
</script>
