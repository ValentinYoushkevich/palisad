<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2>Структура питомника</h2>
      <Button
        v-if="authStore.canManageStructure"
        icon="pi pi-plus"
        label="Добавить"
        @click="openCreateRoot"
      />
    </div>

    <Message v-if="locationsStore.locationsError" severity="error">
      {{ locationsStore.locationsError }}
    </Message>

    <Tree :value="locationsStore.tree" :loading="locationsStore.isLoading" class="rounded-lg bg-white p-2 locationsPage__tree">
      <template #default="{ node }">
        <div class="box-border flex w-full min-w-0 max-w-full items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <Tag :value="typeLabel(node.type)" severity="secondary" />
            <span class="truncate">{{ node.name }}</span>
            <Button
              v-if="authStore.canManageStructure && node.type !== 'place'"
              icon="pi pi-plus"
              size="small"
              text
              @click.stop="openCreateChild(node)"
            />
          </div>
          <div v-if="authStore.canManageStructure" class="flex shrink-0 items-center gap-1">
            <Button icon="pi pi-pencil" size="small" text @click.stop="openEdit(node)" />
            <Button icon="pi pi-trash" severity="danger" size="small" text @click.stop="handleDelete(node, $event)" />
          </div>
        </div>
      </template>
    </Tree>

    <LocationCreateDialog
      v-model:visible="createVisible"
      :parentId="selectedParentId"
      :parentType="selectedParentType"
      @created="handleReload"
    />
    <LocationEditDialog v-model:visible="editVisible" :location="selectedLocation" @updated="handleReload" />
  </section>
</template>

<script setup>
import LocationCreateDialog from '@/pages/locations/components/LocationCreateDialog.vue'
import LocationEditDialog from '@/pages/locations/components/LocationEditDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useLocationsStore } from '@/stores/locations.store'
import { useConfirm } from 'primevue/useconfirm'
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
const confirm = useConfirm()
const createVisible = ref(false)
const editVisible = ref(false)
const selectedParentId = ref(null)
const selectedParentType = ref(null)
const selectedLocation = ref(null)

onMounted(async () => {
  await locationsStore.fetchLocations()
})

function openCreateRoot() {
  selectedParentId.value = null
  selectedParentType.value = null
  createVisible.value = true
}

function openCreateChild(node) {
  selectedParentId.value = node.id
  selectedParentType.value = node.type
  createVisible.value = true
}

function openEdit(location) {
  selectedLocation.value = location
  editVisible.value = true
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type
}

async function deleteLocationById(id) {
  await locationsStore.deleteLocation(id)
}

function typeLabelLower(type) {
  const map = {
    area: 'участок',
    section: 'секцию',
    row: 'ряд'
  }
  return map[type] || 'локацию'
}

async function handleDelete(node, event) {
  if (node.type === 'place') {
    await deleteLocationById(node.id)
    return
  }

  confirm.require({
    target: event?.currentTarget,
    header: 'Подтверждение удаления',
    message: `Вы действительно хотите удалить ${typeLabelLower(node.type)}?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Удалить',
    rejectLabel: 'Отмена',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await deleteLocationById(node.id)
    }
  })
}

async function handleReload() {
  await locationsStore.fetchLocations()
}
</script>

<style lang="scss" scoped>
.locationsPage__tree {
  /* Строка дерева на всю ширину: toggler слева, подпись растягивается */
  :deep(.p-treenode-content) {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    width: 100%;
  }

  :deep(.p-treenode-label) {
    flex: 1;
    min-width: 0;
  }

  /* Разделение между корневыми узлами (только прямые li в ul.p-tree-container, не вложенные) */
  :deep(.p-tree-container > li.p-treenode:not(:last-child)) {
    border-bottom: 1px solid var(--surface-border, #dee2e6);
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
}
</style>
