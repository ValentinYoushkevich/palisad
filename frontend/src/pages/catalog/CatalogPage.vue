<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h2>Справочники</h2>
      <Button
        v-if="activeSection"
        label="Назад к разделам"
        icon="pi pi-arrow-left"
        text
        @click="activeSection = null"
      />
    </div>

    <Message v-if="errorText" severity="error">{{ errorText }}</Message>

    <div v-if="!activeSection" class="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Card
        v-for="section in sectionCards"
        :key="section.key"
        class="catalog-card cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl"
        @click="activeSection = section.key"
      >
        <template #header>
          <div class="catalog-card__header" :style="{ background: section.headerGradient }">
            <div class="catalog-card__glow" />
            <div class="catalog-card__orb">
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
        <template #footer>
          <div class="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
            <span class="text-slate-500">Добавлено</span>
            <span class="font-semibold text-slate-800">{{ section.countLabel }}</span>
          </div>
        </template>
      </Card>
    </div>

    <div v-else class="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-lg font-semibold">{{ sectionTitle }}</h3>
        <div class="text-sm text-slate-500">
          Всего записей: <span class="font-semibold text-slate-800">{{ sectionCount }}</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-if="authStore.canManageStructure && activeSection === 'species'"
          icon="pi pi-plus"
          label="Добавить вид"
          @click="speciesDialogVisible = true"
        />
        <Button
          v-if="authStore.canManageStructure && activeSection === 'tags'"
          icon="pi pi-plus"
          label="Добавить тег"
          @click="openCreateTag"
        />
        <Button
          v-if="authStore.canManageStructure && activeSection === 'movementTypes'"
          icon="pi pi-plus"
          label="Добавить тип движения"
          @click="openCreateMovementType"
        />
        <Button
          v-if="authStore.canManageStructure && activeSection === 'containerTypes'"
          icon="pi pi-plus"
          label="Добавить тип контейнера"
          @click="openCreateContainerType"
        />
      </div>

      <DataTable
        :value="sectionRows"
        :loading="isSectionLoading"
        stripedRows
        size="small"
      >
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
          <Column v-if="authStore.canManageStructure" header="Действия">
            <template #body="{ data }">
              <Button icon="pi pi-pencil" text @click="openEditContainerType(data)" />
            </template>
          </Column>
        </template>
      </DataTable>
    </div>

    <SpeciesSearchDialog v-model:visible="speciesDialogVisible" @created="handleSpeciesCreated" />

    <Dialog v-model:visible="tagDialogVisible" :header="tagDialogTitle" modal style="width: 460px">
      <div class="space-y-3">
        <div class="space-y-1">
          <label for="tagName">Название</label>
          <InputText id="tagName" v-model="tagForm.name" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="tagColor">Цвет (HEX)</label>
          <InputText id="tagColor" v-model="tagForm.color" class="w-full" placeholder="#3B82F6" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="tagForm.is_active" type="checkbox">
          <span>Активен</span>
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" text @click="tagDialogVisible = false" />
        <Button :label="tagSaveLabel" :loading="tagsStore.isLoading" @click="handleSaveTag" />
      </template>
    </Dialog>

    <Dialog v-model:visible="movementDialogVisible" :header="movementDialogTitle" modal style="width: 520px">
      <div class="space-y-3">
        <div class="space-y-1">
          <label for="movementName">Название</label>
          <InputText id="movementName" v-model="movementForm.name" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="movementSlug">Slug</label>
          <InputText id="movementSlug" v-model="movementForm.slug" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="movementStatus">Меняет статус</label>
          <select id="movementStatus" v-model="movementForm.sets_status" class="w-full rounded-md border border-slate-300 px-3 py-2">
            <option :value="null">Не меняет</option>
            <option v-for="status in STATUS_OPTIONS" :key="status.value" :value="status.value">{{ status.label }}</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="movementForm.is_active" type="checkbox">
          <span>Активен</span>
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" text @click="movementDialogVisible = false" />
        <Button :label="movementSaveLabel" :loading="movementTypesStore.isLoading" @click="handleSaveMovementType" />
      </template>
    </Dialog>

    <Dialog v-model:visible="containerDialogVisible" :header="containerDialogTitle" modal style="width: 560px">
      <div class="grid gap-3 md:grid-cols-2">
        <div class="space-y-1">
          <label for="containerName">Название</label>
          <InputText id="containerName" v-model="containerForm.name" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="containerCode">Код</label>
          <InputText id="containerCode" v-model="containerForm.code" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="containerKind">Вид контейнера</label>
          <select id="containerKind" v-model="containerForm.container_kind" class="w-full rounded-md border border-slate-300 px-3 py-2">
            <option v-for="kind in CONTAINER_KIND_OPTIONS" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label for="containerVolume">Объём (л)</label>
          <InputNumber id="containerVolume" v-model="containerForm.volume_liters" class="w-full" :min="0" :useGrouping="false" />
        </div>
        <div class="space-y-1">
          <label for="containerSide">Сторона (см)</label>
          <InputNumber id="containerSide" v-model="containerForm.side_cm" class="w-full" :min="0" :useGrouping="false" />
        </div>
        <label class="mt-7 flex items-center gap-2 text-sm text-slate-700">
          <input v-model="containerForm.is_active" type="checkbox">
          <span>Активен</span>
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" text @click="containerDialogVisible = false" />
        <Button :label="containerSaveLabel" :loading="containerTypesStore.isLoading" @click="handleSaveContainerType" />
      </template>
    </Dialog>
  </section>
</template>

