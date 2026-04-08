# MODULE_2 — Frontend: Authentication

**Зависит от:** MODULE_1

---

## Шаг 1. Правило слоя Store

- Отдельные API-модули в `src/api/*` не создаются.
- Все HTTP-методы по сущности `auth` реализуются прямо в `src/stores/auth.store.js`.
- `try/catch` для API-запросов размещается в actions store.
- UI-слой (страницы/компоненты) не содержит `try/catch` для сетевых запросов и работает через результат actions.

---

## Шаг 2. Pinia store

`src/stores/auth.store.js`:

```js
import { defineStore } from 'pinia';
import http from '@/services/http.js';
import { useRouter } from 'vue-router';
import db from '@/db/indexedDb.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isLoading: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    isOwner:          (state) => state.user?.role === 'owner',
    isAgronomist:     (state) => state.user?.role === 'agronomist',
    isWorker:         (state) => state.user?.role === 'worker',
    isObserver:       (state) => state.user?.role === 'observer',
    canWrite:         (state) => ['owner', 'agronomist', 'worker'].includes(state.user?.role),
    canManageStructure: (state) => ['owner', 'agronomist'].includes(state.user?.role),
    canManageStaff:   (state) => state.user?.role === 'owner',
  },

  actions: {
    async login(email, password) {
      this.isLoading = true;
      try {
        const { data } = await http.post('/auth/login', { email, password });
        this.user = data.user;

        if (data.mustChangePassword) {
          return { redirect: '/change-password' };
        }
        return { redirect: '/plants' };
      } finally {
        this.isLoading = false;
      }
    },

    async logout() {
      try {
        await http.post('/auth/logout');
      } finally {
        this.user = null;
        await clearLocalDb();
      }
    },

    async initAuth() {
      try {
        const { data } = await http.post('/auth/refresh');
        this.user = data.user;
      } catch {
        this.user = null;
      }
    },

    async changePassword(currentPassword, newPassword) {
      this.isLoading = true;
      try {
        await http.post('/auth/change-password', { currentPassword, newPassword });
        if (this.user) {
          this.user = { ...this.user, mustChangePassword: false };
        }
      } finally {
        this.isLoading = false;
      }
    },
  },
});

async function clearLocalDb() {
  const tables = ['plants', 'locations', 'species', 'tags',
    'movement_types', 'container_types', 'operations',
    'movements', 'pending_photos', 'sync_queue'];
  await Promise.all(tables.map(t => db[t].clear()));
}
```

---

## Шаг 3. Router guard

`src/router/index.js`:

```js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store.js';

const routes = [
  { path: '/login', component: () => import('@/pages/auth/LoginPage.vue'), meta: { public: true } },
  { path: '/change-password', component: () => import('@/pages/auth/ChangePasswordPage.vue'), meta: { public: true } },
  { path: '/plants', component: () => import('@/pages/plants/PlantsPage.vue') },
  { path: '/plants/:id', component: () => import('@/pages/plants/PlantDetailPage.vue') },
  { path: '/nursery/create', component: () => import('@/pages/nursery/CreateNurseryPage.vue') },
  { path: '/nursery/settings', component: () => import('@/pages/nursery/NurserySettingsPage.vue') },
  { path: '/staff', component: () => import('@/pages/staff/StaffPage.vue') },
  { path: '/locations', component: () => import('@/pages/locations/LocationsPage.vue') },
  { path: '/catalog', component: () => import('@/pages/catalog/CatalogPage.vue') },
  { path: '/scanner', component: () => import('@/pages/scanner/ScannerPage.vue') },
  { path: '/labels', component: () => import('@/pages/labels/LabelsPage.vue') },
  { path: '/activity', component: () => import('@/pages/activity/ActivityPage.vue') },
  { path: '/', redirect: '/plants' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.isAuthenticated) {
    await auth.initAuth();
  }

  if (!to.meta.public && !auth.isAuthenticated) {
    return '/login';
  }

  if (auth.user?.mustChangePassword && to.path !== '/change-password') {
    return '/change-password';
  }
});

export default router;
```

---

## Шаг 4. LoginPage

`src/pages/auth/LoginPage.vue`:

