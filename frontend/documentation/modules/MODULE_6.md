# MODULE_6 — Frontend: Catalogs

**Зависит от:** MODULE_3

---

## Шаг 1. Правило слоя Store

- Для `species`, `tags`, `movementTypes`, `containerTypes` HTTP-методы описываются в соответствующих store.
- Отдельные API-файлы в `src/api/*` не создаются.
- Обработка API-ошибок (`try/catch`) выполняется в actions store.

---

## Шаг 2. species.store — справочник питомника + подсказки (локальный каталог и GBIF)

Бэкенд отдаёт строки **`nursery_species`** с join к **`species_catalog`** (в JSON по-прежнему есть `gbif_id`, `scientific_name`, `display_name_ru` и т.д.). Поиск подсказок: `GET .../species/search` — смесь локальных совпадений и результатов GBIF. Добавление вида в питомник: `POST .../species/attach-by-name` с телом `{ scientific_name, display_name_ru }` (snake_case после валидации на сервере).

`src/stores/species.store.js` (фрагмент):

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { upsertMany, clearTable } from '@/db/dbUtils.js';
import db from '@/db/indexedDb.js';
import { useDebounceFn } from '@/composables/useDebounceFn.js';

export const useSpeciesStore = defineStore('species', {
  state: () => ({
    species: [],
    searchResults: [],
    speciesError: '',
    isSearching: false,
    isLoading: false,
  }),

  getters: {
    activeSpecies: (state) => state.species.filter((s) => s.is_active),
  },

  actions: {
    async fetchSpecies() {
      const nursery = useNurseryStore();
      this.speciesError = '';
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/species`);
        this.species = data;
        await this.syncToLocal(data);
        return { ok: true };
      } catch (e) {
        this.speciesError = e?.response?.data?.error || 'Не удалось загрузить виды.';
        return { ok: false };
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal() {
      const local = await db.species.toArray();
      if (local.length) this.species = local;
    },

    async syncToLocal(items) {
      await clearTable('species');
      await upsertMany('species', items);
    },

    searchGbif: useDebounceFn(async function (query) {
      if (!query || query.length < 2) {
        this.searchResults = [];
        return;
      }
      const nursery = useNurseryStore();
      this.speciesError = '';
      this.isSearching = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/species/search`, {
          params: { q: query },
        });
        this.searchResults = data;
      } catch (e) {
        this.speciesError = e?.response?.data?.error || 'Не удалось выполнить поиск вида.';
      } finally {
        this.isSearching = false;
      }
    }, 400),

    /** Тело: { scientific_name, display_name_ru } — выбранное из подсказки латинское имя + русское имя */
    async createSpecies(formData) {
      const nursery = useNurseryStore();
      this.speciesError = '';
      this.isLoading = true;
      try {
        const { data } = await http.post(
          `/nurseries/${nursery.nurseryId}/species/attach-by-name`,
          formData
        );
        if (data && !data.alreadyExists) {
          this.species.push(data);
          await upsertMany('species', [data]);
        }
        return { ok: true, data };
      } catch (e) {
        this.speciesError = e?.response?.data?.error || 'Не удалось создать вид.';
        return { ok: false, data: null };
      } finally {
        this.isLoading = false;
      }
    },

    async updateSpecies(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/species/${id}`, formData);
      updateInList(this.species, data);
      await upsertMany('species', [data]);
    },

    async deleteSpecies(id) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/species/${id}`);
      await this.fetchSpecies();
    },
  },
});

function updateInList(list, updated) {
  const idx = list.findIndex((i) => i.id === updated.id);
  if (idx !== -1) list.splice(idx, 1, updated);
}
```

---

## Шаг 3. useDebounceFn composable

`src/composables/useDebounceFn.js`:

```js
export function useDebounceFn(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

---

## Шаг 4. tags.store

`src/stores/tags.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { upsertMany, clearTable } from '@/db/dbUtils.js';
import db from '@/db/indexedDb.js';

export const useTagsStore = defineStore('tags', {
  state: () => ({ tags: [], isLoading: false }),

  getters: {
    activeTags: (state) => state.tags.filter(t => t.is_active),
  },

  actions: {
    async fetchTags() {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/tags`);
        this.tags = data;
        await clearTable('tags');
        await upsertMany('tags', data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal() {
      const local = await db.tags.toArray();
      if (local.length) this.tags = local;
    },

    async createTag(formData) {
      const nursery = useNurseryStore();
      const { data } = await http.post(`/nurseries/${nursery.nurseryId}/tags`, formData);
      this.tags.push(data);
      await upsertMany('tags', [data]);
    },

    async updateTag(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/tags/${id}`, formData);
      const idx = this.tags.findIndex(t => t.id === id);
      if (idx !== -1) this.tags.splice(idx, 1, data);
      await upsertMany('tags', [data]);
    },

    async deleteTag(id) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/tags/${id}`);
      await this.fetchTags();
    },
  },
});
```

---

## Шаг 5. movementTypes.store

`src/stores/movementTypes.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { upsertMany, clearTable } from '@/db/dbUtils.js';
import db from '@/db/indexedDb.js';

