<template>
  <section class="space-y-4">
    <div class="flex items-center justify-start">
      <Button
        v-if="activeSection"
        icon="pi pi-arrow-left"
        severity="primary"
        outlined
        size="small"
        aria-label="Назад"
        @click="activeSection = null"
      />
      <h2 v-else>Справочники</h2>
    </div>
    <div v-if="!activeSection" class="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Card
        v-for="section in sectionCards"
        :key="section.key"
        class="catalog-card cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-xl"
        @click="activeSection = section.key"
      >
        <template #header>
          <div class="relative flex h-[132px] items-center overflow-hidden p-4" :style="{ background: section.headerGradient }">
            <div class="absolute -right-7 -top-7 h-[140px] w-[140px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0)_70%)]" />
            <div class="relative z-1 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.35)] bg-[rgba(255,255,255,0.18)] backdrop-blur-[2px]">
              <i :class="section.iconClass" />
            </div>
          </div>
        </template>
        <template #title>
          <div class="flex items-center justify-between gap-2 text-slate-900">
            <span class="text-xl font-semibold">{{ section.title }}</span>
            <Tag severity="contrast" :value="section.countLabel" />
          </div>
        </template>
        <template #subtitle>
          <span class="text-sm font-medium text-slate-500">{{ section.subtitle }}</span>
        </template>
        <template #content>
          <p class="m-0 text-sm leading-6 text-slate-700">
            {{ section.description }}
          </p>
        </template>
      </Card>
    </div>

    <div v-else class="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-lg font-semibold">{{ sectionTitle }}</h3>
        <Button
          v-if="authStore.canManageStructure && activeSection === 'species'"
          icon="pi pi-plus"
          label="Добавить вид"
          size="small"
          @click="speciesDialogVisible = true"
        />
        <Button
          v-if="authStore.canManageStructure && activeSection === 'tags'"
          icon="pi pi-plus"
          label="Добавить тег"
          size="small"
          @click="openCreateTag"
        />
        <Button
          v-if="authStore.canManageStructure && activeSection === 'movementTypes'"
          icon="pi pi-plus"
          label="Добавить тип движения"
          size="small"
          @click="openCreateMovementType"
        />
        <Button
          v-if="authStore.canManageStructure && activeSection === 'containerTypes'"
          icon="pi pi-plus"
          label="Добавить тип контейнера"
          size="small"
          @click="openCreateContainerType"
        />
      </div>

      <DataTable
        :value="sectionRows"
        :loading="isSectionLoading"
        :rows="20"
        :rowsPerPageOptions="[20, 50, 100]"
        class="catalog-table"
        paginator
        stripedRows
        size="small"
      >
        <template #empty>
          <div class="py-6 text-center text-sm text-slate-500">
            {{ emptyStateText }}
          </div>
        </template>

        <template v-if="activeSection === 'species'">
          <Column field="display_name_ru" header="Название">
            <template #body="{ data }">
              <div>{{ data.display_name_ru || data.scientific_name }}</div>
              <div class="text-xs text-slate-500">{{ data.scientific_name }}</div>
            </template>
          </Column>
          <Column field="gbif_family" header="Семейство" />
          <Column header="Статус">
            <template #body="{ data }">
              <Tag :value="activeLabel(data.is_active)" :severity="activeSeverity(data.is_active)" />
            </template>
          </Column>
        </template>

        <template v-if="activeSection === 'tags'">
          <Column field="name" header="Название" />
          <Column header="Цвет">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <span class="inline-block h-4 w-4 rounded-full border border-slate-300" :style="{ backgroundColor: data.color }" />
                <span>{{ data.color }}</span>
              </div>
            </template>
          </Column>
          <Column header="Статус">
            <template #body="{ data }">
              <Tag :value="activeLabel(data.is_active)" :severity="activeSeverity(data.is_active)" />
            </template>
          </Column>
          <Column v-if="authStore.canManageStructure" header="Действия">
            <template #body="{ data }">
              <Button icon="pi pi-pencil" text @click="openEditTag(data)" />
            </template>
          </Column>
        </template>

        <template v-if="activeSection === 'movementTypes'">
          <Column field="name" header="Название" />
          <Column field="slug" header="Slug" />
          <Column field="sets_status" header="Меняет статус">
            <template #body="{ data }">{{ statusLabelByValue(data.sets_status) }}</template>
          </Column>
          <Column header="Статус">
            <template #body="{ data }">
              <Tag :value="activeLabel(data.is_active)" :severity="activeSeverity(data.is_active)" />
            </template>
          </Column>
          <Column header="Служебный">
            <template #body="{ data }">
              <Tag :value="systemLabel(data.is_system)" :severity="systemSeverity(data.is_system)" />
            </template>
          </Column>
          <Column v-if="authStore.canManageStructure" header="Действия">
            <template #body="{ data }">
              <Button icon="pi pi-pencil" text @click="openEditMovementType(data)" />
            </template>
          </Column>
        </template>

        <template v-if="activeSection === 'containerTypes'">
          <Column field="name" header="Название" />
          <Column field="code" header="Код" />
          <Column field="container_kind" header="Тип">
            <template #body="{ data }">{{ kindLabelByValue(data.container_kind) }}</template>
          </Column>
          <Column field="volume_liters" header="Объём (л)">
            <template #body="{ data }">{{ data.volume_liters ?? '—' }}</template>
          </Column>
          <Column field="side_cm" header="Сторона (см)">
            <template #body="{ data }">{{ data.side_cm ?? '—' }}</template>
          </Column>
          <Column header="Служебный">
            <template #body="{ data }">
              <Tag :value="systemLabel(data.is_system)" :severity="systemSeverity(data.is_system)" />
            </template>
          </Column>
          <Column v-if="authStore.canManageStructure" header="Действия">
            <template #body="{ data }">
              <Button v-if="!data.is_system" icon="pi pi-pencil" text @click="openEditContainerType(data)" />
            </template>
          </Column>
        </template>
      </DataTable>
    </div>
    <SpeciesSearchDialog v-model:visible="speciesDialogVisible" @created="handleSpeciesCreated" />
    <TagFormDialog
      v-model="tagDialogVisible"
      :errorMessage="tagsStore.tagsError"
      :initialForm="tagInitialForm"
      :loading="tagsStore.isLoading"
      :saveLabel="tagSaveLabel"
      :title="tagDialogTitle"
      @submit="handleSaveTag"
    />
    <MovementTypeDialog
      v-model="movementDialogVisible"
      :errorMessage="movementDialogError"
      :initialForm="movementInitialForm"
      :loading="movementTypesStore.isLoading"
      :saveLabel="movementSaveLabel"
      :statusOptions="movementStatusOptions"
      :title="movementDialogTitle"
      @submit="handleSaveMovementType"
    />
    <ContainerTypeDialog
      v-model="containerDialogVisible"
      :errorMessage="containerTypesStore.containerTypesError"
      :initialForm="containerInitialForm"
      :kindOptions="CONTAINER_KIND_OPTIONS"
      :loading="containerTypesStore.isLoading"
      :saveLabel="containerSaveLabel"
      :title="containerDialogTitle"
      @submit="handleSaveContainerType"
    />
  </section>
