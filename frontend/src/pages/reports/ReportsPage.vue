<template>
  <section class="page-shell reports flex flex-col gap-4">
    <h2>Отчёты</h2>

    <!-- Отчёты доступны только онлайн: ничего не кэшируем, при офлайне — заглушка. -->
    <Message v-if="!isOnline" :closable="false" severity="warn">
      Отчёты доступны только онлайн
    </Message>

    <template v-else>
      <!-- Общий фильтр периода для всех вкладок. -->
      <div class="reports__filters rounded-xl bg-white p-4">
        <label class="reports__field">
          <span>Период с</span>
          <DatePicker v-model="dateFrom" dateFormat="yy-mm-dd" showIcon />
        </label>
        <label class="reports__field">
          <span>по</span>
          <DatePicker v-model="dateTo" dateFormat="yy-mm-dd" showIcon />
        </label>
      </div>

      <Tabs v-model:value="activeTab">
        <TabList>
          <Tab value="writeOffs">Отпад</Tab>
          <Tab value="stockFlow">Движение остатков</Tab>
          <Tab value="laborCost">Себестоимость (нормо-часы)</Tab>
        </TabList>

        <TabPanels>
          <!-- Отпад -->
          <TabPanel value="writeOffs">
            <div class="reports__panel">
              <div class="reports__controls">
                <label class="reports__field">
                  <span>Группировка</span>
                  <Select
                    v-model="writeOffsGroupBy"
                    optionLabel="label"
                    optionValue="value"
                    :options="WRITE_OFFS_GROUPS"
                  />
                </label>
                <Button
                  label="Показать"
                  :loading="reportsStore.writeOffs.loading"
                  @click="applyWriteOffs"
                />
                <a class="reports__csv" :href="writeOffsCsvHref">Скачать CSV</a>
              </div>

              <Message v-if="reportsStore.writeOffs.error" :closable="false" severity="error">
                {{ reportsStore.writeOffs.error }}
              </Message>

              <div v-if="reportsStore.writeOffs.loading" class="reports__loading">
                <ProgressSpinner class="reports__spinner" />
              </div>

              <template v-else-if="writeOffsData">
                <div class="reports__summary">
                  <span>Всего списано: <strong>{{ writeOffsData.totalWrittenOff }}</strong></span>
                  <span>Остаток на начало: <strong>{{ writeOffsData.openingCount }}</strong></span>
                  <span>Доля отпада: <strong>{{ formatPercent(writeOffsData.rate) }}</strong></span>
                </div>

                <DataTable :value="writeOffsData.rows" size="small" stripedRows>
                  <Column field="label" header="Группа" />
                  <Column field="count" header="Списано" />
                  <Column header="Доля">
                    <template #body="{ data }">{{ formatPercent(data.share) }}</template>
                  </Column>
                </DataTable>

                <ReportBarChart :rows="writeOffsData.rows" metric="count" metricLabel="Списано" />
              </template>
            </div>
          </TabPanel>

          <!-- Движение остатков -->
          <TabPanel value="stockFlow">
            <div class="reports__panel">
              <div class="reports__controls">
                <label class="reports__field">
                  <span>Группировка</span>
                  <Select
                    v-model="stockFlowGroupBy"
                    optionLabel="label"
                    optionValue="value"
                    :options="STOCK_FLOW_GROUPS"
                  />
                </label>
                <Button
                  label="Показать"
                  :loading="reportsStore.stockFlow.loading"
                  @click="applyStockFlow"
                />
                <a class="reports__csv" :href="stockFlowCsvHref">Скачать CSV</a>
              </div>

              <Message v-if="reportsStore.stockFlow.error" :closable="false" severity="error">
                {{ reportsStore.stockFlow.error }}
              </Message>

              <div v-if="reportsStore.stockFlow.loading" class="reports__loading">
                <ProgressSpinner class="reports__spinner" />
              </div>

              <template v-else-if="stockFlowData">
                <DataTable :value="stockFlowData.rows" size="small" stripedRows>
                  <Column field="label" header="Группа">
                    <template #footer>Итого</template>
                  </Column>
                  <Column field="opening" header="Начало">
                    <template #footer>{{ stockFlowData.totals.opening }}</template>
                  </Column>
                  <Column field="inflow" header="Приход">
                    <template #footer>{{ stockFlowData.totals.inflow }}</template>
                  </Column>
                  <Column field="sold" header="Продано">
                    <template #footer>{{ stockFlowData.totals.sold }}</template>
                  </Column>
                  <Column field="writtenOff" header="Списано">
                    <template #footer>{{ stockFlowData.totals.writtenOff }}</template>
                  </Column>
                  <Column field="transfersNet" header="Перемещения">
                    <template #footer>{{ stockFlowData.totals.transfersNet }}</template>
                  </Column>
                  <Column field="closing" header="Конец">
                    <template #footer>{{ stockFlowData.totals.closing }}</template>
                  </Column>
                </DataTable>

                <ReportBarChart :rows="stockFlowData.rows" metric="closing" metricLabel="Остаток на конец" />
              </template>
            </div>
          </TabPanel>

          <!-- Себестоимость (нормо-часы) -->
          <TabPanel value="laborCost">
            <div class="reports__panel">
              <div class="reports__controls">
                <label class="reports__field">
                  <span>Группировка</span>
                  <Select
                    v-model="laborCostGroupBy"
                    optionLabel="label"
                    optionValue="value"
                    :options="LABOR_COST_GROUPS"
                  />
                </label>
                <Button
                  label="Показать"
                  :loading="reportsStore.laborCost.loading"
                  @click="applyLaborCost"
                />
                <a class="reports__csv" :href="laborCostCsvHref">Скачать CSV</a>
              </div>

              <Message v-if="reportsStore.laborCost.error" :closable="false" severity="error">
                {{ reportsStore.laborCost.error }}
              </Message>

              <div v-if="reportsStore.laborCost.loading" class="reports__loading">
                <ProgressSpinner class="reports__spinner" />
              </div>

              <template v-else-if="laborCostData">
                <div class="reports__summary">
                  <span>Всего нормо-минут: <strong>{{ laborCostData.totalMinutes }}</strong></span>
                  <span>В часах: <strong>{{ formatHours(laborCostData.totalMinutes) }}</strong></span>
                  <span>Операций: <strong>{{ laborCostData.operationsCount }}</strong></span>
                  <span>Без нормы: <strong>{{ laborCostData.operationsWithoutNorm }}</strong></span>
                </div>

                <DataTable :value="laborCostData.rows" size="small" stripedRows>
                  <Column field="label" header="Группа" />
                  <Column field="minutes" header="Нормо-минуты" />
                  <Column field="operations" header="Операций" />
                  <Column field="plants" header="Растений" />
                  <Column field="minutesPerPlant" header="Минут на растение" />
                </DataTable>

                <ReportBarChart :rows="laborCostData.rows" metric="minutes" metricLabel="Нормо-минуты" />
              </template>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </template>
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import ReportBarChart from '@/pages/reports/components/ReportBarChart.vue'
import { useNurseryStore } from '@/stores/nursery.store'
import { useReportsStore } from '@/stores/reports.store'
import { computed, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'ReportsPage' })

