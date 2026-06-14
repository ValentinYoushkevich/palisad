# MultiNursery · Frontend — переключатель активного питомника

> Этап 1 v2 · задача 4/5. Зависит от [`MultiNurseryBackendCore.md`](MultiNurseryBackendCore.md)
> (endpoints `GET /nurseries`, `POST /:id/switch`). Офлайн-гард и очистка кэша — отдельной
> задачей [`MultiNurseryOffline.md`](MultiNurseryOffline.md). Общий дизайн — в backend-core.

## Чего хотим достичь

- В `nursery.store` хранится список питомников и активный питомник.
- В шапке `AppLayout` — переключатель активного питомника (+ пункт «Создать питомник»).
- Переключение дёргает `POST /nurseries/:id/switch` (перевыпуск токена на сервере) и
  пере-инициализирует приложение под новый питомник.
- `nurseryId` уже подставляется во все запросы из `nursery.store` — проверить аудитом.

## Текущее состояние (факты по коду)

- `frontend/src/stores/nursery.store.js` — хранит один `nursery`; геттер `nurseryId = nursery?.id`;
  `initNurseryContext` грузит `fetchNursery` + `fetchSubscription`.
- `frontend/src/stores/auth.store.js` — `setUser`; сессия восстанавливается через `initAuth` (`/auth/refresh`).
- `frontend/src/layouts/AppLayout.vue` — шапка `layout__userPanel`; в nav есть пункт
  «Создать питомник» с `visible: ... && !nurseryStore.nursery`.
- Все доменные сторы (`plants.store`, `locations.store`, `operations.store`, `movements.store`,
  `activity.store`, `species.store`, `tags.store`, `movementTypes.store`, `containerTypes.store`,
  `staff.store`) строят URL из `nurseryStore.nurseryId`.

## Архитектура переключения

Чтобы не рассинхронизировать множество сторов и Dexie, переключение завершается
**ре-инициализацией приложения** под новый питомник (через переход/перезагрузку на `/plants`).
После этого `initAuth`(`/auth/refresh`) восстановит активный питомник и роль из перевыпущенного
токена, а `initNurseryContext` подтянет nursery + список. Логика разнесена так:

- `nursery.store.switchNursery(id)` — низкоуровневый вызов `POST /switch` (без локального
  пересбора состояния — его сделает ре-инициализация).
- `useNurserySwitch().switchTo(id)` — оркестрация: гард → `switchNursery` → перезапуск контекста.
  В этой задаче гард — заглушка `{ ok: true }` и перезапуск — навигация на `/plants`;
  офлайн-гард и очистку Dexie добавляет [`MultiNurseryOffline.md`](MultiNurseryOffline.md),
  меняя тела `ensureCanSwitch` и `reloadInNewContext`.

## План

### Шаг 1. `nursery.store` — список и переключение

В `frontend/src/stores/nursery.store.js`:

- в `state` добавить `nurseries: []`.
- добавить геттер-алиас (для читабельности UI): `activeNurseryId: (state) => state.nursery?.id || null`.
- добавить действия и расширить `initNurseryContext`/`resetState`:

```js
async fetchNurseries() {
  try {
    const response = await http.get('/nurseries')
    this.nurseries = response?.data || []
  } catch (error) {
    this.nurseryError = error?.response?.data?.error || 'Не удалось загрузить питомники.'
    throw error
  }
},
async switchNursery(nurseryId) {
  if (!nurseryId || nurseryId === this.activeNurseryId) {
    return { ok: true }
  }
  this.isLoading = true
  this.nurseryError = ''
  try {
    await http.post(`/nurseries/${nurseryId}/switch`)
    return { ok: true }
  } catch (error) {
    this.nurseryError = error?.response?.data?.error || 'Не удалось переключить питомник.'
    return { ok: false, error: this.nurseryError }
  } finally {
    this.isLoading = false
  }
},
```

- в `initNurseryContext` добавить `this.fetchNurseries()` в `Promise.all([...])`.
- в `createNursery` после успешного создания обновить список: добавить `await this.fetchNurseries()`
  перед `return { ok: true }`.
- в `resetState` добавить `this.nurseries = []`.

### Шаг 2. Композабл оркестрации `useNurserySwitch`

Создать `frontend/src/composables/useNurserySwitch.js`:

```js
import { useNurseryStore } from '@/stores/nursery.store'

// Офлайн-гард и очистка Dexie добавляются в задаче MultiNurseryOffline.md
// (меняются тела ensureCanSwitch и reloadInNewContext).
export function useNurserySwitch() {
  const nurseryStore = useNurseryStore()

  async function ensureCanSwitch() {
    return { ok: true }
  }

  function reloadInNewContext() {
    globalThis.location.assign('/plants')
  }

  async function switchTo(nurseryId) {
    if (!nurseryId || nurseryId === nurseryStore.activeNurseryId) {
      return { ok: true }
    }

    const guard = await ensureCanSwitch()
    if (!guard.ok) {
      return guard
    }

    const result = await nurseryStore.switchNursery(nurseryId)
    if (!result.ok) {
      return result
    }

    reloadInNewContext()
    return { ok: true }
  }

  return { switchTo, ensureCanSwitch }
}
```

### Шаг 3. Компонент переключателя

Создать `frontend/src/layouts/components/NurserySwitcher.vue`:

