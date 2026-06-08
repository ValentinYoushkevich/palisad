<template>
  <section class="page-shell flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2>Структура питомника</h2>
      <Button
        v-if="authStore.canManageStructure"
        icon="pi pi-plus"
        label="Добавить участок"
        @click="openCreate(null, null)"
      />
    </div>

    <Message v-if="locationsStore.locationsError" severity="error">
      {{ locationsStore.locationsError }}
    </Message>

    <div v-if="locationsStore.isLoading" class="flex items-center justify-center py-16">
      <ProgressSpinner style="width: 36px; height: 36px" />
    </div>

    <template v-else>
      <!-- Breadcrumb -->
      <div v-if="path.length" class="flex items-center gap-1 flex-wrap">
        <button class="bc-btn" @click="goTo(-1)">Питомник</button>
        <template v-for="(step, idx) in path" :key="step.id">
          <span class="bc-sep">›</span>
          <button
            v-if="idx < path.length - 1"
            class="bc-btn"
            @click="goTo(idx)"
          >{{ step.name }}</button>
          <span v-else class="bc-current">{{ step.name }}</span>
        </template>
      </div>

      <!-- Stats -->
      <div class="flex items-center gap-4 flex-wrap">
        <div v-for="stat in currentStats" :key="stat.label" class="flex items-center gap-1.5">
          <span class="stat-dot" :style="{ background: stat.color }" />
          <span class="stat-text">{{ stat.value }} {{ stat.label }}</span>
        </div>
      </div>

      <!-- Cards grid -->
      <div class="locations-grid">
        <div
          v-for="item in currentItems"
          :key="item.id"
          class="loc-card"
          :class="item.type"
          @click="handleCardClick(item)"
        >
          <div class="loc-card__actions" v-if="authStore.canManageStructure" @click.stop>
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              severity="secondary"
              class="loc-card__btn"
              @click="openEdit(item)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              class="loc-card__btn"
              @click="handleDelete(item, $event)"
            />
          </div>
          <div class="loc-card__badge" :class="`badge--${item.type}`">
            {{ TYPE_LABELS[item.type] }}
          </div>
          <div class="loc-card__name">{{ item.name }}</div>
          <div class="loc-card__meta">{{ getCardMeta(item) }}</div>
          <div v-if="item.type !== 'place'" class="loc-card__hint">
            нажмите чтобы открыть →
          </div>
        </div>

        <!-- Add card -->
        <div
          v-if="authStore.canManageStructure"
          class="loc-card loc-card--add"
          @click="openCreate(currentParentId, currentParentType)"
        >
          <div class="loc-card__add-icon">+</div>
          <div class="loc-card__add-label">Добавить {{ ADD_LABELS[currentLevel] }}</div>
        </div>
      </div>
    </template>

    <LocationCreateDialog
      v-model:visible="createVisible"
      :parentId="createParentId"
      :parentType="createParentType"
      @created="handleCreated"
    />
    <LocationEditDialog
      v-model:visible="editVisible"
      :location="selectedLocation"
      @updated="handleReload"
    />
  </section>
</template>

<script setup>
import LocationCreateDialog from '@/pages/locations/components/LocationCreateDialog.vue'
import LocationEditDialog from '@/pages/locations/components/LocationEditDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useLocationsStore } from '@/stores/locations.store'
import { useConfirm } from 'primevue/useconfirm'
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'LocationsPage' })

const TYPE_LABELS = { area: 'Участок', section: 'Секция', row: 'Ряд', place: 'Место' }
const ADD_LABELS = { area: 'участок', section: 'секцию', row: 'ряд', place: 'место' }
const STAT_COLORS = { area: '#1D9E75', section: '#378ADD', row: '#BA7517', place: '#888780' }
const CHILD_TYPE = { area: 'section', section: 'row', row: 'place', place: null }

const authStore = useAuthStore()
const locationsStore = useLocationsStore()
const confirm = useConfirm()

const path = ref([])
const createVisible = ref(false)
const editVisible = ref(false)
const createParentId = ref(null)
const createParentType = ref(null)
const selectedLocation = ref(null)

onMounted(async () => {
  await locationsStore.fetchLocations()
})

// Текущий уровень иерархии
const currentLevel = computed(() => {
  if (!path.value.length) return 'area'
  const lastType = path.value[path.value.length - 1].type
  return CHILD_TYPE[lastType] ?? 'place'
})

// ID родителя для создания нового элемента
const currentParentId = computed(() =>
  path.value.length ? path.value[path.value.length - 1].id : null
)

// Тип родителя для создания
const currentParentType = computed(() =>
  path.value.length ? path.value[path.value.length - 1].type : null
)

// Элементы текущего уровня из flatList
const currentItems = computed(() => {
  const flat = locationsStore.flatList ?? locationsStore.locations ?? []
  if (!path.value.length) {
    return flat.filter(l => l.type === 'area')
  }
  const parentId = path.value[path.value.length - 1].id
  return flat.filter(l => l.parent_id === parentId)
})

