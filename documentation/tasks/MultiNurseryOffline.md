# MultiNursery · Offline — один активный питомник в кэше + гард при переключении

> Этап 1 v2 · задача 5/5. Зависит от [`MultiNurseryFrontendSwitcher.md`](MultiNurseryFrontendSwitcher.md)
> (композабл `useNurserySwitch`, действие `switchNursery`). Общий дизайн — в backend-core.

## Чего хотим достичь (простой вариант из роадмапа)

- Офлайн-кэш (Dexie) держит данные **одного активного питомника** за раз.
- Перед переключением — **гард**: если есть несинхронизированные изменения (`sync_queue`),
  переключение блокируется до синхронизации; переключение требует сети (онлайн).
- При переключении локальные доменные таблицы очищаются, и контекст пере-инициализируется
  под новый питомник (пере-синхронизация/предзагрузка штатными механизмами сторов, как при логине).

## Решение (зафиксировано на брейншторминге)

«Требовать синхронизацию перед сменой»: при наличии pending/failed в `sync_queue` сначала
пытаемся синхронизировать; если не удалось (офлайн или остались записи) — переключение
отменяется с понятным сообщением.

## Текущее состояние (факты по коду)

- `frontend/src/db/indexedDb.js` — Dexie `PalisadDB`, доменные таблицы и `sync_queue`.
- `frontend/src/db/syncQueue.service.js` — `getPending()`, `getFailedCount()`.
- `frontend/src/composables/useSyncManager.js` — `processQueue()`, `syncStatus`; использует
  `useOnlineStatus` и `useToast` (вызываются на этапе setup).
- `frontend/src/composables/useOnlineStatus.js` — `isOnline` (ref).
- `frontend/src/stores/auth.store.js:233-248` — приватный `clearLocalDb()` со списком таблиц
  (тот же список нужен для очистки при переключении — выносим в общий util, DRY).
- `useNurserySwitch.js` (создан в задаче 4) — заглушки `ensureCanSwitch`/`reloadInNewContext`.

## План

### Шаг 1. Общий util очистки доменных таблиц (DRY)

В `frontend/src/db/indexedDb.js` добавить:

```js
export const DOMAIN_TABLES = [
  'plants',
  'locations',
  'species',
  'tags',
  'movement_types',
  'container_types',
  'operations',
  'movements',
  'pending_photos',
  'sync_queue',
]

export async function clearDomainTables() {
  await Promise.all(DOMAIN_TABLES.map((name) => db.table(name).clear()))
}
```

Отрефакторить `frontend/src/stores/auth.store.js`:
- импорт: `import db, { clearDomainTables } from '@/db/indexedDb'`
- удалить локальную функцию `clearLocalDb` (строки 233-248) и заменить её вызов в `logout`
  (`await clearLocalDb()`) на `await clearDomainTables()`.

### Шаг 2. Реализовать гард и очистку в `useNurserySwitch`

Переписать `frontend/src/composables/useNurserySwitch.js` — перенести зависимости на верх
композабла (setup-контекст), заполнить тела:

```js
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useSyncManager } from '@/composables/useSyncManager'
import { clearDomainTables } from '@/db/indexedDb'
import { getFailedCount, getPending } from '@/db/syncQueue.service'
import { useNurseryStore } from '@/stores/nursery.store'

export function useNurserySwitch() {
  const nurseryStore = useNurseryStore()
  const { isOnline } = useOnlineStatus()
  const { processQueue } = useSyncManager()

  async function hasUnsynced() {
    const pending = await getPending()
    const failed = await getFailedCount()
    return pending.length > 0 || failed > 0
  }

  async function ensureCanSwitch() {
    if (!isOnline.value) {
      return { ok: false, error: 'Переключение питомника недоступно офлайн.' }
    }
    if (await hasUnsynced()) {
      await processQueue() // попытка синхронизировать
      if (await hasUnsynced()) {
        return {
          ok: false,
          error: 'Есть несинхронизированные изменения. Дождитесь синхронизации и повторите.',
        }
      }
    }
    return { ok: true }
  }

  async function reloadInNewContext() {
    await clearDomainTables()
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

    await reloadInNewContext()
    return { ok: true }
  }

  return { switchTo, ensureCanSwitch }
}
```

(Тело `switchTo` относительно задачи 4 меняется только в одной строке: `await reloadInNewContext()`.)

### Шаг 3. Проверка офлайн-сценариев (ручная)

- Сборка/линт: `cd frontend && npm run build` — без ошибок.
- Онлайн без изменений: переключение проходит, Dexie очищается, открывается `/plants` нового питомника.
- Несинхронизированные изменения (создать операцию офлайн, не дать синхронизироваться):
  попытка переключения → toast «Есть несинхронизированные изменения…», активный питомник не меняется.
- Офлайн (DevTools → Offline): попытка переключения → toast «недоступно офлайн», без смены.
- После успешного переключения офлайн-кэш наполняется данными нового питомника при заходе на
  страницы (как при первом входе).

### Шаг 4. Коммит

```bash
git add frontend/src/db/indexedDb.js frontend/src/stores/auth.store.js frontend/src/composables/useNurserySwitch.js
git commit -m "feat(frontend): офлайн-кэш на один питомник + гард синхронизации при переключении"
```

## Критерии готовности

- [ ] Перед переключением проверяется `sync_queue`; при несинхронизированных изменениях — блок + сообщение.
- [ ] Переключение требует онлайн (попытка офлайн — блок + сообщение).
- [ ] При переключении доменные таблицы Dexie очищаются, контекст пере-инициализируется под новый питомник.
- [ ] Список таблиц очистки вынесен в общий util (`clearDomainTables`), `auth.store` использует его.
- [ ] `npm run build`/`lint` без ошибок; ручные офлайн-сценарии пройдены.

## Затронутые файлы

- Modify: `frontend/src/db/indexedDb.js`, `frontend/src/stores/auth.store.js`,
  `frontend/src/composables/useNurserySwitch.js`

## Результаты

**Статус:** реализовано (2026-06-14).

Сделано по плану:
- `indexedDb.js`: экспортированы `DOMAIN_TABLES` и `clearDomainTables()` (DRY).
- `auth.store`: локальный `clearLocalDb` удалён, `logout` использует `clearDomainTables()`;
  импорт сведён к именованному (default `db` больше не нужен).
- `useNurserySwitch`: реальный `ensureCanSwitch` — блок при офлайне и при несинхронизированных
  изменениях (`sync_queue`: pending/failed) с попыткой `processQueue`; `reloadInNewContext`
  очищает доменные таблицы Dexie и перезапускает контекст на `/plants`.
  Зависимости (`useOnlineStatus`, `useSyncManager`) инстанцируются на верхнем уровне композабла
  (setup-контекст) — корректно для их lifecycle-хуков/`useToast`.

Результат проверки: ESLint по изменённым файлам — чисто; `npm run build` — успешно.
Бэкенд без изменений в этой задаче (138/138 остаются зелёными).
