# MODULE_3 — Frontend: Nursery and Subscription

**Зависит от:** MODULE_2

---

## Шаг 1. API-функции

`src/api/nursery.api.js`:

```js
import api from '@/api/index.js';

export const nurseryApi = {
  create:  (data) => api.post('/nurseries', data),
  getMy:   () => api.get('/nurseries/my'),
  update:  (data) => api.patch('/nurseries/my', data),
};
```

`src/api/subscription.api.js`:

```js
import api from '@/api/index.js';

export const subscriptionApi = {
  getCurrent: () => api.get('/subscriptions/current'),
  getPlans:   () => api.get('/plans'),
  change:     (planId) => api.post('/subscriptions/change', { planId }),
};
```

---

## Шаг 2. Pinia store

`src/stores/nursery.store.js`:

```js
import { defineStore } from 'pinia';
import { nurseryApi } from '@/api/nursery.api.js';
import { subscriptionApi } from '@/api/subscription.api.js';

export const useNurseryStore = defineStore('nursery', {
  state: () => ({
    nursery: null,
    subscription: null,
    plans: [],
    isLoading: false,
  }),

  getters: {
    nurseryId: (state) => state.nursery?.id,

    planFeatures: (state) => state.subscription ?? {},

    plantLimit:  (state) => state.subscription?.plant_limit ?? 300,
    userLimit:   (state) => state.subscription?.user_limit ?? 2,

    hasFeature: (state) => (feature) => {
      if (!state.subscription) return false;
      return !!state.subscription[feature];
    },
  },

  actions: {
    async fetchNursery() {
      this.isLoading = true;
      try {
        const { data } = await nurseryApi.getMy();
        this.nursery = data;
      } catch (err) {
        if (err.response?.status === 404) {
          this.nursery = null;
        }
      } finally {
        this.isLoading = false;
      }
    },

    async createNursery(formData) {
      this.isLoading = true;
      try {
        const { data } = await nurseryApi.create(formData);
        this.nursery = data;
      } finally {
        this.isLoading = false;
      }
    },

    async updateNursery(formData) {
      this.isLoading = true;
      try {
        const { data } = await nurseryApi.update(formData);
        this.nursery = data;
      } finally {
        this.isLoading = false;
      }
    },

    async fetchSubscription() {
      const { data } = await subscriptionApi.getCurrent();
      this.subscription = data;
    },

    async fetchPlans() {
      const { data } = await subscriptionApi.getPlans();
      this.plans = data;
    },

    async changePlan(planId) {
      this.isLoading = true;
      try {
        await subscriptionApi.change(planId);
        await this.fetchSubscription();
      } finally {
        this.isLoading = false;
      }
    },
  },
});
```

---

## Шаг 3. CreateNurseryPage

`src/pages/nursery/CreateNurseryPage.vue`:

```vue
<template>
  <div class="flex align-items-center justify-content-center min-h-screen">
    <div class="surface-card p-4 border-round w-full" style="max-width: 480px">
      <h2 class="mb-4">Создание питомника</h2>

      <div class="field mb-3">
        <label>Название *</label>
        <InputText v-model="form.name" class="w-full" placeholder="Мой питомник" />
      </div>

      <div class="field mb-4">
        <label>Адрес</label>
        <Textarea v-model="form.address" class="w-full" rows="2" />
      </div>

      <Button label="Создать питомник" class="w-full" :loading="nursery.isLoading" @click="handleCreate" />
      <p v-if="error" class="text-red-500 mt-2">{{ error }}</p>
    </div>
  </div>
</template>

<script>
import { defineOptions, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useNurseryStore } from '@/stores/nursery.store.js';

defineOptions({ name: 'CreateNurseryPage' });

const router = useRouter();
const nursery = useNurseryStore();
const form = ref({ name: '', address: '' });
const error = ref('');

async function handleCreate() {
  if (!form.value.name.trim()) { error.value = 'Введите название'; return; }
  try {
    await nursery.createNursery(form.value);
    router.push('/plants');
  } catch (err) {
    error.value = err.response?.data?.error || 'Ошибка создания';
  }
}
</script>
```

---

## Шаг 4. NurserySettingsPage + NurseryEditDialog

`src/pages/nursery/NurserySettingsPage.vue`:

```vue
<template>
  <div class="p-4">
    <h2>Настройки питомника</h2>

    <div v-if="nursery.nursery" class="surface-card p-4 border-round mb-4">
      <p><strong>Название:</strong> {{ nursery.nursery.name }}</p>
      <p><strong>Адрес:</strong> {{ nursery.nursery.address || '—' }}</p>
      <Button label="Редактировать" outlined class="mt-2" @click="editVisible = true" />
    </div>

    <div class="surface-card p-4 border-round">
      <h3>Тариф</h3>
      <p>Текущий план: <strong>{{ nursery.subscription?.name }}</strong></p>
      <p>Растений: до {{ nursery.plantLimit ?? '∞' }}</p>
      <p>Пользователей: до {{ nursery.userLimit ?? '∞' }}</p>
      <Button
        v-if="auth.isOwner"
        label="Сменить план"
        outlined
        class="mt-2"
        @click="planVisible = true"
      />
    </div>

    <NurseryEditDialog v-model:visible="editVisible" />
  </div>
</template>

<script>
import { defineOptions, ref } from 'vue';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { useAuthStore } from '@/stores/auth.store.js';
import NurseryEditDialog from '@/pages/nursery/components/NurseryEditDialog.vue';

defineOptions({ name: 'NurserySettingsPage' });

const nursery = useNurseryStore();
const auth = useAuthStore();
const editVisible = ref(false);
const planVisible = ref(false);
</script>
```

`src/pages/nursery/components/NurseryEditDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Редактирование питомника" modal style="width: 440px">
    <div class="field mb-3">
      <label>Название</label>
      <InputText v-model="form.name" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Адрес</label>
      <Textarea v-model="form.address" class="w-full" rows="2" />
    </div>
    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Сохранить" :loading="nursery.isLoading" @click="handleSave" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref, watch } from 'vue';
import { useNurseryStore } from '@/stores/nursery.store.js';

defineOptions({ name: 'NurseryEditDialog' });

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['update:visible']);

const nursery = useNurseryStore();
const form = ref({ name: '', address: '' });

watch(() => props.visible, (val) => {
  if (val && nursery.nursery) {
    form.value = { name: nursery.nursery.name, address: nursery.nursery.address ?? '' };
  }
});

async function handleSave() {
  await nursery.updateNursery(form.value);
  emit('update:visible', false);
}
</script>
```

---

## Шаг 5. Feature gating — пример использования

В любом компоненте:

```vue
<template>
  <!-- Кнопка видна только если feature_tags включена -->
  <Button v-if="nursery.hasFeature('feature_tags')" label="Добавить тег" @click="..." />

  <!-- Блокировка создания при достижении лимита -->
  <Button
    label="Добавить растение"
    :disabled="plants.length >= nursery.plantLimit"
    @click="..."
  />
</template>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Пользователь без питомника попадает на `/nursery/create` | Войти с новым аккаунтом → редирект |
| 2 | После создания питомника доступен `/plants` | Создать → попасть на список |
| 3 | `hasFeature('feature_tags')` возвращает `false` на плане `free` | Проверить через DevTools стор |
| 4 | `plantLimit` и `userLimit` берутся из подписки | Смотреть `nursery.subscription` в DevTools |
| 5 | Смена плана обновляет `subscription` в сторе | Сменить → `hasFeature` возвращает новые значения |
| 6 | Редактирование питомника сохраняет данные | `PATCH /api/nurseries/my` → данные обновились |