// Статистика текущего уровня
const currentStats = computed(() => {
  const flat = locationsStore.flatList ?? locationsStore.locations ?? []
  if (!path.value.length) {
    const areas = flat.filter(l => l.type === 'area').length
    const sections = flat.filter(l => l.type === 'section').length
    const places = flat.filter(l => l.type === 'place').length
    return [
      { label: 'участков', value: areas, color: STAT_COLORS.area },
      { label: 'секций', value: sections, color: STAT_COLORS.section },
      { label: 'мест', value: places, color: STAT_COLORS.place },
    ]
  }
  return currentItems.value.map(item => ({
    label: TYPE_LABELS[item.type]?.toLowerCase(),
    value: '',
    color: STAT_COLORS[item.type],
  })).slice(0, 0)
})

function getCardMeta(item) {
  const flat = locationsStore.flatList ?? locationsStore.locations ?? []
  const children = flat.filter(l => l.parent_id === item.id)
  if (!children.length) return item.type === 'place' ? 'пусто' : 'нет дочерних элементов'
  const childType = CHILD_TYPE[item.type]
  const label = childType ? TYPE_LABELS[childType]?.toLowerCase() + 'ов' : ''
  return `${children.length} ${label || 'элементов'}`
}

function handleCardClick(item) {
  if (item.type === 'place') return
  path.value = [...path.value, { id: item.id, name: item.name, type: item.type }]
}

function goTo(idx) {
  if (idx === -1) {
    path.value = []
  } else {
    path.value = path.value.slice(0, idx + 1)
  }
}

function openCreate(parentId, parentType) {
  createParentId.value = parentId
  createParentType.value = parentType
  createVisible.value = true
}

function openEdit(location) {
  selectedLocation.value = location
  editVisible.value = true
}

function handleDelete(node, event) {
  if (node.type === 'place') {
    locationsStore.deleteLocation(node.id)
    return
  }
  confirm.require({
    target: event?.currentTarget,
    header: 'Подтверждение удаления',
    message: `Удалить ${TYPE_LABELS[node.type]?.toLowerCase()} «${node.name}»?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Удалить',
    rejectLabel: 'Отмена',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await locationsStore.deleteLocation(node.id)
    },
  })
}

async function handleCreated() {
  await locationsStore.fetchLocations()
}

async function handleReload() {
  await locationsStore.fetchLocations()
}
</script>

<style lang="scss" scoped>
.bc-btn {
  font-size: 13px;
  font-weight: 500;
  color: var(--p-teal-600, #0F6E56);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
}
.bc-sep {
  font-size: 11px;
  color: var(--p-text-muted-color);
}
.bc-current {
  font-size: 13px;
  font-weight: 500;
  color: var(--p-text-color);
}
.stat-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.stat-text {
  font-size: 12px;
  color: var(--p-text-muted-color);
}

.locations-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
}

.loc-card {
  position: relative;
  background: var(--p-surface-card, var(--p-surface-0));
  border: 0.5px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-lg, 12px);
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.15s;
  min-height: 100px;

  &:hover {
    border-color: var(--p-teal-400, #1D9E75);
  }

  &.place {
    cursor: default;
    &:hover { border-color: var(--p-surface-border); }
  }

  &.area    { border-top: 3px solid #1D9E75; }
  &.section { border-top: 3px solid #378ADD; }
  &.row     { border-top: 3px solid #BA7517; }
  &.place   { border-top: 3px solid #888780; }

  &__actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  &:hover &__actions { opacity: 1; }

  &__btn {
    width: 26px !important;
    height: 26px !important;
    padding: 0 !important;
  }

  &__badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 10px;
    margin-bottom: 8px;
  }

  &__name {
    font-size: 14px;
    font-weight: 500;
    color: var(--p-text-color);
    margin-bottom: 4px;
    padding-right: 56px;
  }

  &__meta {
    font-size: 12px;
    color: var(--p-text-muted-color);
  }

  &__hint {
    font-size: 11px;
    color: var(--p-text-muted-color);
    margin-top: 8px;
    opacity: 0.6;
  }

  &--add {
    border: 1.5px dashed var(--p-surface-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    background: transparent;

    &:hover {
      border-color: #1D9E75;
      background: #E1F5EE;
    }
  }

  &__add-icon {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #E1F5EE;
    color: #0F6E56;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-height: 1;
  }

  &:hover &__add-icon {
    background: #9FE1CB;
  }

  &__add-label {
    font-size: 12px;
    color: var(--p-text-muted-color);
  }

  &--add:hover &__add-label {
    color: #085041;
  }
}

.badge--area    { background: #E1F5EE; color: #085041; }
.badge--section { background: #E6F1FB; color: #0C447C; }
.badge--row     { background: #FAEEDA; color: #633806; }
.badge--place   { background: #F1EFE8; color: #444441; }
</style>
