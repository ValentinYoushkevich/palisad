<template>
  <section class="flex flex-col gap-2.5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2>Карточка растения</h2>
        <p class="text-sm text-gray-500">ID: {{ route.params.id }}</p>
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

    <OperationTimeline
      :operations="operationsStore.forPlant(plantId)"
      :isLoading="operationsStore.isLoading"
      :canEdit="authStore.canWrite"
      @delete="handleDelete"
    />
    <MovementHistory
      :movements="movementsStore.forPlant(plantId)"
      :isLoading="movementsStore.isLoading"
      :canDelete="canDeleteMovement"
      @delete="handleDeleteMovement"
    />

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
import MovementHistory from '@/components/MovementHistory.vue'
import OperationTimeline from '@/components/OperationTimeline.vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import MovementCreateDialog from '@/pages/plants/components/MovementCreateDialog.vue'
import OperationCreateDialog from '@/pages/plants/components/OperationCreateDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useLocationsStore } from '@/stores/locations.store'
import { useMovementsStore } from '@/stores/movements.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useOperationsStore } from '@/stores/operations.store'
import { usePlantsStore } from '@/stores/plants.store'
import Button from 'primevue/button'
import Message from 'primevue/message'
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
const { isOnline } = useOnlineStatus()
const createOperationVisible = ref(false)
const createMovementVisible = ref(false)

const plantId = computed(() => String(route.params.id || ''))
const canDeleteMovement = computed(() => authStore.isOwner || authStore.isAgronomist)

onMounted(async () => {
  await Promise.all([
    containerTypesStore.fetchContainerTypes(),
    movementTypesStore.fetchMovementTypes(),
    locationsStore.fetchLocations()
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