<script setup>
import '@/pages/catalog/catalog-cards.scss'
import {
  CONTAINER_KIND_OPTIONS,
  SECTION_TITLES,
  STATUS_OPTIONS,
  activeLabel,
  activeSeverity,
  defaultContainerForm,
  defaultMovementForm,
  defaultTagForm,
  kindLabelByValue,
  statusLabelByValue,
  systemLabel,
  systemSeverity
} from '@/pages/catalog/catalog.config'
import SpeciesSearchDialog from '@/pages/catalog/components/SpeciesSearchDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useSpeciesStore } from '@/stores/species.store'
import { useTagsStore } from '@/stores/tags.store'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
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
const tagForm = ref(defaultTagForm())

const movementDialogVisible = ref(false)
const movementEditingId = ref(null)
const movementForm = ref(defaultMovementForm())

const containerDialogVisible = ref(false)
const containerEditingId = ref(null)
const containerForm = ref(defaultContainerForm())

const errorText = computed(() => (
  speciesStore.speciesError ||
  tagsStore.tagsError ||
  movementTypesStore.movementTypesError ||
  containerTypesStore.containerTypesError
))

const sectionTitle = computed(() => SECTION_TITLES[activeSection.value] || 'Справочник')
const sectionCount = computed(() => sectionRows.value.length)

const sectionCards = computed(() => [
  {
    key: 'species',
    title: 'Виды',
    subtitle: 'Каталог растений',
    description: 'Виды и наименования, с которыми работает питомник.',
    countLabel: String(speciesStore.species.length),
    iconClass: 'pi pi-sparkles text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #059669 0%, #0d9488 52%, #0284c7 100%)'
  },
  {
    key: 'tags',
    title: 'Теги',
    subtitle: 'Маркировка',
    description: 'Теги для группировки, поиска и фильтрации растений.',
    countLabel: String(tagsStore.tags.length),
    iconClass: 'pi pi-tag text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #2563eb 0%, #4f46e5 52%, #7c3aed 100%)'
  },
  {
    key: 'movementTypes',
    title: 'Типы движений',
    subtitle: 'Операции',
    description: 'Типы операций перемещения и изменения статусов.',
    countLabel: String(movementTypesStore.movementTypes.length),
    iconClass: 'pi pi-arrow-right-arrow-left text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #f59e0b 0%, #f97316 52%, #ef4444 100%)'
  },
  {
    key: 'containerTypes',
    title: 'Типы контейнеров',
    subtitle: 'Тара и ёмкости',
    description: 'Шаблоны контейнеров и параметры тары для учета.',
    countLabel: String(containerTypesStore.containerTypes.length),
    iconClass: 'pi pi-box text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #64748b 0%, #334155 52%, #0f172a 100%)'
  }
])

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
  tagForm.value = defaultTagForm()
  tagDialogVisible.value = true
}

function openEditTag(item) {
  tagEditingId.value = item.id
  tagForm.value = {
    name: item.name || '',
    color: item.color || '#3B82F6',
    is_active: Boolean(item.is_active)
  }
  tagDialogVisible.value = true
}

async function handleSaveTag() {
  if (!tagForm.value.name?.trim()) {
    return
  }
  const payload = {
    name: tagForm.value.name.trim(),
    color: normalizeHex(tagForm.value.color),
    is_active: Boolean(tagForm.value.is_active)
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
  movementForm.value = defaultMovementForm()
  movementDialogVisible.value = true
}

function openEditMovementType(item) {
  movementEditingId.value = item.id
  movementForm.value = {
    name: item.name || '',
    slug: item.slug || '',
    sets_status: item.sets_status ?? null,
    is_active: Boolean(item.is_active)
  }
  movementDialogVisible.value = true
}

async function handleSaveMovementType() {
  if (!movementForm.value.name?.trim() || !movementForm.value.slug?.trim()) {
    return
  }
  const payload = {
    name: movementForm.value.name.trim(),
    slug: movementForm.value.slug.trim(),
    sets_status: movementForm.value.sets_status || null,
    is_active: Boolean(movementForm.value.is_active)
  }
  const result = movementEditingId.value
    ? await movementTypesStore.updateMovementType(movementEditingId.value, payload)
    : await movementTypesStore.createMovementType(payload)
  if (!result?.ok) {
    return
  }
  movementDialogVisible.value = false
}

function openCreateContainerType() {
  containerEditingId.value = null
  containerForm.value = defaultContainerForm()
  containerDialogVisible.value = true
}

function openEditContainerType(item) {
  containerEditingId.value = item.id
  containerForm.value = {
    code: item.code || '',
    name: item.name || '',
    container_kind: item.container_kind || 'pot',
    volume_liters: item.volume_liters ?? null,
    side_cm: item.side_cm ?? null,
    is_active: Boolean(item.is_active)
  }
  containerDialogVisible.value = true
}

async function handleSaveContainerType() {
  if (!containerForm.value.code?.trim() || !containerForm.value.name?.trim() || !containerForm.value.container_kind) {
    return
  }
  const payload = {
    code: containerForm.value.code.trim(),
    name: containerForm.value.name.trim(),
    container_kind: containerForm.value.container_kind,
    volume_liters: containerForm.value.volume_liters,
    side_cm: containerForm.value.side_cm,
    is_active: Boolean(containerForm.value.is_active)
  }
  const result = containerEditingId.value
    ? await containerTypesStore.updateContainerType(containerEditingId.value, payload)
    : await containerTypesStore.createContainerType(payload)
  if (!result?.ok) {
    return
  }
  containerDialogVisible.value = false
}

function normalizeHex(value) {
  if (!value) {
    return '#3B82F6'
  }

  const raw = value.trim().replace('#', '')
  const candidate = `#${raw}`

  if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) {
    return '#3B82F6'
  }

  return candidate.toUpperCase()
}

async function handleSpeciesCreated() {
  await speciesStore.fetchSpecies()
}
</script>
