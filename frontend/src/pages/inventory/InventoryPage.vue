<template>
  <section class="page-shell flex flex-col gap-4">
    <h2>Инвентаризация</h2>

    <!-- Старт работает офлайн: сканирование и сверка расхождений локальны, не гейтим по сети. -->
    <div v-if="authStore.canWrite" class="rounded-xl bg-white p-4">
      <h3 class="inventory__section-title">Начать инвентаризацию</h3>
      <div class="inventory__start">
        <label class="inventory__field">
          <span>Зона (участок)</span>
          <Select
            v-model="selectedLocationId"
            class="inventory__zone"
            :options="locationOptions"
            optionLabel="label"
            optionValue="id"
            placeholder="Выберите зону"
            filter
          />
        </label>
        <Button
          :disabled="!selectedLocationId"
          label="Начать"
          @click="handleStart"
        />
      </div>
      <small class="inventory__hint">
        Сканирование и предпросмотр расхождений работают офлайн. Сессия появится в истории
        после синхронизации.
      </small>
    </div>

    <!-- История серверных сессий — только онлайн. -->
    <div class="rounded-xl bg-white p-4">
      <div class="inventory__history-head">
        <h3 class="inventory__section-title">История</h3>
      </div>

      <Message v-if="!isOnline" :closable="false" severity="warn">
        История доступна только онлайн
      </Message>

      <template v-else>
        <Message v-if="store.error" :closable="false" severity="error">
          {{ store.error }}
        </Message>

        <div v-if="store.loading" class="inventory__loading">
          <ProgressSpinner class="inventory__spinner" />
        </div>

        <DataTable
          v-else
          :value="store.sessions"
          dataKey="id"
          size="small"
          stripedRows
        >
          <template #empty>
            <div class="py-6 text-center text-sm text-slate-500">
              Завершённых сессий пока нет
            </div>
          </template>

          <Column field="locationName" header="Зона" />
          <Column header="Завершено">
            <template #body="{ data }">{{ formatDateTime(data.completedAt) }}</template>
          </Column>
          <Column header="Совпало">
            <template #body="{ data }">{{ data.counts?.matched ?? 0 }}</template>
          </Column>
          <Column header="Не найдено">
            <template #body="{ data }">{{ data.counts?.missing ?? 0 }}</template>
          </Column>
          <Column header="Чужие">
            <template #body="{ data }">{{ data.counts?.foreign ?? 0 }}</template>
          </Column>
          <Column header="Неизвестные">
            <template #body="{ data }">{{ data.counts?.unknown ?? 0 }}</template>
          </Column>
          <Column style="width: 8rem">
            <template #body="{ data }">
              <Button label="Открыть" size="small" text @click="openSession(data.id)" />
            </template>
          </Column>
        </DataTable>
      </template>
    </div>
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useAuthStore } from '@/stores/auth.store'
import { useInventoryStore } from '@/stores/inventory.store'
import { useLocationsStore } from '@/stores/locations.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'InventoryPage' })

const TYPE_LABELS = { area: 'Участок', section: 'Секция', row: 'Ряд', place: 'Место' }

const store = useInventoryStore()
const locationsStore = useLocationsStore()
const movementTypesStore = useMovementTypesStore()
const authStore = useAuthStore()
const router = useRouter()
const { isOnline } = useOnlineStatus()

const selectedLocationId = ref(null)

const locationOptions = computed(() =>
  locationsStore.locations.map((location) => ({
    id: location.id,
    label: TYPE_LABELS[location.type]
      ? `${location.name} (${TYPE_LABELS[location.type]})`
      : location.name
  }))
)

function formatDateTime(value) {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString('ru-RU')
}

async function handleStart() {
  const location = locationsStore.locations.find((item) => item.id === selectedLocationId.value)
  if (!location) {
    return
  }

  const result = await store.startSession({ id: location.id, name: location.name })
  if (result.ok) {
    router.push('/inventory/scan')
  }
}

function openSession(id) {
  router.push(`/inventory/sessions/${id}`)
}

onMounted(async () => {
  if (isOnline.value) {
    await Promise.all([
      store.loadServerSessions(),
      locationsStore.fetchLocations(),
      movementTypesStore.fetchMovementTypes()
    ])
  } else {
    await locationsStore.loadFromLocal()
  }
  await store.loadWriteOffTypes()
})
</script>

<style lang="scss" scoped>
.inventory__section-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.inventory__start {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.inventory__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #374151;
}

.inventory__zone {
  min-width: 280px;
}

.inventory__hint {
  display: block;
  margin-top: 10px;
  color: #6b7280;
}

.inventory__history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.inventory__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.inventory__spinner {
  width: 40px;
  height: 40px;
}
</style>