```vue
<template>
  <div class="flex align-items-center justify-content-center min-h-screen">
    <div class="surface-card p-4 border-round w-full" style="max-width: 400px">
      <h2 class="text-center mb-4">Вход в систему</h2>

      <div class="field mb-3">
        <label>Email</label>
        <InputText v-model="form.email" type="email" class="w-full" />
      </div>

      <div class="field mb-4">
        <label>Пароль</label>
        <Password v-model="form.password" :feedback="false" class="w-full" inputClass="w-full" />
      </div>

      <Button
        label="Войти"
        class="w-full"
        :loading="auth.isLoading"
        @click="handleLogin"
      />

      <p v-if="error" class="text-red-500 text-center mt-3">{{ error }}</p>
    </div>
  </div>
</template>

<script>
import { defineOptions, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store.js';

defineOptions({ name: 'LoginPage' });

const router = useRouter();
const auth = useAuthStore();

const form = ref({ email: '', password: '' });
const error = ref('');

async function handleLogin() {
  error.value = '';
  try {
    const result = await auth.login(form.value.email, form.value.password);
    router.push(result.redirect);
  } catch (err) {
    error.value = err.response?.data?.error || 'Ошибка входа';
  }
}
</script>
```

---

## Шаг 5. ChangePasswordPage

`src/pages/auth/ChangePasswordPage.vue`:

```vue
<template>
  <div class="flex align-items-center justify-content-center min-h-screen">
    <div class="surface-card p-4 border-round w-full" style="max-width: 400px">
      <h2 class="text-center mb-4">Смена пароля</h2>
      <p class="text-center text-color-secondary mb-4">
        Вы вошли с временным паролем. Задайте постоянный.
      </p>

      <div class="field mb-3">
        <label>Текущий пароль</label>
        <Password v-model="form.currentPassword" :feedback="false" class="w-full" inputClass="w-full" />
      </div>

      <div class="field mb-3">
        <label>Новый пароль</label>
        <Password v-model="form.newPassword" class="w-full" inputClass="w-full" />
      </div>

      <div class="field mb-4">
        <label>Повторите пароль</label>
        <Password v-model="form.confirmPassword" :feedback="false" class="w-full" inputClass="w-full" />
      </div>

      <Button
        label="Сохранить"
        class="w-full"
        :loading="auth.isLoading"
        @click="handleSubmit"
      />

      <p v-if="error" class="text-red-500 text-center mt-3">{{ error }}</p>
    </div>
  </div>
</template>

<script>
import { defineOptions, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store.js';

defineOptions({ name: 'ChangePasswordPage' });

const router = useRouter();
const auth = useAuthStore();

const form = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const error = ref('');

async function handleSubmit() {
  error.value = '';
  if (form.value.newPassword !== form.value.confirmPassword) {
    error.value = 'Пароли не совпадают';
    return;
  }
  try {
    await auth.changePassword(form.value.currentPassword, form.value.newPassword);
    router.push('/plants');
  } catch (err) {
    error.value = err.response?.data?.error || 'Ошибка смены пароля';
  }
}
</script>
```

---

## Layout & Navigation Contract

- Роли: `owner`, `agronomist`, `worker`, `observer`.
- В `header` обязательно выводятся:
  - название системы (слева);
  - имя пользователя, его роль(и), кнопка `Выход` (справа).
- В `sidebar` действует единое правило:
  - `Общий доступ` — пункты, видимые как минимум одной не-owner роли;
  - `Администрирование` — owner-only пункты.
- Router guard должен проверять не только авторизацию, но и role-access для owner-only маршрутов (минимум `/staff`).

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Login создаёт сессию | `POST /api/auth/login` → `user` в сторе заполнен |
| 2 | `must_change_password = true` → редирект на `/change-password` | Войти с флагом → попасть на страницу смены |
| 3 | Guard блокирует незалогиненного | Открыть `/plants` без сессии → редирект на `/login` |
| 4 | `initAuth` восстанавливает сессию при перезагрузке | Обновить страницу → `user` восстановлен через refresh |
| 5 | Logout очищает стор и Dexie | Выйти → `user = null`, IndexedDB пустой |
| 6 | Role getters корректны | `isOwner`, `canWrite` возвращают правильные значения |
| 7 | Смена пароля сбрасывает `mustChangePassword` | После смены — доступна навигация |
| 8 | Owner-only route недоступен не-owner | Войти как `worker` и открыть `/staff` → редирект на `/plants` |
