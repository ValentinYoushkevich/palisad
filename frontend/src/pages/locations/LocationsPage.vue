<template>
  <section class="locationsPage">
    <div class="locationsPage__header">
      <h2>Структура питомника</h2>
      <Button
        v-if="authStore.canManageStructure"
        icon="pi pi-plus"
        label="Добавить"
        @click="openCreate(null)"
      />
    </div>

    <Message v-if="locationsStore.locationsError" severity="error">
      {{ locationsStore.locationsError }}
    </Message>

    <Tree :value="locationsStore.tree" :loading="locationsStore.isLoading" class="locationsPage__tree">
      <template #default="{ node }">
        <div class="locationsPage__node">
          <Tag :value="typeLabel(node.type)" severity="secondary" />
          <span>{{ node.name }}</span>
          <div v-if="authStore.canManageStructure" class="locationsPage__nodeActions">
            <Button icon="pi pi-plus" size="small" text @click.stop="openCreate(node.id)" />
            <Button icon="pi pi-pencil" size="small" text @click.stop="openEdit(node)" />
            <Button icon="pi pi-trash" severity="danger" size="small" text @click.stop="handleDelete(node.id)" />
          </div>
        </div>
      </template>
    </Tree>

    <LocationCreateDialog v-model:visible="createVisible" :parentId="selectedParentId" @created="handleReload" />
    <LocationEditDialog v-model:visible="editVisible" :location="selectedLocation" @updated="handleReload" />
  </section>
</template>

<script setup>
import LocationCreateDialog from '@/pages/locations/components/LocationCreateDialog.vue'
import LocationEditDialog from '@/pages/locations/components/LocationEditDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useLocationsStore } from '@/stores/locations.store'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Tree from 'primevue/tree'
import { onMounted, ref } from 'vue'

defineOptions({ name: 'LocationsPage' })

const TYPE_LABELS = {
  area: 'Участок',
  section: 'Секция',
  row: 'Ряд',
  place: 'Место'
}

const authStore = useAuthStore()
const locationsStore = useLocationsStore()
const createVisible = ref(false)
const editVisible = ref(false)
const selectedParentId = ref(null)
const selectedLocation = ref(null)

onMounted(async () => {
  await locationsStore.fetchLocations()
})

function openCreate(parentId) {
  selectedParentId.value = parentId
  createVisible.value = true
}

function openEdit(location) {
  selectedLocation.value = location
  editVisible.value = true
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type
}

async function handleDelete(id) {
  await locationsStore.deleteLocation(id)
}

async function handleReload() {
  await locationsStore.fetchLocations()
}
</script>

<style lang="scss" scoped>
.locationsPage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.locationsPage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.locationsPage__tree {
  background: #ffffff;
  border-radius: 8px;
  padding: 8px;
}

.locationsPage__node {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.locationsPage__nodeActions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
</style>
