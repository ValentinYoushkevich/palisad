<template>
  <section class="page-shell flex flex-col gap-4">
    <h2>Сессия инвентаризации</h2>

    <Message v-if="!isOnline" :closable="false" severity="warn">
      Просмотр сессии доступен только онлайн
    </Message>

    <template v-else>
      <Message v-if="store.error" :closable="false" severity="error">
        {{ store.error }}
      </Message>

      <div v-if="store.loading" class="session__loading">
        <ProgressSpinner class="session__spinner" />
      </div>

      <template v-else-if="detail">
        <!-- Шапка: зона, период, сводка. -->
        <div class="rounded-xl bg-white p-4">
          <div class="session__head">
            <div>
              <div class="session__zone">{{ detail.locationName }}</div>
              <div class="session__period">
                {{ formatDateTime(detail.startedAt) }} — {{ formatDateTime(detail.completedAt) }}
              </div>
            </div>
            <a class="session__pdf" :href="actHref">Скачать акт (PDF)</a>
          </div>

          <div class="session__counts">
            <div class="session__count"><span>Совпало</span><strong>{{ detail.counts?.matched ?? 0 }}</strong></div>
            <div class="session__count"><span>Не найдено</span><strong>{{ detail.counts?.missing ?? 0 }}</strong></div>
            <div class="session__count"><span>Чужие</span><strong>{{ detail.counts?.foreign ?? 0 }}</strong></div>
            <div class="session__count"><span>Неизвестные</span><strong>{{ detail.counts?.unknown ?? 0 }}</strong></div>
          </div>
        </div>

        <!-- Не найдено (missing): списание. -->
        <div class="rounded-xl bg-white p-4">
          <h3 class="session__section-title">Не найдено ({{ missingItems.length }})</h3>

          <DataTable :value="missingItems" dataKey="id" size="small" stripedRows>
            <template #empty>
              <div class="py-4 text-center text-sm text-slate-500">Нет позиций</div>
            </template>
            <Column header="Код">
              <template #body="{ data }">{{ codeOf(data) }}</template>
            </Column>
            <Column header="Вид">
              <template #body="{ data }">{{ speciesOf(data) }}</template>
            </Column>
            <Column field="stageName" header="Стадия" />
            <Column field="currentLocationName" header="Локация" />
            <Column style="width: 8rem">
              <template #body="{ data }">
                <Tag v-if="data.appliedMovementId" severity="danger" value="списано" />
                <Checkbox
                  v-else-if="canApply"
                  v-model="missingSelected[data.plantId]"
                  binary
                />
                <span v-else>—</span>
              </template>
            </Column>
          </DataTable>

          <div v-if="canApply" class="session__apply">
            <Select
              v-model="writeOffTypeId"
              aria-label="Тип списания"
              class="session__type"
              :options="store.writeOffTypes"
              optionLabel="name"
              optionValue="id"
              placeholder="Тип списания"
            />
            <Button
              :disabled="!selectedMissingPlantIds.length"
              label="Списать выбранные"
              :loading="applying"
              severity="danger"
              @click="applyWriteOff"
            />
          </div>
        </div>

        <!-- Чужие (foreign): перемещение в зону. -->
        <div class="rounded-xl bg-white p-4">
          <h3 class="session__section-title">Чужие ({{ foreignItems.length }})</h3>

          <DataTable :value="foreignItems" dataKey="id" size="small" stripedRows>
            <template #empty>
              <div class="py-4 text-center text-sm text-slate-500">Нет позиций</div>
            </template>
            <Column header="Код">
              <template #body="{ data }">{{ codeOf(data) }}</template>
            </Column>
            <Column header="Вид">
              <template #body="{ data }">{{ speciesOf(data) }}</template>
            </Column>
            <Column field="currentLocationName" header="Где числится" />
            <Column style="width: 8rem">
              <template #body="{ data }">
                <Tag v-if="data.appliedMovementId" severity="info" value="перемещено" />
                <Checkbox
                  v-else-if="canApply"
                  v-model="foreignSelected[data.plantId]"
                  binary
                />
                <span v-else>—</span>
              </template>
            </Column>
          </DataTable>

          <div v-if="canApply" class="session__apply">
            <Button
              :disabled="!selectedForeignPlantIds.length"
              label="Переместить выбранных сюда"
              :loading="applying"
              @click="applyTransfer"
            />
          </div>
        </div>

        <!-- Неизвестные (unknown): только для акта, без действий. -->
        <div class="rounded-xl bg-white p-4">
          <h3 class="session__section-title">Неизвестные ({{ unknownItems.length }})</h3>

          <DataTable :value="unknownItems" dataKey="id" size="small" stripedRows>
            <template #empty>
              <div class="py-4 text-center text-sm text-slate-500">Нет позиций</div>
            </template>
            <Column field="rawCode" header="Сырой код" />
            <Column header="Отсканировано">
              <template #body="{ data }">{{ formatDateTime(data.scannedAt) }}</template>
            </Column>
          </DataTable>
        </div>
      </template>

      <Message v-else :closable="false" severity="info">
        Сессия не найдена.
      </Message>
    </template>
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useAuthStore } from '@/stores/auth.store'
import { useInventoryStore } from '@/stores/inventory.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

