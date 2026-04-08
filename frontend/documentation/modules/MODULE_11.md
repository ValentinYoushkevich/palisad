# MODULE_11 — Frontend: Activity Feed

**Зависит от:** MODULE_2

---

## Шаг 1. Правило слоя Store

- Методы по `activity` реализуются в `src/stores/activity.store.js`.
- API-файлы в `src/api/*` не создаются.
- `try/catch` для API-запросов размещается в actions store.

---

## Шаг 2. Pinia store

`src/stores/activity.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useNurseryStore } from '@/stores/nursery.store.js';

export const useActivityStore = defineStore('activity', {
  state: () => ({
    logs: [],
    filters: {
      dateFrom: null,
      dateTo: null,
      userId: null,
      eventType: null,
    },
    pagination: {
      page: 1,
      perPage: 30,
      total: 0,
    },
    isLoading: false,
  }),

  getters: {
    hasActiveFilters: (state) => {
      const f = state.filters;
      return !!(f.dateFrom || f.dateTo || f.userId || f.eventType);
    },
  },

  actions: {
    async fetchLogs(reset = false) {
      const nursery = useNurseryStore();
      if (reset) {
        this.pagination.page = 1;
        this.logs = [];
      }
      this.isLoading = true;
      try {
        const { data } = await http.get(`/nurseries/${nursery.nurseryId}/activity`, {
          page: this.pagination.page,
          perPage: this.pagination.perPage,
          ...buildFilterParams(this.filters),
        });
        if (reset) {
          this.logs = data.data;
        } else {
          this.logs.push(...data.data);
        }
        this.pagination.total = data.total;
      } finally {
        this.isLoading = false;
      }
    },

    async loadMore() {
      if (this.logs.length >= this.pagination.total) return;
      this.pagination.page += 1;
      await this.fetchLogs(false);
    },

    setFilter(key, value) {
      this.filters[key] = value;
    },

    resetFilters() {
      this.filters = { dateFrom: null, dateTo: null, userId: null, eventType: null };
      this.fetchLogs(true);
    },
  },
});

function buildFilterParams(filters) {
  const params = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom.toISOString();
  if (filters.dateTo)   params.dateTo   = filters.dateTo.toISOString();
  if (filters.userId)   params.userId   = filters.userId;
  if (filters.eventType) params.eventType = filters.eventType;
  return params;
}
```

---

## Шаг 3. ActivityPage

`src/pages/activity/ActivityPage.vue`:

```vue
<template>
  <div class="p-4">
    <div class="flex justify-content-between align-items-center mb-4">
      <h2>Лента активности</h2>
      <Button
        v-if="activity.hasActiveFilters"
        label="Сбросить фильтры"
        text
        @click="activity.resetFilters()"
      />
    </div>

    <ActivityFilters @change="activity.fetchLogs(true)" />

    <div v-if="activity.isLoading && !activity.logs.length" class="text-center py-6">
      <ProgressSpinner style="width: 40px; height: 40px" />
    </div>

    <div v-else-if="!activity.logs.length" class="text-center text-color-secondary py-6">
      Событий нет
    </div>

    <div v-else class="mt-3">
      <ActivityLogItem
        v-for="log in activity.logs"
        :key="log.id"
        :log="log"
        class="mb-2"
      />

      <div class="text-center mt-4">
        <Button
          v-if="activity.logs.length < activity.pagination.total"
          label="Загрузить ещё"
          outlined
          :loading="activity.isLoading"
          @click="activity.loadMore()"
        />
        <span v-else class="text-color-secondary text-sm">
          Показано все {{ activity.pagination.total }} событий
        </span>
      </div>
    </div>
  </div>
</template>

<script>
import { defineOptions, onMounted } from 'vue';
import { useActivityStore } from '@/stores/activity.store.js';
import ActivityFilters from '@/pages/activity/components/ActivityFilters.vue';
import ActivityLogItem from '@/components/ActivityLogItem.vue';

defineOptions({ name: 'ActivityPage' });

const activity = useActivityStore();
onMounted(() => activity.fetchLogs(true));
</script>
```

---

## Шаг 4. ActivityFilters

`src/pages/activity/components/ActivityFilters.vue`:

```vue
<template>
  <div class="flex flex-wrap gap-2 mb-3">
    <Calendar
      v-model="dateFrom"
      placeholder="От"
      showIcon
      dateFormat="dd.mm.yy"
      style="width: 160px"
      @date-select="onFilterChange"
    />
    <Calendar
      v-model="dateTo"
      placeholder="До"
      showIcon
      dateFormat="dd.mm.yy"
      style="width: 160px"
      @date-select="onFilterChange"
    />
    <Dropdown
      v-model="eventType"
      :options="EVENT_TYPE_OPTIONS"
      optionLabel="label"
      optionValue="value"
      placeholder="Тип события"
      showClear
      style="min-width: 200px"
      @change="onFilterChange"
    />
  </div>
</template>

<script>
import { defineOptions, defineEmits, computed } from 'vue';
import { useActivityStore } from '@/stores/activity.store.js';

defineOptions({ name: 'ActivityFilters' });

const emit = defineEmits(['change']);

const EVENT_TYPE_OPTIONS = [
  { label: 'Растение создано', value: 'plant.created' },
  { label: 'Растение изменено', value: 'plant.updated' },
  { label: 'Растение удалено', value: 'plant.deleted' },
  { label: 'Смена статуса', value: 'plant.status_changed' },
  { label: 'Операция добавлена', value: 'operation.created' },
  { label: 'Фото прикреплено', value: 'photo.attached' },
  { label: 'Движение записано', value: 'movement.created' },
  { label: 'Локация создана', value: 'location.created' },
  { label: 'Сотрудник добавлен', value: 'user.created' },
  { label: 'Роль изменена', value: 'user.role_changed' },
  { label: 'Вход в систему', value: 'auth.login' },
];

const activity = useActivityStore();

const dateFrom = computed({
  get: () => activity.filters.dateFrom,
  set: (v) => activity.setFilter('dateFrom', v),
});

const dateTo = computed({
  get: () => activity.filters.dateTo,
  set: (v) => activity.setFilter('dateTo', v),
});

const eventType = computed({
  get: () => activity.filters.eventType,
  set: (v) => activity.setFilter('eventType', v),
});

function onFilterChange() {
  emit('change');
}
</script>
```

