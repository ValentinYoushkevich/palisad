# MODULE_1 — Frontend: Dexie Offline Store

**Зависит от:** MODULE_0

---

## Шаг 1. Установка зависимостей

```bash
npm install dexie
```

---

## Шаг 2. Схема Dexie

`src/db/indexedDb.js`:

```js
import Dexie from 'dexie';

export const db = new Dexie('PalisadDB');

db.version(1).stores({
  plants:          'id, nursery_id, species_id, location_id, container_id, qr_code, numeric_code, status, deleted_at',
  locations:       'id, nursery_id, parent_id, type',
  species:         'id, nursery_id, gbif_id',
  tags:            'id, nursery_id, is_active',
  movement_types:  'id, nursery_id, is_system, is_active',
  container_types: 'id, nursery_id, is_system, is_active, container_kind',
  operations:      'id, plant_id, type, deleted_at',
  movements:       'id, plant_id, type_id',
  pending_photos:  '++localId, operation_id, status',
  sync_queue:      '++id, type, status, timestamp',
});

export default db;
```

> Индексы в Dexie перечисляются через запятую — только те поля по которым будет фильтрация или сортировка. Остальные данные хранятся в объекте записи.

---

## Шаг 3. Утилиты работы с Dexie

`src/db/dbUtils.js`:

```js
import db from '@/db/indexedDb.js';

export async function upsertMany(table, records) {
  if (!records.length) return;
  await db[table].bulkPut(records);
}

export async function clearTable(table) {
  await db[table].clear();
}

export async function getAll(table) {
  return db[table].toArray();
}

export async function getById(table, id) {
  return db[table].get(id);
}

export async function deleteById(table, id) {
  return db[table].delete(id);
}
```

---

## Шаг 4. sync_queue — сервис очереди

`src/db/syncQueue.service.js`:

```js
import db from '@/db/indexedDb.js';

// Типы очереди:
// 'create_operation' | 'update_operation' | 'delete_operation'
// 'create_movement'  | 'delete_movement'
// 'attach_photo'

export async function addToQueue(type, payload) {
  await db.sync_queue.add({
    type,
    payload,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  });
}

export async function getPending() {
  return db.sync_queue
    .where('status')
    .equals('pending')
    .sortBy('timestamp');
}

export async function markFailed(id) {
  const item = await db.sync_queue.get(id);
  if (!item) return;
  await db.sync_queue.update(id, {
    retries: item.retries + 1,
    status: item.retries + 1 >= 3 ? 'failed' : 'pending',
  });
}

export async function markDone(id) {
  await db.sync_queue.delete(id);
}

export async function getFailedCount() {
  return db.sync_queue.where('status').equals('failed').count();
}

export async function retryFailed() {
  await db.sync_queue
    .where('status')
    .equals('failed')
    .modify({ status: 'pending', retries: 0 });
}
```

---

## Шаг 5. pending_photos — хранение Blob офлайн

`src/db/pendingPhotos.service.js`:

```js
import db from '@/db/indexedDb.js';

export async function savePhoto(operationId, file) {
  const localId = await db.pending_photos.add({
    operation_id: operationId,
    blob: file,
    mime_type: file.type,
    status: 'pending',
    created_at: Date.now(),
  });
  return localId;
}

export async function getPendingPhotos() {
  return db.pending_photos.where('status').equals('pending').toArray();
}

export async function markPhotoDone(localId) {
  await db.pending_photos.delete(localId);
}

export async function markPhotoFailed(localId) {
  await db.pending_photos.update(localId, { status: 'failed' });
}
```

---

## Шаг 6. useOnlineStatus composable

`src/composables/useOnlineStatus.js`:

```js
import { ref, onMounted, onUnmounted } from 'vue';

export function useOnlineStatus() {
  const isOnline = ref(navigator.onLine);

  const handleOnline = () => { isOnline.value = true; };
  const handleOffline = () => { isOnline.value = false; };

  onMounted(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  });

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  return { isOnline };
}
```

---

## Шаг 7. Инициализация DB при старте приложения

В `src/main.js` или `src/app.js` — убедиться что DB открывается до монтирования:

```js
import db from '@/db/indexedDb.js';

db.open().catch(err => {
  console.error('Dexie open failed:', err);
});
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Все таблицы созданы в Dexie | DevTools → Application → IndexedDB → PalisadDB |
| 2 | `upsertMany` сохраняет и обновляет записи | Вызвать дважды с одним `id` — дубля нет |
| 3 | `addToQueue` создаёт запись со статусом `pending` | Проверить в DevTools после офлайн-операции |
| 4 | `markFailed` переводит в `failed` при `retries >= 3` | Вызвать 3 раза — статус `failed` |
| 5 | `savePhoto` сохраняет Blob | Проверить `pending_photos` в DevTools |
| 6 | `isOnline` реагирует на события сети | Включить/выключить сеть в DevTools → значение меняется |