// Допустимые группировки по каждому отчёту (совпадают с бэкенд-контрактом).
const WRITE_OFFS_GROUPS = [
  { label: 'Месяц', value: 'month' },
  { label: 'Локация', value: 'location' },
  { label: 'Вид', value: 'species' },
  { label: 'Стадия', value: 'stage' },
  { label: 'Тип движения', value: 'movementType' }
]
const STOCK_FLOW_GROUPS = [
  { label: 'Вид', value: 'species' },
  { label: 'Локация', value: 'location' },
  { label: 'Стадия', value: 'stage' }
]
const LABOR_COST_GROUPS = [
  { label: 'Вид', value: 'species' },
  { label: 'Стадия', value: 'stage' }
]

const reportsStore = useReportsStore()
const nurseryStore = useNurseryStore()
const { isOnline } = useOnlineStatus()

const activeTab = ref('writeOffs')

const dateFrom = ref(new Date(new Date().getFullYear(), 0, 1))
const dateTo = ref(new Date())

const writeOffsGroupBy = ref('month')
const stockFlowGroupBy = ref('species')
const laborCostGroupBy = ref('species')

const writeOffsData = computed(() => reportsStore.writeOffs.data)
const stockFlowData = computed(() => reportsStore.stockFlow.data)
const laborCostData = computed(() => reportsStore.laborCost.data)

// DatePicker хранит Date; бэкенд ждёт ISO-дату YYYY-MM-DD.
function toIsoDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return ''
  }
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentParams(groupBy) {
  return {
    dateFrom: toIsoDate(dateFrom.value),
    dateTo: toIsoDate(dateTo.value),
    groupBy
  }
}

function applyWriteOffs() {
  return reportsStore.fetchWriteOffs(currentParams(writeOffsGroupBy.value))
}

function applyStockFlow() {
  return reportsStore.fetchStockFlow(currentParams(stockFlowGroupBy.value))
}

function applyLaborCost() {
  return reportsStore.fetchLaborCost(currentParams(laborCostGroupBy.value))
}

// CSV качаем прямой ссылкой (не через axios): браузер сам стримит файл, httpOnly-кука
// уходит на обычном same-origin GET. format=csv + текущие параметры фильтра.
function buildCsvHref(report, groupBy) {
  const query = new URLSearchParams({
    dateFrom: toIsoDate(dateFrom.value),
    dateTo: toIsoDate(dateTo.value),
    groupBy,
    format: 'csv'
  })
  return `/api/nurseries/${nurseryStore.nurseryId}/reports/${report}?${query.toString()}`
}

const writeOffsCsvHref = computed(() => buildCsvHref('write-offs', writeOffsGroupBy.value))
const stockFlowCsvHref = computed(() => buildCsvHref('stock-flow', stockFlowGroupBy.value))
const laborCostCsvHref = computed(() => buildCsvHref('labor-cost', laborCostGroupBy.value))

// share/rate приходят долями (0..1), показываем процентами.
function formatPercent(value) {
  const number = Number(value)
  if (Number.isNaN(number)) {
    return '—'
  }
  return `${(number * 100).toFixed(1)}%`
}

function formatHours(minutes) {
  const number = Number(minutes)
  if (Number.isNaN(number)) {
    return '—'
  }
  return (number / 60).toFixed(1)
}

// Ленивая подгрузка активной вкладки: тянем данные, только если их ещё нет.
function loadActive(tab) {
  if (!isOnline.value) {
    return
  }
  if (tab === 'writeOffs' && !writeOffsData.value) {
    applyWriteOffs()
  } else if (tab === 'stockFlow' && !stockFlowData.value) {
    applyStockFlow()
  } else if (tab === 'laborCost' && !laborCostData.value) {
    applyLaborCost()
  }
}

watch(activeTab, (tab) => {
  loadActive(tab)
})

onMounted(() => {
  loadActive(activeTab.value)
})
</script>

<style lang="scss" scoped>
.reports__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}

.reports__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #374151;
}

.reports__panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 12px;
}

.reports__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.reports__csv {
  color: #047857;
  font-weight: 600;
  text-decoration: underline;
  align-self: center;
}

.reports__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 14px;
  color: #374151;
}

.reports__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.reports__spinner {
  width: 40px;
  height: 40px;
}
</style>
