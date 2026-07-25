<template>
  <section class="page-shell prices flex flex-col gap-4">
    <h2>Прайс</h2>

    <!-- Прайс read/write, но только онлайн: ничего не кэшируем, при офлайне — заглушка. -->
    <Message v-if="!isOnline" :closable="false" severity="warn">
      Прайс доступен только онлайн
    </Message>

    <template v-else>
      <!-- Выгрузки CSV. Экспорт гейтится планом (feature_export) на сервере — здесь дизейблим
           кнопки и показываем подсказку, если фичи нет. -->
      <div class="prices__exports rounded-xl bg-white p-4">
        <h3 class="prices__section-title">Выгрузки</h3>

        <Message v-if="!exportsEnabled" :closable="false" severity="warn">
          Экспорт доступен на платном тарифе.
        </Message>

        <div class="prices__export-grid">
          <div class="prices__export">
            <label class="prices__export-controls" for="includeUnpriced">
              <span class="prices__label">Показать позиции без цены</span>
              <ToggleSwitch v-model="includeUnpriced" inputId="includeUnpriced" />
            </label>
            <a
              class="prices__csv"
              :class="{ 'prices__csv--disabled': !exportsEnabled }"
              :href="priceListHref"
              :aria-disabled="!exportsEnabled"
              @click="onExportClick"
            >
              Скачать прайс (CSV)
            </a>
          </div>

          <div class="prices__export">
            <label class="prices__export-controls">
              <span class="prices__label">Группировка остатков</span>
              <Select
                v-model="stockGroupBy"
                optionLabel="label"
                optionValue="value"
                :options="STOCK_GROUPS"
              />
            </label>
            <a
              class="prices__csv"
              :class="{ 'prices__csv--disabled': !exportsEnabled }"
              :href="stockHref"
              :aria-disabled="!exportsEnabled"
              @click="onExportClick"
            >
              Экспорт остатков (CSV)
            </a>
          </div>
        </div>
      </div>

      <!-- Матрица цен: строки — виды питомника, колонки — активные типы контейнеров,
           ячейка — inline-ввод цены. Пусто = позиции нет в прайсе. Коммит по blur/enter:
           значение → upsert, очистка ранее заполненной ячейки → delete. -->
      <div class="prices__matrix rounded-xl bg-white p-4">
        <div class="prices__matrix-head">
          <h3 class="prices__section-title">Цены (вид × контейнер)</h3>
          <span class="prices__hint">Цены в BYN</span>
        </div>

        <Message v-if="pricesStore.error" :closable="false" severity="error">
          {{ pricesStore.error }}
        </Message>

        <div v-if="pricesStore.loading" class="prices__loading">
          <ProgressSpinner class="prices__spinner" />
        </div>

        <Message v-else-if="!speciesList.length" :closable="false" severity="info">
          Сначала добавьте виды в справочнике.
        </Message>

        <Message v-else-if="!containerList.length" :closable="false" severity="info">
          Сначала добавьте типы контейнеров в справочнике.
        </Message>

        <DataTable
          v-else
          :value="speciesList"
          dataKey="id"
          scrollable
          size="small"
          stripedRows
        >
          <Column class="prices__species-col" field="name" frozen header="Вид" style="min-width: 220px">
            <template #body="{ data }">
              <div class="prices__species">
                <span class="prices__species-name">{{ speciesLabel(data) }}</span>
                <span v-if="data.scientific_name" class="prices__species-latin">{{ data.scientific_name }}</span>
              </div>
            </template>
          </Column>

          <Column
            v-for="container in containerList"
            :key="container.id"
            :header="containerHeader(container)"
            style="min-width: 150px"
          >
            <template #body="{ data }">
              <InputNumber
                v-model="draft[cellKey(data.id, container.id)]"
                class="prices__cell"
                :max="MAX_PRICE"
                :maxFractionDigits="2"
                :min="0"
                :minFractionDigits="2"
                mode="decimal"
                placeholder="—"
                @blur="commitCell(data, container)"
                @keyup.enter="commitOnEnter"
              />
            </template>
          </Column>
        </DataTable>
      </div>
    </template>
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { usePricesStore } from '@/stores/prices.store'
import { useSpeciesStore } from '@/stores/species.store'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'PricesPage' })

// Верхняя граница совпадает с NUMERIC(10,2) бэкенда — защита от опечаток.
const MAX_PRICE = 99999999.99

const STOCK_GROUPS = [
  { label: 'По виду', value: 'species' },
  { label: 'По локации', value: 'location' }
]

const pricesStore = usePricesStore()
const speciesStore = useSpeciesStore()
const containerTypesStore = useContainerTypesStore()
const nurseryStore = useNurseryStore()
const toast = useToast()
const { isOnline } = useOnlineStatus()

const includeUnpriced = ref(false)
const stockGroupBy = ref('species')

// Черновик матрицы: cellKey → число|null. Держим отдельно от стора, чтобы InputNumber имел
// стабильную реактивную привязку; синхронизируем из стора при любом изменении данных.
// ref({}) даёт глубоко реактивный объект (в шаблоне авто-разворачивается до .value).
const draft = ref({})

