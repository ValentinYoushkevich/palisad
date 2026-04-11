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
          <Column v-if="authStore.canManageStructure" header="Действия">
            <template #body="{ data }">
              <Button icon="pi pi-pencil" text @click="openEditContainerType(data)" />
            </template>
          </Column>
        </template>
      </DataTable>
    </div>
    <SpeciesSearchDialog v-model:visible="speciesDialogVisible" @created="handleSpeciesCreated" />

    <Dialog v-model:visible="tagDialogVisible" :header="tagDialogTitle" class="catalog-dictionary-dialog" modal style="width: 460px">
      <div class="space-y-3">
        <Message v-if="tagsStore.tagsError" severity="error">{{ tagsStore.tagsError }}</Message>
        <div class="space-y-1">
          <label for="tagName">Название</label>
          <InputText id="tagName" v-model="tagForm.name" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="tagColor">Цвет (HEX)</label>
          <div class="flex items-center gap-3">
            <ColorPicker id="tagColor" v-model="tagColorValue" format="hex" />
            <InputText :modelValue="normalizeHexColor(tagForm.color)" class="w-full" readonly />
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox v-model="tagForm.is_active" inputId="tagActive" binary />
          <label for="tagActive">Активен</label>
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text @click="closeTagDialog" />
        <Button :label="tagSaveLabel" :loading="tagsStore.isLoading" @click="handleSaveTag" />
      </template>
    </Dialog>

    <Dialog v-model:visible="movementDialogVisible" :header="movementDialogTitle" class="catalog-dictionary-dialog" modal style="width: 520px">
      <div class="space-y-3">
        <Message v-if="movementDialogError" severity="error">{{ movementDialogError }}</Message>
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
          <Select id="movementStatus" v-model="movementStatusValue" :options="movementStatusOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox v-model="movementForm.is_active" inputId="movementActive" binary />
          <label for="movementActive">Активен</label>
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text @click="closeMovementDialog" />
        <Button :label="movementSaveLabel" :loading="movementTypesStore.isLoading" @click="handleSaveMovementType" />
      </template>
    </Dialog>

    <Dialog v-model:visible="containerDialogVisible" :header="containerDialogTitle" class="catalog-dictionary-dialog" modal style="width: 560px">
      <div class="grid gap-3 md:grid-cols-2">
        <div class="md:col-span-2"><Message v-if="containerTypesStore.containerTypesError" severity="error">{{ containerTypesStore.containerTypesError }}</Message></div>
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
          <Select id="containerKind" v-model="containerForm.container_kind" :options="CONTAINER_KIND_OPTIONS" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <div class="space-y-1">
          <label for="containerVolume">Объём (л)</label>
          <InputNumber id="containerVolume" v-model="containerForm.volume_liters" class="w-full" :min="0" :useGrouping="false" />
        </div>
        <div class="space-y-1">
          <label for="containerSide">Сторона (см)</label>
          <InputNumber id="containerSide" v-model="containerForm.side_cm" class="w-full" :min="0" :useGrouping="false" />
        </div>
        <div class="mt-7 flex items-center gap-2 text-sm text-slate-700">
          <Checkbox v-model="containerForm.is_active" inputId="containerActive" binary />
          <label for="containerActive">Активен</label>
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text @click="closeContainerDialog" />
        <Button :label="containerSaveLabel" :loading="containerTypesStore.isLoading" @click="handleSaveContainerType" />
      </template>
    </Dialog>
  </section>
</template>

<script setup>
import '@/pages/catalog/catalog-cards.scss'
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
  normalizeHexColor,
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
const movementDialogError = ref('')

const containerDialogVisible = ref(false)
const containerEditingId = ref(null)
const containerForm = ref(defaultContainerForm())

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
const movementStatusValue = computed({
  get: () => movementForm.value.sets_status ?? '__none__',
  set: (value) => {
    movementForm.value.sets_status = value === '__none__' ? null : value
  }
})
const movementStatusOptions = [{ label: 'Не меняет', value: '__none__' }, ...STATUS_OPTIONS]
const tagColorValue = computed({
  get: () => normalizeHexColor(tagForm.value.color).replace('#', ''),
  set: (value) => {
    tagForm.value.color = normalizeHexColor(`#${String(value || '').replace('#', '')}`)
  }
})
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
  tagsStore.tagsError = ''
  tagDialogVisible.value = true
}
function openEditTag(item) {
  tagEditingId.value = item.id
  tagForm.value = {
    name: item.name || '',
    color: item.color || '#3B82F6',
    is_active: Boolean(item.is_active)
  }
  tagsStore.tagsError = ''
  tagDialogVisible.value = true
}

async function handleSaveTag() {
  if (!tagForm.value.name?.trim()) {
    return
  }
  const payload = {
    name: tagForm.value.name.trim(),
    color: normalizeHexColor(tagForm.value.color),
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
  movementDialogError.value = ''
  movementTypesStore.movementTypesError = ''
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
  movementDialogError.value = ''
  movementTypesStore.movementTypesError = ''
  movementDialogVisible.value = true
}

async function handleSaveMovementType() {
  movementDialogError.value = ''
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
    movementDialogError.value = result?.error || movementTypesStore.movementTypesError || 'Не удалось сохранить тип движения.'
    return
  }
  movementTypesStore.movementTypesError = ''
  movementDialogVisible.value = false
  await movementTypesStore.fetchMovementTypes()
}

function closeMovementDialog() {
  movementDialogVisible.value = false
  movementDialogError.value = ''
  movementTypesStore.movementTypesError = ''
}
function closeTagDialog() { tagDialogVisible.value = false; tagsStore.tagsError = '' }
function closeContainerDialog() { containerDialogVisible.value = false; containerTypesStore.containerTypesError = '' }

function openCreateContainerType() {
  containerEditingId.value = null
  containerForm.value = defaultContainerForm()
  containerTypesStore.containerTypesError = ''
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
  containerTypesStore.containerTypesError = ''
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

async function handleSpeciesCreated() {
  await speciesStore.fetchSpecies()
}
</script>
