# MODULE_7 — Frontend: Plants Registry

**Зависит от:** MODULE_5, MODULE_6

---

## Шаг 1. Правило слоя Store

- Методы по `plants` размещаются напрямую в `src/stores/plants.store.js`.
- `src/api/*` не используется как отдельный слой.
- API-ошибки обрабатываются в actions store через `try/catch`.

---

## Шаг 2. Pinia store

`src/stores/plants.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { addToQueue } from '@/db/syncQueue.service.js';
import { upsertMany } from '@/db/dbUtils.js';
import db from '@/db/indexedDb.js';
import { useOnlineStatus } from '@/composables/useOnlineStatus.js';

export const usePlantsStore = defineStore('plants', {
  state: () => ({
    plants: [],
    activeFilters: {
      status: null,
      speciesId: null,
      locationId: null,
      tagId: null,
      containerId: null,
      search: '',
      numericCode: '',
    },
    pagination: { page: 1, perPage: 30, total: 0 },
    isLoading: false,
    isSyncing: false,
  }),

  getters: {
    filtered: (state) => {
      let result = state.plants;
      const f = state.activeFilters;
      if (f.status)      result = result.filter(p => p.status === f.status);
      if (f.speciesId)   result = result.filter(p => p.species_id === f.speciesId);
      if (f.locationId)  result = result.filter(p => p.location_id === f.locationId);
      if (f.tagId)       result = result.filter(p => p.tags?.some(t => t.id === f.tagId));
      if (f.containerId) result = result.filter(p => p.container_id === f.containerId);
      if (f.numericCode) result = result.filter(p => p.numeric_code?.includes(f.numericCode));
      if (f.search)      result = result.filter(p =>
        p.scientific_name?.toLowerCase().includes(f.search.toLowerCase()) ||
        p.display_name_ru?.toLowerCase().includes(f.search.toLowerCase()) ||
        p.variety?.toLowerCase().includes(f.search.toLowerCase())
      );
      return result;
    },

    byQr: (state) => (qrCode) => state.plants.find(p => p.qr_code === qrCode),
    byNumericCode: (state) => (code) => state.plants.find(p => p.numeric_code === code),
  },

  actions: {
    async fetchPlants(params = {}) {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/plants`, {
          page: this.pagination.page,
          perPage: this.pagination.perPage,
          ...params,
        });
        this.plants = data.data;
        this.pagination.total = data.total;
        await upsertMany('plants', data.data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal() {
      const local = await db.plants
        .filter(p => !p.deleted_at)
        .toArray();
      if (local.length) this.plants = local;
    },

    async createPlant(formData) {
      const nursery = useNurseryStore();
      const { data } = await http.post(`/nurseries/${nursery.nurseryId}/plants`, formData);
      this.plants.unshift(data);
      await upsertMany('plants', [data]);
      return data;
    },

    async bulkCreate(template, count) {
      const nursery = useNurseryStore();
      const { data } = await http.post(`/nurseries/${nursery.nurseryId}/plants/bulk`, { template, count });
      this.plants.unshift(...data);
      await upsertMany('plants', data);
    },

    async updatePlant(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/plants/${id}`, formData);
      updateInList(this.plants, data);
      await upsertMany('plants', [data]);
    },

    async softDelete(id) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/plants/${id}`);
      this.plants = this.plants.filter(p => p.id !== id);
    },

    async restore(id) {
      const nursery = useNurseryStore();
      const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/plants/${id}/restore`);
      this.plants.unshift(data);
    },

    async addTag(plantId, tagId) {
      const nursery = useNurseryStore();
      await http.post(`/nurseries/${nursery.nurseryId}/plants/${plantId}/tags/${tagId}`);
      await this.refreshPlant(plantId);
    },

    async removeTag(plantId, tagId) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/plants/${plantId}/tags/${tagId}`);
      await this.refreshPlant(plantId);
    },

    async findByQr(qrCode) {
      const { isOnline } = useOnlineStatus();
      const local = this.byQr(qrCode);
      if (local) return local;

      if (isOnline.value) {
        const nursery = useNurseryStore();
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/plants/by-qr/${qrCode}`);
        return data;
      }
      return null;
    },

    async findByNumericCode(code) {
      const { isOnline } = useOnlineStatus();
      const local = this.byNumericCode(code);
      if (local) return local;

      if (isOnline.value) {
        const nursery = useNurseryStore();
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/plants/by-code/${code}`);
        return data;
      }
      return null;
    },

    async refreshPlant(id) {
      const nursery = useNurseryStore();
      const { data } = await http.get(`/nurseries/${nursery.nurseryId}/plants/${id}`);
      updateInList(this.plants, data);
      await upsertMany('plants', [data]);
    },

    setFilter(key, value) {
      this.activeFilters[key] = value;
    },

    resetFilters() {
      this.activeFilters = {
        status: null, speciesId: null, locationId: null,
        tagId: null, containerId: null, search: '', numericCode: '',
      };
    },

    async syncPending() {
      // Синк выполняется в MODULE_12 через useSyncManager
      // Этот action — точка входа для принудительной синхронизации
    },
  },
});

