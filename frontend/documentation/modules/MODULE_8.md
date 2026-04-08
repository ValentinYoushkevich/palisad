# MODULE_8 — Frontend: Operations and Photos

**Зависит от:** MODULE_7

---

## Шаг 1. Правило слоя Store

- Методы `operations` и `photos` реализуются в `src/stores/operations.store.js`.
- Отдельные API-модули в `src/api/*` не создаются.
- `try/catch` для API ошибок используется в actions store.

---

## Шаг 2. Pinia store

`src/stores/operations.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { usePlantsStore } from '@/stores/plants.store.js';
import { addToQueue } from '@/db/syncQueue.service.js';
import { savePhoto, getPendingPhotos, markPhotoDone, markPhotoFailed } from '@/db/pendingPhotos.service.js';
import { useOnlineStatus } from '@/composables/useOnlineStatus.js';
import db from '@/db/indexedDb.js';

const CLOSED_STATUSES = ['sold', 'written_off'];

export const useOperationsStore = defineStore('operations', {
  state: () => ({
    operationsByPlant: {},
    isLoading: false,
  }),

  getters: {
    forPlant: (state) => (plantId) => state.operationsByPlant[plantId] ?? [],
  },

  actions: {
    async fetchOperations(plantId) {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/plants/${plantId}/operations`);
        this.operationsByPlant[plantId] = data;
        await db.operations.bulkPut(data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal(plantId) {
      const local = await db.operations
        .filter(o => o.plant_id === plantId && !o.deleted_at)
        .toArray();
      this.operationsByPlant[plantId] = local;
    },

    async createOperation(plantId, formData) {
      const { isOnline } = useOnlineStatus();
      const plants = usePlantsStore();

      const plant = plants.plants.find(p => p.id === plantId);
      if (plant && CLOSED_STATUSES.includes(plant.status)) {
        throw new Error('Нельзя добавлять операции к проданному или списанному растению');
      }

      if (isOnline.value) {
        const nursery = useNurseryStore();
        const { data } = await http.post(`/nurseries/${nursery.nurseryId}/plants/${plantId}/operations`, formData);

        if (!this.operationsByPlant[plantId]) this.operationsByPlant[plantId] = [];
        this.operationsByPlant[plantId].unshift(data);
        await db.operations.put(data);

        // Обновить container_id у растения если это пересадка
        if (formData.type === 'transplant' && formData.newContainerId) {
          await plants.updatePlant(plantId, { containerId: formData.newContainerId });
        }

        return data;
      } else {
        // Офлайн: сохранить в Dexie и sync_queue
        const localOp = {
          id: `local_${Date.now()}`,
          plant_id: plantId,
          type: formData.type,
          notes: formData.notes,
          created_at: new Date().toISOString(),
          _pending: true,
        };
        if (!this.operationsByPlant[plantId]) this.operationsByPlant[plantId] = [];
        this.operationsByPlant[plantId].unshift(localOp);
        await db.operations.put(localOp);
        await addToQueue('create_operation', { plantId, ...formData });
        return localOp;
      }
    },

    async updateOperation(id, plantId, formData) {
      const { isOnline } = useOnlineStatus();

      if (isOnline.value) {
        const nursery = useNurseryStore();
        const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/plants/${plantId}/operations/${id}`, formData);
        updateInMap(this.operationsByPlant, plantId, data);
        await db.operations.put(data);
      } else {
        const local = this.operationsByPlant[plantId]?.find(o => o.id === id);
        if (local) {
          Object.assign(local, formData, { _pending: true });
          await db.operations.put(local);
        }
        await addToQueue('update_operation', { id, plantId, ...formData });
      }
    },

    async softDelete(id, plantId) {
      const { isOnline } = useOnlineStatus();

      if (isOnline.value) {
        const nursery = useNurseryStore();
        await http.delete(`/nurseries/${nursery.nurseryId}/plants/${plantId}/operations/${id}`);
        removeFromMap(this.operationsByPlant, plantId, id);
        await db.operations.update(id, { deleted_at: new Date().toISOString() });
      } else {
        removeFromMap(this.operationsByPlant, plantId, id);
        await db.operations.update(id, { deleted_at: new Date().toISOString() });
        await addToQueue('delete_operation', { id, plantId });
      }
    },

    async attachPhoto(operationId, plantId, file) {
      const { isOnline } = useOnlineStatus();

      if (isOnline.value) {
        const nursery = useNurseryStore();
        const { data } = await http.post(`/nurseries/${nursery.nurseryId}/plants/${plantId}/operations/${operationId}/photos`, { url: file });
        return data;
      } else {
        const localId = await savePhoto(operationId, file);
        await addToQueue('attach_photo', { operationId, plantId, localId });
      }
    },

    async deletePhoto(photoId, operationId, plantId) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/plants/${plantId}/operations/${operationId}/photos/${photoId}`);
      await this.fetchOperations(plantId);
    },

    async syncPending() {
      // Обрабатывается в MODULE_12 useSyncManager
    },
  },
});

function updateInMap(map, plantId, updated) {
  const list = map[plantId];
  if (!list) return;
  const idx = list.findIndex(o => o.id === updated.id);
  if (idx !== -1) list.splice(idx, 1, updated);
}

