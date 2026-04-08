<template>
  <section class="plantDetail">
    <div class="plantDetail__head">
      <div>
        <h2>Карточка растения</h2>
        <p class="plantDetail__meta">ID: {{ route.params.id }}</p>
      </div>
      <div class="plantDetail__actions">
        <Button label="Назад к реестру" text @click="router.push('/plants')" />
        <Button
          v-if="authStore.canWrite"
          icon="pi pi-plus"
          label="Добавить операцию"
          @click="createOperationVisible = true"
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

    <OperationCreateDialog
      v-model:visible="createOperationVisible"
      :plantId="plantId"
      @created="reloadOperations"
    />
  </section>
</template>

<script setup>
import OperationTimeline from '@/components/OperationTimeline.vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import OperationCreateDialog from '@/pages/plants/components/OperationCreateDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
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
const containerTypesStore = useContainerTypesStore()
const { isOnline } = useOnlineStatus()
const createOperationVisible = ref(false)

const plantId = computed(() => String(route.params.id || ''))

onMounted(async () => {
  await containerTypesStore.fetchContainerTypes()

  if (isOnline.value) {
    await plantsStore.refreshPlant(plantId.value)
    await operationsStore.fetchOperations(plantId.value)
    return
  }

  await operationsStore.loadFromLocal(plantId.value)
})

async function reloadOperations() {
  await operationsStore.fetchOperations(plantId.value)
}

async function handleDelete(operation) {
  if (!operation?.id) {
    return
  }

  await operationsStore.softDelete(operation.id, plantId.value)
}
</script>

<style lang="scss" scoped>
.plantDetail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plantDetail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.plantDetail__actions {
  display: flex;
  gap: 8px;
}

.plantDetail__meta {
  color: #6b7280;
}
</style>