function updateInList(list, updated) {
  const idx = list.findIndex(p => p.id === updated.id);
  if (idx !== -1) list.splice(idx, 1, updated);
  else list.unshift(updated);
}
```

---

## Шаг 3. PlantsPage

`src/pages/plants/PlantsPage.vue`:

```vue
<template>
  <div class="p-4">
    <div class="flex justify-content-between align-items-center mb-3">
      <h2>Реестр растений</h2>
      <div class="flex gap-2">
        <Button
          v-if="auth.canManageStructure && isOnline"
          label="Добавить"
          icon="pi pi-plus"
          @click="createVisible = true"
        />
        <Button
          v-if="auth.canManageStructure && isOnline"
          label="Массовый ввод"
          icon="pi pi-copy"
          outlined
          @click="bulkVisible = true"
        />
      </div>
    </div>

    <PlantFiltersPanel @change="plants.fetchPlants()" />

    <DataTable
      :value="plants.filtered"
      :loading="plants.isLoading"
      lazy
      paginator
      :rows="plants.pagination.perPage"
      :totalRecords="plants.pagination.total"
      stripedRows
      class="mt-3"
      @page="onPage"
    >
      <Column header="QR / Код">
        <template #body="{ data }">
          <div class="font-mono text-sm">{{ data.numeric_code }}</div>
        </template>
      </Column>
      <Column header="Вид / Сорт">
        <template #body="{ data }">
          <div>{{ data.display_name_ru }}</div>
          <div v-if="data.variety" class="text-sm text-color-secondary">{{ data.variety }}</div>
        </template>
      </Column>
      <Column header="Контейнер">
        <template #body="{ data }">
          <Tag v-if="data.container_code" :value="data.container_code" severity="secondary" />
        </template>
      </Column>
      <Column header="Локация">
        <template #body="{ data }">{{ data.location_name || '—' }}</template>
      </Column>
      <Column header="Статус">
        <template #body="{ data }">
          <Tag :value="STATUS_LABELS[data.status]" :severity="STATUS_SEVERITY[data.status]" />
        </template>
      </Column>
      <Column>
        <template #body="{ data }">
          <Button icon="pi pi-eye" text @click="router.push(`/plants/${data.id}`)" />
        </template>
      </Column>
    </DataTable>

    <PlantCreateDialog v-model:visible="createVisible" @created="plants.fetchPlants()" />
    <PlantBulkCreateDialog v-model:visible="bulkVisible" @created="plants.fetchPlants()" />
  </div>
</template>

<script>
import { defineOptions, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlantsStore } from '@/stores/plants.store.js';
import { useAuthStore } from '@/stores/auth.store.js';
import { useOnlineStatus } from '@/composables/useOnlineStatus.js';
import PlantFiltersPanel from '@/pages/plants/components/PlantFiltersPanel.vue';
import PlantCreateDialog from '@/pages/plants/components/PlantCreateDialog.vue';
import PlantBulkCreateDialog from '@/pages/plants/components/PlantBulkCreateDialog.vue';

defineOptions({ name: 'PlantsPage' });

const STATUS_LABELS = { growing: 'В росте', storage: 'На хранении', sold: 'Продано', written_off: 'Списано' };
const STATUS_SEVERITY = { growing: 'success', storage: 'info', sold: 'secondary', written_off: 'danger' };

const router = useRouter();
const plants = usePlantsStore();
const auth = useAuthStore();
const { isOnline } = useOnlineStatus();
const createVisible = ref(false);
const bulkVisible = ref(false);

onMounted(async () => {
  if (isOnline.value) {
    await plants.fetchPlants();
  } else {
    await plants.loadFromLocal();
  }
});

function onPage(event) {
  plants.pagination.page = event.page + 1;
  plants.fetchPlants();
}
</script>
```

---

## Шаг 4. PlantCreateDialog

`src/pages/plants/components/PlantCreateDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Новое растение" modal style="width: 520px">
    <div class="field mb-3">
      <label>Вид *</label>
      <Dropdown
        v-model="form.speciesId"
        :options="species.activeSpecies"
        optionLabel="display_name_ru"
        optionValue="id"
        class="w-full"
        placeholder="Выберите вид"
        filter
      />
    </div>
    <div class="field mb-3">
      <label>Сорт</label>
      <InputText v-model="form.variety" class="w-full" placeholder="Например: Красная" />
      <Message v-if="varietyWarning" severity="warn" class="mt-1">
        Сорт "{{ form.variety }}" уже встречается для этого вида. Продолжить?
      </Message>
    </div>
    <div class="field mb-3">
      <label>Дата посадки *</label>
      <Calendar v-model="form.plantedAt" dateFormat="yy-mm-dd" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Источник *</label>
      <SelectButton v-model="form.source" :options="SOURCE_OPTIONS" optionLabel="label" optionValue="value" />
    </div>
    <div class="field mb-3">
      <label>Контейнер</label>
      <Dropdown
        v-model="form.containerId"
        :options="containerTypes.activeTypes"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        placeholder="Выберите контейнер"
      />
    </div>
    <div class="field mb-3">
      <label>Местонахождение</label>
      <Dropdown
        v-model="form.locationId"
        :options="locations.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
        placeholder="Выберите локацию"
        filter
      />
    </div>
    <div class="field mb-3">
      <label>Заметки</label>
      <Textarea v-model="form.notes" class="w-full" rows="2" />
    </div>
    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Создать" :loading="isLoading" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref } from 'vue';