function removeFromMap(map, plantId, id) {
  if (map[plantId]) {
    map[plantId] = map[plantId].filter(o => o.id !== id);
  }
}
```

---

## Шаг 3. OperationCreateDialog

`src/pages/plants/components/OperationCreateDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Новая операция" modal style="width: 460px">
    <div class="field mb-3">
      <label>Тип операции *</label>
      <Dropdown v-model="form.type" :options="TYPE_OPTIONS" optionLabel="label" optionValue="value" class="w-full" />
    </div>

    <div v-if="isTransplant" class="field mb-3">
      <label>Новый контейнер *</label>
      <Dropdown
        v-model="form.newContainerId"
        :options="containerTypes.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        placeholder="Выберите контейнер"
      />
    </div>

    <div class="field mb-3">
      <label>Заметки</label>
      <Textarea v-model="form.notes" class="w-full" rows="3" />
    </div>

    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Сохранить" :loading="isLoading" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref, computed } from 'vue';
import { useOperationsStore } from '@/stores/operations.store.js';
import { useContainerTypesStore } from '@/stores/containerTypes.store.js';

defineOptions({ name: 'OperationCreateDialog' });

const props = defineProps({ visible: Boolean, plantId: String });
const emit = defineEmits(['update:visible', 'created']);

const TYPE_OPTIONS = [
  { label: 'Прививка', value: 'grafting' },
  { label: 'Обрезка', value: 'pruning' },
  { label: 'Обработка СЗР', value: 'treatment' },
  { label: 'Пересадка', value: 'transplant' },
  { label: 'Осмотр', value: 'inspection' },
  { label: 'Другое', value: 'other' },
];

const operations = useOperationsStore();
const containerTypes = useContainerTypesStore();
const isLoading = ref(false);
const form = ref({ type: 'inspection', notes: '', newContainerId: null });

const isTransplant = computed(() => form.value.type === 'transplant');

async function handleCreate() {
  isLoading.value = true;
  try {
    await operations.createOperation(props.plantId, form.value);
    emit('created');
    emit('update:visible', false);
    form.value = { type: 'inspection', notes: '', newContainerId: null };
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## Шаг 4. OperationTimeline (переиспользуемый)

`src/components/OperationTimeline.vue`:

```vue
<template>
  <div class="operation-timeline">
    <div v-if="isLoading" class="text-center py-4">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <Timeline v-else :value="operations" class="w-full">
      <template #marker="{ item }">
        <span class="flex align-items-center justify-content-center border-circle w-2rem h-2rem"
              :style="{ background: TYPE_COLORS[item.type] }">
          <i :class="TYPE_ICONS[item.type]" style="color: white; font-size: 14px" />
        </span>
      </template>
      <template #content="{ item }">
        <div class="surface-card p-3 border-round mb-2">
          <div class="flex justify-content-between align-items-start">
            <div>
              <div class="font-medium">{{ TYPE_LABELS[item.type] }}</div>
              <div v-if="item.notes" class="text-color-secondary text-sm mt-1">{{ item.notes }}</div>
              <div v-if="item._pending" class="text-sm text-orange-500 mt-1">⏳ Ожидает синхронизации</div>
            </div>
            <div class="text-sm text-color-secondary">
              {{ formatDate(item.created_at) }}
            </div>
          </div>
          <div v-if="item.photos?.length" class="flex gap-2 mt-2 flex-wrap">
            <img
              v-for="photo in item.photos"
              :key="photo.id"
              :src="photo.url"
              style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px"
            />
          </div>
          <div v-if="canEdit" class="flex gap-1 mt-2">
            <Button icon="pi pi-pencil" text size="small" @click="emit('edit', item)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="emit('delete', item)" />
          </div>
        </div>
      </template>
    </Timeline>
  </div>
</template>

<script>
import { defineOptions, defineProps, defineEmits } from 'vue';

defineOptions({ name: 'OperationTimeline' });

defineProps({
  operations: { type: Array, default: () => [] },
  isLoading: Boolean,
  canEdit: Boolean,
});

const emit = defineEmits(['edit', 'delete']);

const TYPE_LABELS = {
  grafting: 'Прививка', pruning: 'Обрезка', treatment: 'Обработка СЗР',
  transplant: 'Пересадка', inspection: 'Осмотр', other: 'Другое',
};
const TYPE_ICONS = {
  grafting: 'pi pi-cog', pruning: 'pi pi-scissors', treatment: 'pi pi-shield',
  transplant: 'pi pi-box', inspection: 'pi pi-eye', other: 'pi pi-file',
};
const TYPE_COLORS = {
  grafting: '#6366f1', pruning: '#f59e0b', treatment: '#10b981',
  transplant: '#3b82f6', inspection: '#8b5cf6', other: '#9ca3af',
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Нельзя создать операцию для `sold`/`written_off` | Попытка → toast с ошибкой |
| 2 | `transplant` обновляет `container_id` растения | Создать transplant → в карточке растения новый контейнер |
| 3 | Офлайн-операция попадает в `sync_queue` | Создать офлайн → проверить IndexedDB `sync_queue` |
| 4 | Офлайн-запись отображается с меткой «Ожидает синхронизации» | `_pending: true` → иконка в таймлайне |
| 5 | Фото офлайн сохраняется в `pending_photos` | Прикрепить фото офлайн → проверить Dexie |
| 6 | Мягкое удаление убирает операцию из таймлайна | Удалить → исчезла; в Dexie `deleted_at` установлен |
| 7 | `feature_operations` блокирует на `free` | Создать операцию на `free` → 403 от API |