defineOptions({ name: 'InventorySessionPage' })

// Русские подписи причин пропуска при применении (контракт бэкенда).
const SKIP_LABELS = {
  not_in_session: 'не в сессии',
  already_applied: 'уже применено',
  plant_deleted: 'растение удалено',
  status_changed: 'статус изменился',
  already_here: 'уже здесь'
}

const store = useInventoryStore()
const nurseryStore = useNurseryStore()
const authStore = useAuthStore()
const movementTypesStore = useMovementTypesStore()
const route = useRoute()
const toast = useToast()
const { isOnline } = useOnlineStatus()

const sessionId = route.params.id

const writeOffTypeId = ref(null)
const applying = ref(false)
const missingSelected = ref({})
const foreignSelected = ref({})

const detail = computed(() => store.currentDetail)
const missingItems = computed(() => detail.value?.items?.missing ?? [])
const foreignItems = computed(() => detail.value?.items?.foreign ?? [])
const unknownItems = computed(() => detail.value?.items?.unknown ?? [])

const canApply = computed(() => authStore.canManageStructure && isOnline.value)

const actHref = computed(
  () => `/api/nurseries/${nurseryStore.nurseryId}/inventory-sessions/${sessionId}/act`
)

const selectedMissingPlantIds = computed(() => selectedIds(missingSelected.value))
const selectedForeignPlantIds = computed(() => selectedIds(foreignSelected.value))

function selectedIds(map) {
  return Object.keys(map).filter((key) => map[key])
}

function codeOf(item) {
  return item.qrCode || item.numericCode || '—'
}

function speciesOf(item) {
  return item.speciesName || item.scientificName || '—'
}

function formatDateTime(value) {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString('ru-RU')
}

async function applyWriteOff() {
  const plantIds = selectedMissingPlantIds.value
  if (!plantIds.length) {
    return
  }
  if (!writeOffTypeId.value) {
    toast.add({ severity: 'warn', summary: 'Выберите тип списания', life: 3000 })
    return
  }

  applying.value = true
  const result = await store.applySession(sessionId, {
    writeOff: { plantIds, movementTypeId: writeOffTypeId.value },
    transfer: { plantIds: [] }
  })
  applying.value = false
  handleApplyResult(result)
}

async function applyTransfer() {
  const plantIds = selectedForeignPlantIds.value
  if (!plantIds.length) {
    return
  }

  applying.value = true
  const result = await store.applySession(sessionId, {
    writeOff: { plantIds: [], movementTypeId: null },
    transfer: { plantIds }
  })
  applying.value = false
  handleApplyResult(result)
}

function handleApplyResult(result) {
  if (!result.ok) {
    if (!result.offline) {
      toast.add({ severity: 'error', summary: 'Не удалось применить', detail: result.error, life: 5000 })
    }
    return
  }

  const { applied, skipped } = result.result
  toast.add({
    severity: 'success',
    summary: 'Применено',
    detail: `Списано: ${applied?.writtenOff ?? 0}, перемещено: ${applied?.transferred ?? 0}`,
    life: 4000
  })

  if (skipped?.length) {
    toast.add({
      severity: 'warn',
      summary: `Пропущено: ${skipped.length}`,
      detail: summarizeSkipped(skipped),
      life: 6000
    })
  }

  // Стор уже перечитал detail — сбрасываем выбор (применённые строки теперь с тегом).
  missingSelected.value = {}
  foreignSelected.value = {}
}

function summarizeSkipped(skipped) {
  const counts = {}
  for (const item of skipped) {
    counts[item.reason] = (counts[item.reason] || 0) + 1
  }
  return Object.entries(counts)
    .map(([reason, count]) => `${SKIP_LABELS[reason] || reason}: ${count}`)
    .join('; ')
}

onMounted(async () => {
  if (!isOnline.value) {
    return
  }
  await Promise.all([
    store.fetchSessionDetail(sessionId),
    movementTypesStore.fetchMovementTypes()
  ])
  await store.loadWriteOffTypes()
})
</script>

<style lang="scss" scoped>
.session__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.session__zone {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.session__period {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}

.session__pdf {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: 6px;
  background: #047857;
  color: #ffffff;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.session__section-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.session__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.session__count {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 96px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #f3f4f6;
}

.session__count span {
  font-size: 12px;
  color: #6b7280;
}

.session__count strong {
  font-size: 20px;
  color: #111827;
}

.session__apply {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.session__type {
  min-width: 220px;
}

.session__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.session__spinner {
  width: 40px;
  height: 40px;
}
</style>