export const useMovementTypesStore = defineStore('movementTypes', {
  state: () => ({ movementTypes: [], isLoading: false }),

  getters: {
    systemTypes:  (state) => state.movementTypes.filter(t => t.is_system),
    customTypes:  (state) => state.movementTypes.filter(t => !t.is_system),
    activeTypes:  (state) => state.movementTypes.filter(t => t.is_active),
  },

  actions: {
    async fetchMovementTypes() {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/movement-types`);
        this.movementTypes = data;
        await clearTable('movement_types');
        await upsertMany('movement_types', data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal() {
      const local = await db.movement_types.toArray();
      if (local.length) this.movementTypes = local;
    },

    async createMovementType(formData) {
      const nursery = useNurseryStore();
      const { data } = await http.post(`/nurseries/${nursery.nurseryId}/movement-types`, formData);
      this.movementTypes.push(data);
    },

    async updateMovementType(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/movement-types/${id}`, formData);
      const idx = this.movementTypes.findIndex(t => t.id === id);
      if (idx !== -1) this.movementTypes.splice(idx, 1, data);
    },

    async deleteMovementType(id) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/movement-types/${id}`);
      this.movementTypes = this.movementTypes.filter(t => t.id !== id);
    },
  },
});
```

---

## Шаг 6. containerTypes.store

`src/stores/containerTypes.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { upsertMany, clearTable } from '@/db/dbUtils.js';
import db from '@/db/indexedDb.js';

export const useContainerTypesStore = defineStore('containerTypes', {
  state: () => ({ containerTypes: [], isLoading: false }),

  getters: {
    systemTypes: (state) => state.containerTypes.filter(t => t.is_system),
    customTypes:  (state) => state.containerTypes.filter(t => !t.is_system),
    activeTypes:  (state) => state.containerTypes.filter(t => t.is_active),
    byKind: (state) => (kind) => state.containerTypes.filter(t => t.container_kind === kind && t.is_active),
  },

  actions: {
    async fetchContainerTypes() {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/container-types`);
        this.containerTypes = data;
        await clearTable('container_types');
        await upsertMany('container_types', data);
      } finally {
        this.isLoading = false;
      }
    },

    async loadFromLocal() {
      const local = await db.container_types.toArray();
      if (local.length) this.containerTypes = local;
    },

    async createContainerType(formData) {
      const nursery = useNurseryStore();
      const { data } = await http.post(`/nurseries/${nursery.nurseryId}/container-types`, formData);
      this.containerTypes.push(data);
    },

    async updateContainerType(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await http.patch(`/nurseries/${nursery.nurseryId}/container-types/${id}`, formData);
      const idx = this.containerTypes.findIndex(t => t.id === id);
      if (idx !== -1) this.containerTypes.splice(idx, 1, data);
    },

    async deleteContainerType(id) {
      const nursery = useNurseryStore();
      await http.delete(`/nurseries/${nursery.nurseryId}/container-types/${id}`);
      this.containerTypes = this.containerTypes.filter(t => t.id !== id);
    },
  },
});
```

---

## Шаг 7. SpeciesSearchDialog — подсказки и attach-by-name

Пользователь выбирает подсказку (поля `gbifId`, `scientificName`, `family` из ответа поиска). При сохранении на сервер уходит только латинское и русское имя в **snake_case**; бэкенд сам сопоставляет таксон с глобальным каталогом и GBIF.

`src/pages/catalog/components/SpeciesSearchDialog.vue` (логика):

```vue
<script setup>
import { useSpeciesStore } from '@/stores/species.store'
// ...
const speciesStore = useSpeciesStore()
const selectedGbif = ref(null)
const displayNameRu = ref('')

async function handleSave() {
  if (!selectedGbif.value) return

  const result = await speciesStore.createSpecies({
    scientific_name: selectedGbif.value.scientificName,
    display_name_ru: displayNameRu.value.trim()
  })

  if (!result?.ok) return
  if (result?.data?.alreadyExists) {
    alreadyExists.value = true
    return
  }
  emit('created')
  close()
}
</script>
```

Подпись «Поиск по GBIF» сохранена в UI: фактически запрос идёт на `GET .../species/search`, который объединяет локальные совпадения и внешний GBIF.

---

## Layout & Navigation Contract

- Раздел `Справочники` размещается в `Общем доступе`.
- Право управления элементами справочников ограничивается ролями `owner` и `agronomist`.
- Для `worker` и `observer` допустим режим чтения без управляющих действий.

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Поиск видов с debounce 400ms | Вводить символы — запрос на `.../species/search` после паузы |
| 2 | `POST .../species/attach-by-name` с `scientific_name` + `display_name_ru` | Сохранить вид; при дубле в питомнике — `alreadyExists`, Info в UI |
| 3 | Системные типы (движений, контейнеров) не имеют кнопок edit/delete | `is_system = true` — кнопок нет |
| 4 | Создание тега без `feature_tags` → 403 от API, toast в UI | Войти на плане `free`, создать тег |
| 5 | Все справочники синхронизируются в Dexie | Проверить IndexedDB после fetch |
| 6 | `byKind('pot')` возвращает только горшечные контейнеры | Проверить геттер |
