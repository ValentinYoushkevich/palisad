# MODULE_9 — Frontend: Movements

**Зависит от:** MODULE_7

---

## Шаг 1. API

`src/api/movements.api.js`:

```js
import api from '@/api/index.js';

const base = (nurseryId, plantId) => `/nurseries/${nurseryId}/plants/${plantId}/movements`;

export const movementsApi = {
  getAll:  (nurseryId, plantId) => api.get(base(nurseryId, plantId)),
  create:  (nurseryId, plantId, data) => api.post(base(nurseryId, plantId), data),
  remove:  (nurseryId, plantId, id) => api.delete(`${base(nurseryId, plantId)}/${id}`),
};
```

---

## Шаг 2. Pinia store

`src/stores/movements.store.js`:

```js
import { defineStore } from 'pinia';
import { movementsApi } from '@/api/movements.api.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { usePlantsStore } from '@/stores/plants.store.js';
import { addToQueue } from '@/db/syncQueue.service.js';
import { useOnlineStatus } from '@/composables/useOnlineStatus.js';
import db from '@/db/indexedDb.js';

const CLOSED_STATUSES = ['sold', 'written_off'];

export const useMovementsStore = defineStore('movements', {
  state: () => ({
    movementsByPlant: {},
    isLoading: false,
  }),

  getters: {
    forPlant: (state) => (plantId) => state.movementsByPlant[plantId] ?? [],
  },

  actions: {
    async fetchMovements(plantId) {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await movementsApi.getAll(nursery.nurseryId, plantId);
        this.movementsByPlant[plantId] = data;
        await db.movements.bulkPut(data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal(plantId) {
      const local = await db.movements
        .filter(m => m.plant_id === plantId)
        .toArray();
      this.movementsByPlant[plantId] = local;
    },

    async createMovement(plantId, formData) {
      const { isOnline } = useOnlineStatus();
      const plants = usePlantsStore();

      // Блокировка для closed-статусов
      const plant = plants.plants.find(p => p.id === plantId);
      if (plant && CLOSED_STATUSES.includes(plant.status)) {
        throw new Error('Нельзя добавлять движения к проданному или списанному растению');
      }

      if (isOnline.value) {
        const nursery = useNurseryStore();
        const { data } = await movementsApi.create(nursery.nurseryId, plantId, formData);

        if (!this.movementsByPlant[plantId]) this.movementsByPlant[plantId] = [];
        this.movementsByPlant[plantId].unshift(data);
        await db.movements.put(data);

        // Обновить статус и location в plants.store на основе sets_status типа движения
        await applyMovementToPlant(plants, plantId, data);

        return data;
      } else {
        const localMovement = {
          id: `local_${Date.now()}`,
          plant_id: plantId,
          type_id: formData.typeId,
          from_location_id: formData.fromLocationId ?? null,
          to_location_id: formData.toLocationId ?? null,
          quantity: formData.quantity ?? 1,
          notes: formData.notes,
          created_at: new Date().toISOString(),
          _pending: true,
        };
        if (!this.movementsByPlant[plantId]) this.movementsByPlant[plantId] = [];
        this.movementsByPlant[plantId].unshift(localMovement);
        await db.movements.put(localMovement);
        await addToQueue('create_movement', { plantId, ...formData });
        return localMovement;
      }
    },

    async deleteMovement(id, plantId) {
      const nursery = useNurseryStore();
      await movementsApi.remove(nursery.nurseryId, plantId, id);
      if (this.movementsByPlant[plantId]) {
        this.movementsByPlant[plantId] = this.movementsByPlant[plantId].filter(m => m.id !== id);
      }
      await db.movements.delete(id);
    },

    async syncPending() {
      // Обрабатывается в MODULE_12 useSyncManager
    },
  },
});

async function applyMovementToPlant(plants, plantId, movement) {
  const updates = {};

  // sets_status приходит из бэкенда в ответе движения
  if (movement.sets_status) {
    updates.status = movement.sets_status;
  }

  if (movement.to_location_id) {
    updates.locationId = movement.to_location_id;
  }

  if (Object.keys(updates).length > 0) {
    await plants.updatePlant(plantId, updates);
  }
}
```

---

## Шаг 3. MovementCreateDialog