const speciesList = computed(() => speciesStore.activeSpecies)
const containerList = computed(() => containerTypesStore.activeTypes)

const exportsEnabled = computed(() => nurseryStore.hasFeature('feature_export'))

// Ссылки-скачивания: при отсутствии фичи экспорта отдаём undefined — <a> без href
// перестаёт быть переходом (плюс onExportClick гасит клик и стили --disabled).
const priceListHref = computed(() => {
  if (!exportsEnabled.value) {
    return undefined
  }
  return `/api/nurseries/${nurseryStore.nurseryId}/exports/price-list?includeUnpriced=${includeUnpriced.value}&format=csv`
})
const stockHref = computed(() => {
  if (!exportsEnabled.value) {
    return undefined
  }
  return `/api/nurseries/${nurseryStore.nurseryId}/exports/stock?groupBy=${stockGroupBy.value}&format=csv`
})

// Индекс цен по паре (вид, контейнер): cellKey → { id, price:number }.
const priceIndex = computed(() => {
  const map = {}
  for (const row of pricesStore.prices) {
    map[cellKey(row.nurserySpeciesId, row.containerTypeId)] = {
      id: row.id,
      price: Number(row.price)
    }
  }
  return map
})

function cellKey(speciesId, containerId) {
  return `${speciesId}::${containerId}`
}

function speciesLabel(species) {
  return species.display_name_ru || species.scientific_name || 'Без названия'
}

function containerHeader(container) {
  return container.code ? `${container.name} (${container.code})` : container.name
}

// Перестраиваем черновик из стора при изменении цен/видов/контейнеров, чтобы ячейки всегда
// отражали серверное состояние (в т.ч. после upsert/delete).
watch(
  [() => pricesStore.prices, speciesList, containerList],
  () => {
    for (const species of speciesList.value) {
      for (const container of containerList.value) {
        const key = cellKey(species.id, container.id)
        draft.value[key] = priceIndex.value[key]?.price ?? null
      }
    }
  },
  { immediate: true, deep: true }
)

// Коммит ячейки по blur/enter: сравниваем с серверным значением, шлём upsert/delete.
async function commitCell(species, container) {
  const key = cellKey(species.id, container.id)
  const existing = priceIndex.value[key]
  const raw = draft.value[key]
  const value = raw === null || raw === undefined || raw === '' ? null : Number(raw)

  const existingPrice = existing ? existing.price : null

  // Нет изменений — ничего не делаем.
  if (value === existingPrice) {
    return
  }

  // Очистка ранее заполненной ячейки → удаляем позицию из прайса.
  if (value === null) {
    if (!existing) {
      return
    }
    const result = await pricesStore.deletePrice(existing.id)
    if (result.ok) {
      toast.add({ severity: 'success', summary: 'Позиция убрана из прайса', life: 2500 })
    } else if (!result.offline) {
      draft.value[key] = existingPrice
      toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: result.error, life: 5000 })
    }
    return
  }

  const result = await pricesStore.upsertPrice({
    speciesId: species.id,
    containerId: container.id,
    price: value
  })
  if (result.ok) {
    toast.add({ severity: 'success', summary: 'Цена сохранена', life: 2500 })
  } else if (!result.offline) {
    // Откатываем ячейку к серверному значению при ошибке валидации/сети.
    draft.value[key] = existingPrice
    toast.add({ severity: 'error', summary: 'Не удалось сохранить', detail: result.error, life: 5000 })
  }
}

// Enter в ячейке — снимаем фокус, коммит уедет через общий @blur (единый путь сохранения).
function commitOnEnter(event) {
  event.target.blur()
}

function onExportClick(event) {
  if (!exportsEnabled.value) {
    event.preventDefault()
  }
}

onMounted(async () => {
  if (!isOnline.value) {
    return
  }
  await Promise.all([
    speciesStore.fetchSpecies(),
    containerTypesStore.fetchContainerTypes(),
    pricesStore.fetchPrices()
  ])
})
</script>

<style lang="scss" scoped>
.prices__section-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.prices__export-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.prices__export {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prices__export-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.prices__label {
  font-size: 13px;
  color: #374151;
}

.prices__csv {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 6px;
  background: #047857;
  color: #ffffff;
  font-weight: 600;
  text-decoration: none;
}

.prices__csv--disabled {
  background: #d1d5db;
  color: #6b7280;
  cursor: not-allowed;
  pointer-events: auto;
}

.prices__matrix-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.prices__hint {
  font-size: 13px;
  color: #6b7280;
}

.prices__species {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prices__species-name {
  font-weight: 600;
  color: #111827;
}

.prices__species-latin {
  font-size: 12px;
  color: #6b7280;
}

.prices__cell {
  width: 100%;
}

.prices__cell :deep(input) {
  width: 100%;
}

.prices__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.prices__spinner {
  width: 40px;
  height: 40px;
}
</style>