</template>

<script setup>
import {
  CONTAINER_KIND_OPTIONS,
  SECTION_CARD_META,
  SECTION_TITLES,
  STATUS_OPTIONS,
  activeLabel,
  activeSeverity,
  defaultContainerForm,
  defaultMovementForm,
  defaultTagForm,
  emptyTextBySection,
  kindLabelByValue,
  statusLabelByValue,
  systemLabel,
  systemSeverity
} from '@/pages/catalog/catalog.config'
import ContainerTypeDialog from '@/pages/catalog/components/ContainerTypeDialog.vue'
import MovementTypeDialog from '@/pages/catalog/components/MovementTypeDialog.vue'
import SpeciesSearchDialog from '@/pages/catalog/components/SpeciesSearchDialog.vue'
import TagFormDialog from '@/pages/catalog/components/TagFormDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useSpeciesStore } from '@/stores/species.store'
import { useTagsStore } from '@/stores/tags.store'
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'CatalogPage' })

const authStore = useAuthStore()
const speciesStore = useSpeciesStore()
const tagsStore = useTagsStore()
const movementTypesStore = useMovementTypesStore()
const containerTypesStore = useContainerTypesStore()

const activeSection = ref(null)
const speciesDialogVisible = ref(false)

const tagDialogVisible = ref(false)
const tagEditingId = ref(null)
const tagInitialForm = ref(defaultTagForm())

