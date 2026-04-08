# MODULE_5 — Frontend: Locations

**Зависит от:** MODULE_3

---

## Шаг 1. API

`src/api/locations.api.js`:

```js
import api from '@/api/index.js';

const base = (nurseryId) => `/nurseries/${nurseryId}/locations`;

export const locationsApi = {
  getAll:  (nurseryId) => api.get(base(nurseryId)),
  getTree: (nurseryId) => api.get(`${base(nurseryId)}/tree`),
  create:  (nurseryId, data) => api.post(base(nurseryId), data),
  update:  (nurseryId, id, data) => api.patch(`${base(nurseryId)}/${id}`, data),
  remove:  (nurseryId, id) => api.delete(`${base(nurseryId)}/${id}`),
};
```

---

## Шаг 2. Pinia store

`src/stores/locations.store.js`:

```js
import { defineStore } from 'pinia';
import { locationsApi } from '@/api/locations.api.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { upsertMany, clearTable } from '@/db/dbUtils.js';
import db from '@/db/indexedDb.js';

export const useLocationsStore = defineStore('locations', {
  state: () => ({
    locations: [],
    isLoading: false,
  }),

  getters: {
    tree: (state) => buildTree(state.locations),

    flatList: (state) => state.locations.map(l => ({
      ...l,
      label: l.name,
      value: l.id,
    })),

    byType: (state) => (type) => state.locations.filter(l => l.type === type),
  },

  actions: {
    async fetchLocations() {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await locationsApi.getAll(nursery.nurseryId);
        this.locations = data;
        await this.syncToLocal(data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal() {
      const local = await db.locations.toArray();
      if (local.length) this.locations = local;
    },

    async syncToLocal(locations) {
      await clearTable('locations');
      await upsertMany('locations', locations);
    },

    async createLocation(formData) {
      const nursery = useNurseryStore();
      const { data } = await locationsApi.create(nursery.nurseryId, formData);
      this.locations.push(data);
      await upsertMany('locations', [data]);
    },

    async updateLocation(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await locationsApi.update(nursery.nurseryId, id, formData);
      updateInList(this.locations, data);
      await upsertMany('locations', [data]);
    },

    async deleteLocation(id) {
      const nursery = useNurseryStore();
      await locationsApi.remove(nursery.nurseryId, id);
      this.locations = this.locations.filter(l => l.id !== id);
      await db.locations.delete(id);
    },
  },
});

function buildTree(items, parentId = null) {
  return items
    .filter(i => i.parent_id === parentId)
    .map(i => ({ ...i, children: buildTree(items, i.id) }));
}

function updateInList(list, updated) {
  const idx = list.findIndex(l => l.id === updated.id);
  if (idx !== -1) list.splice(idx, 1, updated);
}
```

---

## Шаг 3. LocationsPage

`src/pages/locations/LocationsPage.vue`:

```vue
<template>
  <div class="p-4">
    <div class="flex justify-content-between align-items-center mb-4">
      <h2>Структура питомника</h2>
      <Button
        v-if="auth.canManageStructure"
        label="Добавить"
        icon="pi pi-plus"
        @click="openCreate(null)"
      />
    </div>

    <Tree
      :value="locations.tree"
      :loading="locations.isLoading"
      selectionMode="single"
      class="w-full"
    >
      <template #default="{ node }">
        <div class="flex align-items-center gap-2 w-full">
          <Tag :value="TYPE_LABELS[node.type]" severity="secondary" style="font-size: 11px" />
          <span>{{ node.name }}</span>
          <div v-if="auth.canManageStructure" class="ml-auto flex gap-1">
            <Button icon="pi pi-plus" text size="small" @click.stop="openCreate(node.id)" />
            <Button icon="pi pi-pencil" text size="small" @click.stop="openEdit(node)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click.stop="handleDelete(node.id)" />
          </div>
        </div>
      </template>
    </Tree>

    <LocationCreateDialog
      v-model:visible="createVisible"
      :parent-id="selectedParentId"
      @created="locations.fetchLocations()"
    />
    <LocationEditDialog
      v-model:visible="editVisible"
      :location="selectedLocation"
      @updated="locations.fetchLocations()"
    />
  </div>
</template>

<script>
import { defineOptions, ref, onMounted } from 'vue';
import { useLocationsStore } from '@/stores/locations.store.js';
import { useAuthStore } from '@/stores/auth.store.js';
import LocationCreateDialog from '@/pages/locations/components/LocationCreateDialog.vue';
import LocationEditDialog from '@/pages/locations/components/LocationEditDialog.vue';

defineOptions({ name: 'LocationsPage' });

const TYPE_LABELS = { area: 'Участок', section: 'Секция', row: 'Ряд', place: 'Место' };

const locations = useLocationsStore();
const auth = useAuthStore();
const createVisible = ref(false);
const editVisible = ref(false);
const selectedParentId = ref(null);
const selectedLocation = ref(null);

onMounted(() => locations.fetchLocations());

function openCreate(parentId) {
  selectedParentId.value = parentId;
  createVisible.value = true;
}

function openEdit(node) {
  selectedLocation.value = node;
  editVisible.value = true;
}

async function handleDelete(id) {
  await locations.deleteLocation(id);
}
</script>
```

---

## Шаг 4. LocationCreateDialog

`src/pages/locations/components/LocationCreateDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Новая локация" modal style="width: 400px">
    <div class="field mb-3">
      <label>Название *</label>
      <InputText v-model="form.name" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Тип *</label>
      <Dropdown v-model="form.type" :options="TYPE_OPTIONS" optionLabel="label" optionValue="value" class="w-full" />
    </div>
    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Создать" :loading="isLoading" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref } from 'vue';
import { useLocationsStore } from '@/stores/locations.store.js';

defineOptions({ name: 'LocationCreateDialog' });

const props = defineProps({ visible: Boolean, parentId: { type: String, default: null } });
const emit = defineEmits(['update:visible', 'created']);

const TYPE_OPTIONS = [
  { label: 'Участок', value: 'area' },
  { label: 'Секция', value: 'section' },
  { label: 'Ряд', value: 'row' },
  { label: 'Место', value: 'place' },
];

const locations = useLocationsStore();
const isLoading = ref(false);
const form = ref({ name: '', type: 'section' });

async function handleCreate() {
  isLoading.value = true;
  try {
    await locations.createLocation({ ...form.value, parentId: props.parentId });
    emit('created');
    emit('update:visible', false);
    form.value = { name: '', type: 'section' };
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Дерево отображает все 4 уровня | Создать area → section → row → place |
| 2 | Создание дочерней локации привязывает `parent_id` | Кнопка `+` у узла → новый узел вложен |
| 3 | Удаление с растениями → ошибка | Создать растение с location_id, удалить → toast с ошибкой |
| 4 | `flatList` содержит все локации плоско | Геттер возвращает плоский массив для Dropdown |
| 5 | Кэш в Dexie обновляется при fetch | После `fetchLocations` данные в IndexedDB |
| 6 | `byType('area')` возвращает только участки | Проверить геттер |
| 7 | Observer и worker не видят кнопки управления | Войти как worker → кнопок нет |