`src/pages/plants/components/MovementCreateDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Новое движение" modal style="width: 460px">
    <div class="field mb-3">
      <label>Тип движения *</label>
      <Dropdown
        v-model="form.typeId"
        :options="movementTypes.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        placeholder="Выберите тип"
      >
        <template #option="{ option }">
          <div class="flex align-items-center gap-2">
            <Tag v-if="option.is_system" value="Системный" severity="secondary" style="font-size: 10px" />
            <span>{{ option.name }}</span>
            <Tag v-if="option.sets_status" :value="STATUS_LABELS[option.sets_status]"
                 :severity="STATUS_SEVERITY[option.sets_status]" style="font-size: 10px" />
          </div>
        </template>
      </Dropdown>
    </div>

    <div v-if="isTransfer" class="field mb-3">
      <label>Откуда</label>
      <Dropdown
        v-model="form.fromLocationId"
        :options="locations.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        showClear
      />
    </div>

    <div v-if="isTransfer" class="field mb-3">
      <label>Куда *</label>
      <Dropdown
        v-model="form.toLocationId"
        :options="locations.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        placeholder="Выберите локацию"
      />
    </div>

    <div class="field mb-3">
      <label>Количество</label>
      <InputNumber v-model="form.quantity" :min="1" class="w-full" />
    </div>

    <div class="field mb-3">
      <label>Заметки</label>
      <Textarea v-model="form.notes" class="w-full" rows="2" />
    </div>

    <Message v-if="setsStatus" severity="warn" class="mb-3">
      После этого движения статус растения изменится на: <strong>{{ STATUS_LABELS[setsStatus] }}</strong>
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Записать" :loading="isLoading" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref, computed } from 'vue';
import { useMovementsStore } from '@/stores/movements.store.js';
import { useMovementTypesStore } from '@/stores/movementTypes.store.js';
import { useLocationsStore } from '@/stores/locations.store.js';

defineOptions({ name: 'MovementCreateDialog' });

const props = defineProps({ visible: Boolean, plantId: String });
const emit = defineEmits(['update:visible', 'created']);

const STATUS_LABELS = { growing: 'В росте', storage: 'На хранении', sold: 'Продано', written_off: 'Списано' };
const STATUS_SEVERITY = { growing: 'success', storage: 'info', sold: 'secondary', written_off: 'danger' };

const movements = useMovementsStore();
const movementTypes = useMovementTypesStore();
const locations = useLocationsStore();
const isLoading = ref(false);
const form = ref({ typeId: null, fromLocationId: null, toLocationId: null, quantity: 1, notes: '' });

const selectedType = computed(() => movementTypes.activeTypes.find(t => t.id === form.value.typeId));
const isTransfer = computed(() => selectedType.value?.slug === 'transfer' || selectedType.value?.slug === 'arrival');
const setsStatus = computed(() => selectedType.value?.sets_status ?? null);

async function handleCreate() {
  isLoading.value = true;
  try {
    await movements.createMovement(props.plantId, form.value);
    emit('created');
    emit('update:visible', false);
    form.value = { typeId: null, fromLocationId: null, toLocationId: null, quantity: 1, notes: '' };
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## Шаг 4. MovementHistory (переиспользуемый)

`src/components/MovementHistory.vue`:

```vue
<template>
  <div>
    <div v-if="isLoading" class="text-center py-3">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <DataTable v-else :value="movements" size="small" stripedRows>
      <Column header="Дата">
        <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
      </Column>
      <Column header="Тип">
        <template #body="{ data }">
          <span>{{ data.type_name }}</span>
          <Tag v-if="data._pending" value="Ожидает" severity="warning" class="ml-2" style="font-size: 10px" />
        </template>
      </Column>
      <Column header="Откуда → Куда">
        <template #body="{ data }">
          <span v-if="data.from_location_name || data.to_location_name">
            {{ data.from_location_name || '—' }} → {{ data.to_location_name || '—' }}
          </span>
          <span v-else class="text-color-secondary">—</span>
        </template>
      </Column>
      <Column header="Кол-во">
        <template #body="{ data }">{{ data.quantity }}</template>
      </Column>
      <Column header="Исполнитель">
        <template #body="{ data }">{{ data.user_name || '—' }}</template>
      </Column>
      <Column v-if="canDelete">
        <template #body="{ data }">
          <Button
            v-if="!data._pending"
            icon="pi pi-trash"
            text
            severity="danger"
            size="small"
            @click="emit('delete', data)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script>
import { defineOptions, defineProps, defineEmits } from 'vue';

defineOptions({ name: 'MovementHistory' });

defineProps({
  movements: { type: Array, default: () => [] },
  isLoading: Boolean,
  canDelete: Boolean,
});

const emit = defineEmits(['delete']);

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU');
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | `sets_status` меняет статус растения в сторе | Создать движение «Продажа» → `plant.status = 'sold'` |
| 2 | Движение для `sold`/`written_off` → ошибка | Попытка → toast |
| 3 | Офлайн-движение попадает в `sync_queue` | Создать офлайн → проверить Dexie |
| 4 | Офлайн-запись помечается «Ожидает» | `_pending: true` → Tag в таблице |
| 5 | `isTransfer` показывает поля локации | Выбрать тип «Перемещение» → поля From/To появляются |
| 6 | Предупреждение о смене статуса видно до подтверждения | Выбрать «Продажа» → Message об изменении статуса |
| 7 | Удаление движения только для `owner`/`agronomist` | Worker: кнопки нет; owner: кнопка есть |