const movementDialogVisible = ref(false)
const movementEditingId = ref(null)
const movementInitialForm = ref(defaultMovementForm())
const movementDialogError = ref('')

const containerDialogVisible = ref(false)
const containerEditingId = ref(null)
const containerInitialForm = ref(defaultContainerForm())

const sectionTitle = computed(() => SECTION_TITLES[activeSection.value] || 'Справочник')
const emptyStateText = computed(() => emptyTextBySection(activeSection.value))
const sectionCountMap = computed(() => ({
  species: speciesStore.species.length,
  tags: tagsStore.tags.length,
  movementTypes: movementTypesStore.movementTypes.length,
  containerTypes: containerTypesStore.containerTypes.length
}))
const sectionCards = computed(() => SECTION_CARD_META.map((item) => ({ ...item, countLabel: String(sectionCountMap.value[item.key] ?? 0) })))

const sectionRows = computed(() => {
  if (activeSection.value === 'species') {
    return speciesStore.species
  }
  if (activeSection.value === 'tags') {
    return tagsStore.tags
  }
  if (activeSection.value === 'movementTypes') {
    return movementTypesStore.movementTypes
  }
  if (activeSection.value === 'containerTypes') {
    return containerTypesStore.containerTypes
  }

  return []
})

const isSectionLoading = computed(() => {
  if (activeSection.value === 'species') {
    return speciesStore.isLoading
  }
  if (activeSection.value === 'tags') {
    return tagsStore.isLoading
  }
  if (activeSection.value === 'movementTypes') {
    return movementTypesStore.isLoading
  }
  if (activeSection.value === 'containerTypes') {
    return containerTypesStore.isLoading
  }

  return false
})

const tagDialogTitle = computed(() => (tagEditingId.value ? 'Редактировать тег' : 'Добавить тег'))
const movementDialogTitle = computed(() => (movementEditingId.value ? 'Редактировать тип движения' : 'Добавить тип движения'))
const containerDialogTitle = computed(() => (containerEditingId.value ? 'Редактировать тип контейнера' : 'Добавить тип контейнера'))
const tagSaveLabel = computed(() => (tagEditingId.value ? 'Сохранить' : 'Добавить'))
const movementSaveLabel = computed(() => (movementEditingId.value ? 'Сохранить' : 'Добавить'))
const containerSaveLabel = computed(() => (containerEditingId.value ? 'Сохранить' : 'Добавить'))
const movementStatusOptions = [{ label: 'Не меняет', value: '__none__' }, ...STATUS_OPTIONS]
onMounted(async () => {
  await Promise.all([
    speciesStore.fetchSpecies(),
    tagsStore.fetchTags(),
    movementTypesStore.fetchMovementTypes(),
    containerTypesStore.fetchContainerTypes()
  ])
})

function openCreateTag() {
  tagEditingId.value = null
  tagInitialForm.value = defaultTagForm()
  tagsStore.tagsError = ''
  tagDialogVisible.value = true
}
function openEditTag(item) {
  tagEditingId.value = item.id
  tagInitialForm.value = {
    name: item.name || '',
    color: item.color || '#3B82F6',
    is_active: Boolean(item.is_active)
  }
  tagsStore.tagsError = ''
  tagDialogVisible.value = true
}