import { usePlantsStore } from '@/stores/plants.store.js';
import { useSpeciesStore } from '@/stores/species.store.js';
import { useLocationsStore } from '@/stores/locations.store.js';
import { useContainerTypesStore } from '@/stores/containerTypes.store.js';

defineOptions({ name: 'PlantCreateDialog' });

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['update:visible', 'created']);

const SOURCE_OPTIONS = [
  { label: 'Своё', value: 'own' },
  { label: 'Куплено', value: 'purchased' },
];

const plants = usePlantsStore();
const species = useSpeciesStore();
const locations = useLocationsStore();
const containerTypes = useContainerTypesStore();

const isLoading = ref(false);
const varietyWarning = ref(false);
const form = ref({
  speciesId: null, variety: '', plantedAt: null,
  source: 'own', containerId: null, locationId: null, notes: '',
});

async function handleCreate() {
  isLoading.value = true;
  try {
    await plants.createPlant(form.value);
    emit('created');
    emit('update:visible', false);
    form.value = { speciesId: null, variety: '', plantedAt: null, source: 'own', containerId: null, locationId: null, notes: '' };
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## Шаг 5. PlantFiltersPanel

`src/pages/plants/components/PlantFiltersPanel.vue`:

```vue
<template>
  <div class="flex flex-wrap gap-2 mb-3">
    <Dropdown
      v-model="filters.status"
      :options="STATUS_OPTIONS"
      optionLabel="label"
      optionValue="value"
      placeholder="Статус"
      showClear
      style="min-width: 140px"
      @change="emit('change')"
    />
    <Dropdown
      v-model="filters.speciesId"
      :options="species.activeSpecies"
      optionLabel="display_name_ru"
      optionValue="id"
      placeholder="Вид"
      showClear
      filter
      style="min-width: 180px"
      @change="emit('change')"
    />
    <Dropdown
      v-model="filters.containerId"
      :options="containerTypes.activeTypes"
      optionLabel="name"
      optionValue="id"
      placeholder="Контейнер"
      showClear
      style="min-width: 150px"
      @change="emit('change')"
    />
    <InputText
      v-model="filters.numericCode"
      placeholder="Числовой код"
      style="width: 160px"
      @input="emit('change')"
    />
    <InputText
      v-model="filters.search"
      placeholder="Поиск..."
      style="width: 200px"
      @input="emit('change')"
    />
    <Button label="Сбросить" text @click="resetFilters" />
  </div>
</template>

<script>
import { defineOptions, defineEmits, computed } from 'vue';
import { usePlantsStore } from '@/stores/plants.store.js';
import { useSpeciesStore } from '@/stores/species.store.js';
import { useContainerTypesStore } from '@/stores/containerTypes.store.js';

defineOptions({ name: 'PlantFiltersPanel' });

const emit = defineEmits(['change']);

const STATUS_OPTIONS = [
  { label: 'В росте', value: 'growing' },
  { label: 'На хранении', value: 'storage' },
  { label: 'Продано', value: 'sold' },
  { label: 'Списано', value: 'written_off' },
];

const plants = usePlantsStore();
const species = useSpeciesStore();
const containerTypes = useContainerTypesStore();

const filters = computed(() => plants.activeFilters);

function resetFilters() {
  plants.resetFilters();
  emit('change');
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Кнопка «Добавить» скрыта офлайн | Отключить сеть в DevTools → кнопки нет |
| 2 | Создание растения добавляет в список без reload | `POST .../plants` → запись сверху списка |
| 3 | `findByQr` сначала ищет в Dexie, потом в API | Офлайн: растение в Dexie → найдено; незнакомый QR → null |
| 4 | `findByNumericCode` аналогично | Ввести числовой код → найдено растение |
| 5 | Фильтр по контейнеру работает | Выбрать C3 → только растения в C3 |
| 6 | Пагинация переключает страницы | Перейти на стр. 2 → новые данные |
| 7 | Soft delete убирает из списка | Удалить → запись исчезла; в БД `deleted_at` установлен |