---

## Шаг 5. ActivityLogItem (переиспользуемый)

`src/components/ActivityLogItem.vue`:

```vue
<template>
  <div class="surface-card p-3 border-round flex align-items-start gap-3">
    <div
      class="flex-shrink-0 flex align-items-center justify-content-center border-circle w-2rem h-2rem"
      :style="{ background: EVENT_COLORS[log.event_type] || '#9ca3af' }"
    >
      <i :class="EVENT_ICONS[log.event_type] || 'pi pi-circle'" style="color: white; font-size: 13px" />
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex justify-content-between align-items-start">
        <div>
          <span class="font-medium text-sm">{{ EVENT_LABELS[log.event_type] || log.event_type }}</span>
          <span v-if="log.user_name" class="text-color-secondary text-sm ml-2">· {{ log.user_name }}</span>
        </div>
        <span class="text-color-secondary text-xs flex-shrink-0 ml-2">
          {{ formatDate(log.created_at) }}
        </span>
      </div>

      <!-- Details: movement -->
      <div v-if="log.event_type === 'movement.created' && log.details" class="text-sm text-color-secondary mt-1">
        {{ log.details.type_name }}
        <span v-if="log.details.plant_qr"> · {{ log.details.plant_qr }}</span>
      </div>

      <!-- Details: transplant (operation) -->
      <div v-if="log.event_type === 'operation.created' && log.details?.type === 'transplant'" class="text-sm text-color-secondary mt-1">
        Пересадка: {{ log.details.from_container || '—' }} → {{ log.details.to_container || '—' }}
      </div>

      <!-- Details: status change -->
      <div v-if="log.event_type === 'plant.status_changed' && log.details" class="text-sm text-color-secondary mt-1">
        {{ STATUS_LABELS[log.details.from] || log.details.from }} →
        {{ STATUS_LABELS[log.details.to] || log.details.to }}
      </div>

      <!-- Entity link -->
      <div v-if="log.entity_type === 'plant' && log.entity_id" class="mt-1">
        <Button
          label="Открыть растение"
          text
          size="small"
          class="p-0"
          @click="router.push(`/plants/${log.entity_id}`)"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { defineOptions, defineProps } from 'vue';
import { useRouter } from 'vue-router';

defineOptions({ name: 'ActivityLogItem' });

defineProps({ log: { type: Object, required: true } });

const router = useRouter();

const EVENT_LABELS = {
  'plant.created':       'Растение создано',
  'plant.updated':       'Растение изменено',
  'plant.deleted':       'Растение удалено',
  'plant.restored':      'Растение восстановлено',
  'plant.status_changed':'Статус изменён',
  'operation.created':   'Операция добавлена',
  'operation.deleted':   'Операция удалена',
  'photo.attached':      'Фото прикреплено',
  'movement.created':    'Движение записано',
  'location.created':    'Локация создана',
  'location.updated':    'Локация изменена',
  'location.deleted':    'Локация удалена',
  'user.created':        'Сотрудник добавлен',
  'user.deactivated':    'Сотрудник деактивирован',
  'user.role_changed':   'Роль изменена',
  'auth.login':          'Вход в систему',
};

const EVENT_ICONS = {
  'plant.created':       'pi pi-plus',
  'plant.deleted':       'pi pi-trash',
  'plant.status_changed':'pi pi-refresh',
  'operation.created':   'pi pi-cog',
  'photo.attached':      'pi pi-image',
  'movement.created':    'pi pi-arrows-h',
  'location.created':    'pi pi-map-marker',
  'user.created':        'pi pi-user-plus',
  'auth.login':          'pi pi-sign-in',
};

const EVENT_COLORS = {
  'plant.created':       '#10b981',
  'plant.deleted':       '#ef4444',
  'plant.status_changed':'#f59e0b',
  'operation.created':   '#6366f1',
  'movement.created':    '#3b82f6',
  'auth.login':          '#8b5cf6',
};

const STATUS_LABELS = {
  growing: 'В росте', storage: 'На хранении', sold: 'Продано', written_off: 'Списано',
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Лента доступна всем ролям | Войти как observer → страница открывается |
| 2 | Фильтр по типу события работает | Выбрать `plant.created` → только эти события |
| 3 | Фильтр по дате работает | Выбрать диапазон → события только за этот период |
| 4 | «Загрузить ещё» подгружает следующую страницу | Нажать → появляются новые записи |
| 5 | Движение отображает тип движения из `details` | Запись `movement.created` → имя типа видно |
| 6 | Пересадка показывает смену контейнера | Запись `operation.created` с `transplant` → from/to |
| 7 | Кнопка «Открыть растение» ведёт на карточку | Нажать → переход на `/plants/:id` |