async function handleSaveTag(formData) {
  if (!formData?.name?.trim()) {
    return
  }
  const payload = {
    name: formData.name.trim(),
    color: formData.color,
    is_active: Boolean(formData.is_active)
  }
  const result = tagEditingId.value
    ? await tagsStore.updateTag(tagEditingId.value, payload)
    : await tagsStore.createTag(payload)
  if (!result?.ok) {
    return
  }
  tagDialogVisible.value = false
}

function openCreateMovementType() {
  movementEditingId.value = null
  movementInitialForm.value = defaultMovementForm()
  movementDialogError.value = ''
  movementTypesStore.movementTypesError = ''
  movementDialogVisible.value = true
}
function openEditMovementType(item) {
  movementEditingId.value = item.id
  movementInitialForm.value = {
    name: item.name || '',
    slug: item.slug || '',
    sets_status: item.sets_status ?? null,
    is_active: Boolean(item.is_active)
  }
  movementDialogError.value = ''
  movementTypesStore.movementTypesError = ''
  movementDialogVisible.value = true
}

async function handleSaveMovementType(formData) {
  movementDialogError.value = ''
  if (!formData?.name?.trim() || !formData?.slug?.trim()) {
    return
  }
  const payload = {
    name: formData.name.trim(),
    slug: formData.slug.trim(),
    sets_status: formData.sets_status || null,
    is_active: Boolean(formData.is_active)
  }
  const result = movementEditingId.value
    ? await movementTypesStore.updateMovementType(movementEditingId.value, payload)
    : await movementTypesStore.createMovementType(payload)
  if (!result?.ok) {
    movementDialogError.value = result?.error || movementTypesStore.movementTypesError || 'Не удалось сохранить тип движения.'
    return
  }
  movementTypesStore.movementTypesError = ''
  movementDialogVisible.value = false
  await movementTypesStore.fetchMovementTypes()
}

function openCreateContainerType() {
  containerEditingId.value = null
  containerInitialForm.value = defaultContainerForm()
  containerTypesStore.containerTypesError = ''
  containerDialogVisible.value = true
}
function openEditContainerType(item) {
  if (item.is_system) {
    containerTypesStore.containerTypesError = 'Системный тип контейнера нельзя изменять.'; containerDialogVisible.value = false
    return
  }
  containerEditingId.value = item.id
  containerInitialForm.value = {
    code: item.code || '',
    name: item.name || '',
    container_kind: item.container_kind || 'pot',
    volume_liters: item.volume_liters ?? null,
    side_cm: item.side_cm ?? null,
    is_active: Boolean(item.is_active)
  }
  containerTypesStore.containerTypesError = ''
  containerDialogVisible.value = true
}

async function handleSaveContainerType(formData) {
  if (!formData?.code?.trim() || !formData?.name?.trim() || !formData?.container_kind) {
    return
  }
  const payload = {
    code: formData.code.trim(),
    name: formData.name.trim(),
    container_kind: formData.container_kind,
    volume_liters: formData.volume_liters,
    side_cm: formData.side_cm,
    is_active: Boolean(formData.is_active)
  }
  const result = containerEditingId.value
    ? await containerTypesStore.updateContainerType(containerEditingId.value, payload)
    : await containerTypesStore.createContainerType(payload)
  if (!result?.ok) {
    return
  }
  containerDialogVisible.value = false
}

async function handleSpeciesCreated() {
  await speciesStore.fetchSpecies()
}
</script>

<style scoped lang="scss">
.catalog-card :deep(.p-card-body) {
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.catalog-card :deep(.p-card-content) {
  padding: 0.25rem 0;
}

.catalog-card :deep(.p-card-footer) {
  margin-top: 0.2rem;
}

.catalog-table :deep(.p-paginator-bottom) {
  border-bottom: none;
}
</style>