```vue
<template>
  <div v-if="nurseryStore.nurseries.length" class="switcher">
    <select
      class="switcher__select"
      :value="nurseryStore.activeNurseryId || ''"
      :disabled="nurseryStore.isLoading"
      @change="onChange"
    >
      <option v-for="n in nurseryStore.nurseries" :key="n.id" :value="n.id">
        {{ n.name }}
      </option>
    </select>
    <button class="switcher__add" type="button" title="Создать питомник" @click="goCreate">
      +
    </button>
  </div>
</template>

<script setup>
import { useNurserySwitch } from '@/composables/useNurserySwitch'
import { useNurseryStore } from '@/stores/nursery.store'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'

defineOptions({ name: 'NurserySwitcher' })

const nurseryStore = useNurseryStore()
const router = useRouter()
const toast = useToast()
const { switchTo } = useNurserySwitch()

async function onChange(event) {
  const nurseryId = event.target.value
  const result = await switchTo(nurseryId)
  if (!result.ok) {
    // вернуть селект к активному значению (переключение не состоялось)
    event.target.value = nurseryStore.activeNurseryId || ''
    toast.add({
      severity: 'warn',
      summary: 'Питомник не переключён',
      detail: result.error || 'Не удалось переключить питомник.',
      life: 6000,
    })
  }
}

function goCreate() {
  router.push('/nursery/create')
}
</script>

<style lang="scss" scoped>
.switcher {
  display: flex;
  align-items: center;
  gap: 6px;
}
.switcher__select {
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 8px;
  max-width: 200px;
}
.switcher__add {
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
</style>
```

> Можно заменить `<select>` на PrimeVue `Select`, чтобы попасть в дизайн-систему — но нативный
> вариант не зависит от версии PrimeVue и достаточен для MVP v2.

### Шаг 4. Встроить переключатель в `AppLayout`

В `frontend/src/layouts/AppLayout.vue`:

- импорт: `import NurserySwitcher from '@/layouts/components/NurserySwitcher.vue'`
- в шапке, в `div.layout__userPanel`, перед `SyncStatusBadge` добавить `<NurserySwitcher />`.
- в `commonNavItems` пункт «Создать питомник» сделать всегда доступным авторизованному
  (переключатель показывает список даже при наличии активного питомника):
  `visible: authStore.isAuthenticated` (вместо `... && !nurseryStore.nursery`).

### Шаг 5. Аудит `nurseryId` в запросах

- Run (PowerShell/Bash): `grep -rn "nurseries/\${" frontend/src` и `grep -rn "nurseryId" frontend/src/stores`.
- Ожидаемо: все доменные сторы берут `nurseryStore.nurseryId` (он = активный питомник).
  Если найдётся захардкоженный/закэшированный nurseryId — заменить на `nurseryStore.nurseryId`.
- Изменений кода не предполагается; шаг — подтверждение.

### Шаг 6. Проверка вручную + сборка

- Run: `cd frontend && npm run build` (или `npm run lint`) — без ошибок.
- Ручной сценарий: залогиниться → создать второй питомник → в шапке появился переключатель →
  переключиться обратно на первый → приложение перезагрузилось в контексте первого
  (растения/локации/справочники — данные первого питомника).

### Шаг 7. Коммит

```bash
git add frontend/src/stores/nursery.store.js frontend/src/composables/useNurserySwitch.js frontend/src/layouts/components/NurserySwitcher.vue frontend/src/layouts/AppLayout.vue
git commit -m "feat(frontend): переключатель активного питомника"
```

## Критерии готовности

- [ ] `nursery.store` хранит `nurseries` и активный питомник; есть `fetchNurseries`/`switchNursery`.
- [ ] Переключатель в шапке отображает список и активный питомник.
- [ ] Переключение вызывает `POST /switch` и пере-инициализирует приложение под новый питомник.
- [ ] «Создать питомник» доступен при наличии активного питомника.
- [ ] Все запросы используют активный `nurseryId` (аудит пройден).
- [ ] `npm run build`/`lint` без ошибок.

## Затронутые файлы

- Create: `frontend/src/composables/useNurserySwitch.js`,
  `frontend/src/layouts/components/NurserySwitcher.vue`
- Modify: `frontend/src/stores/nursery.store.js`, `frontend/src/layouts/AppLayout.vue`

## Результаты

**Статус:** реализовано (2026-06-14).

Сделано по плану:
- `nursery.store`: `nurseries[]`, геттер `activeNurseryId`, действия `fetchNurseries`/`switchNursery`;
  `initNurseryContext` грузит список, `createNursery` обновляет список, `resetState` чистит `nurseries`.
- `useNurserySwitch` — оркестрация (гард-заглушка + перезапуск на `/plants`); офлайн-логику добавит Задача 5.
- `NurserySwitcher.vue` — селект активного питомника + кнопка «создать»; встроен в шапку `AppLayout`.
- Пункт меню «Создать питомник» сделан всегда доступным авторизованному.
- Аудит: все доменные сторы используют `nurseryStore.nurseryId` (= активный) — правок не потребовалось.

Отклонение от плана: `<select>` обёрнут в `<label>` с подписью «Питомник» — требование
eslint-правила `vuejs-accessibility/form-control-has-label`.

Результат проверки: ESLint по изменённым файлам — чисто; `npm run build` — успешно (862 модуля).
