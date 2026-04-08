# MODULE_12 — Frontend: Offline Synchronization

**Зависит от:** MODULE_7, MODULE_8, MODULE_9

---

## Шаг 1. useSyncManager composable

`src/composables/useSyncManager.js`:

```js
import { ref, watch } from 'vue';
import { useOnlineStatus } from '@/composables/useOnlineStatus.js';
import { getPending, markDone, markFailed, getFailedCount } from '@/db/syncQueue.service.js';
import { getPendingPhotos, markPhotoDone, markPhotoFailed } from '@/db/pendingPhotos.service.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { useToast } from 'primevue/usetoast';
import http from '@/services/http.js';

export const syncStatus = ref('idle'); // 'idle' | 'syncing' | 'error'
export const pendingCount = ref(0);
export const failedCount = ref(0);

export function useSyncManager() {
  const { isOnline } = useOnlineStatus();
  const toast = useToast();

  // Запускать синхронизацию при появлении сети
  watch(isOnline, (online) => {
    if (online) processQueue();
  });

  async function processQueue() {
    if (syncStatus.value === 'syncing') return;

    const items = await getPending();
    if (!items.length) {
      await updateCounts();
      return;
    }

    syncStatus.value = 'syncing';
    pendingCount.value = items.length;

    // Сначала операции и движения, потом фото
    const nonPhotos = items.filter(i => i.type !== 'attach_photo');
    const photos = items.filter(i => i.type === 'attach_photo');

    for (const item of nonPhotos) {
      await processItem(item, toast);
    }

    for (const item of photos) {
      await processPhotoItem(item, toast);
    }

    syncStatus.value = 'idle';
    await updateCounts();
  }

  async function forcSync() {
    await processQueue();
  }

  return { processQueue, forcSync, syncStatus, pendingCount, failedCount };
}

async function processItem(item, toast) {
  const nursery = useNurseryStore();
  const { nurseryId } = nursery;

  try {
    const { type, payload } = item;

    if (type === 'create_operation') {
      await http.post(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations`, payload);
    } else if (type === 'update_operation') {
      await http.patch(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.id}`, payload);
    } else if (type === 'delete_operation') {
      await http.delete(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.id}`);
    } else if (type === 'create_movement') {
      await http.post(`/nurseries/${nurseryId}/plants/${payload.plantId}/movements`, payload);
    } else if (type === 'delete_movement') {
      await http.delete(`/nurseries/${nurseryId}/plants/${payload.plantId}/movements/${payload.id}`);
    }

    await markDone(item.id);
  } catch (err) {
    await markFailed(item.id);

    const updated = await getPending();
    const current = updated.find(i => i.id === item.id);
    if (current?.status === 'failed') {
      toast.add({
        severity: 'warn',
        summary: 'Ошибка синхронизации',
        detail: `Не удалось отправить операцию после 3 попыток. Нажмите "Повторить" для ручного запуска.`,
        life: 8000,
      });
    }
  }
}

async function processPhotoItem(item, toast) {
  const nursery = useNurseryStore();
  const { nurseryId } = nursery;
  const { payload } = item;

  try {
    const pendingPhotos = await getPendingPhotos();
    const pending = pendingPhotos.find(p => p.localId === payload.localId || p.operation_id === payload.operationId);

    if (!pending) {
      await markDone(item.id);
      return;
    }

    const formData = new FormData();
    formData.append('file', new File([pending.blob], 'photo.jpg', { type: pending.mime_type }));

    await http.post(
      `/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.operationId}/photos`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    await markPhotoDone(pending.localId);
    await markDone(item.id);
  } catch (err) {
    await markFailed(item.id);
  }
}

async function updateCounts() {
  const items = await getPending();
  pendingCount.value = items.length;
  failedCount.value = await getFailedCount();
  syncStatus.value = failedCount.value > 0 ? 'error' : 'idle';
}
```

---

## Шаг 2. SyncStatusBadge (компонент хедера)

`src/components/SyncStatusBadge.vue`:

```vue
<template>
  <div class="flex align-items-center gap-2">
    <!-- Офлайн индикатор -->
    <div v-if="!isOnline" class="flex align-items-center gap-1 text-orange-500 text-sm">
      <i class="pi pi-wifi" style="font-size: 14px" />
      <span>Офлайн</span>
    </div>

    <!-- Синхронизируется -->
    <div v-else-if="syncStatus === 'syncing'" class="flex align-items-center gap-1 text-blue-500 text-sm">
      <i class="pi pi-spin pi-spinner" style="font-size: 14px" />
      <span>Синхронизация...</span>
    </div>

    <!-- Ошибка -->
    <div
      v-else-if="syncStatus === 'error'"
      class="flex align-items-center gap-1 text-red-500 text-sm cursor-pointer"
      @click="handleRetry"
    >
      <i class="pi pi-exclamation-triangle" style="font-size: 14px" />
      <span>Ошибок: {{ failedCount }}</span>
    </div>

    <!-- Ожидают -->
    <div
      v-else-if="pendingCount > 0"
      class="flex align-items-center gap-1 text-orange-400 text-sm cursor-pointer"
      @click="handleForceSync"
    >
      <i class="pi pi-clock" style="font-size: 14px" />
      <span>{{ pendingCount }}</span>
    </div>

    <!-- Онлайн, всё синхронизировано -->
    <div v-else-if="isOnline" class="flex align-items-center gap-1 text-green-500 text-sm">
      <i class="pi pi-check-circle" style="font-size: 14px" />
    </div>

    <!-- Кнопка ручной синхронизации -->
    <Button
      v-if="isOnline && pendingCount > 0"
      icon="pi pi-refresh"
      text
      size="small"
      v-tooltip="'Синхронизировать сейчас'"
      @click="handleForceSync"
    />
  </div>
</template>

<script>
import { defineOptions } from 'vue';
import { useOnlineStatus } from '@/composables/useOnlineStatus.js';
import { useSyncManager, syncStatus, pendingCount, failedCount } from '@/composables/useSyncManager.js';
import { retryFailed } from '@/db/syncQueue.service.js';

defineOptions({ name: 'SyncStatusBadge' });

const { isOnline } = useOnlineStatus();
const { forcSync } = useSyncManager();

async function handleForceSync() {
  await forcSync();
}

async function handleRetry() {
  await retryFailed();
  await forcSync();
}
</script>
```

---

## Шаг 3. Подключение в AppLayout

`src/AppLayout.vue`:

```vue
<template>
  <div class="app-layout">
    <header class="surface-card border-bottom-1 border-200 px-4 py-2 flex justify-content-between align-items-center">
      <div class="flex align-items-center gap-3">
        <span class="font-semibold text-primary text-lg">Палисад</span>
        <nav class="flex gap-2">
          <Button label="Растения" text @click="router.push('/plants')" />
          <Button label="Сканер" text @click="router.push('/scanner')" />
          <Button label="Лента" text @click="router.push('/activity')" />
          <Button v-if="auth.canManageStructure" label="Структура" text @click="router.push('/locations')" />
          <Button v-if="auth.canManageStructure" label="Справочники" text @click="router.push('/catalog')" />
          <Button v-if="auth.canManageStaff" label="Сотрудники" text @click="router.push('/staff')" />
        </nav>
      </div>
      <div class="flex align-items-center gap-3">
        <SyncStatusBadge />
        <Button icon="pi pi-cog" text @click="router.push('/nursery/settings')" />
        <Button icon="pi pi-sign-out" text @click="auth.logout()" />
      </div>
    </header>

    <main class="flex-1">
      <router-view />
    </main>
  </div>
</template>

<script>
import { defineOptions, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { useSyncManager } from '@/composables/useSyncManager.js';
import SyncStatusBadge from '@/components/SyncStatusBadge.vue';

defineOptions({ name: 'AppLayout' });

const router = useRouter();
const auth = useAuthStore();
const nursery = useNurseryStore();
const { processQueue } = useSyncManager();

onMounted(async () => {
  await nursery.fetchNursery();
  await nursery.fetchSubscription();
  processQueue();
});
</script>
```

---

## Шаг 4. Индикатор статуса на записях растений

В `PlantDetailPage.vue` — показывать статус синхронизации на операциях и движениях:

```vue
<!-- Пример: в OperationTimeline передаётся _pending -->
<OperationTimeline
  :operations="operations.forPlant(plantId)"
  :is-loading="operations.isLoading"
  :can-edit="auth.canWrite"
  @edit="openEdit"
  @delete="handleDelete"
/>
```

Компонент `OperationTimeline` уже показывает `⏳ Ожидает синхронизации` при `item._pending = true` (реализовано в MODULE_8).

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | При появлении сети очередь обрабатывается автоматически | Создать офлайн-операцию, включить сеть → запись появляется на сервере |
| 2 | `SyncStatusBadge` показывает «Офлайн» при отсутствии сети | Отключить сеть → оранжевый индикатор |
| 3 | Кнопка ручной синхронизации запускает очередь | Нажать → статус меняется на «Синхронизация...» |
| 4 | `retries >= 3` → статус `failed` → Toast | Сломать API, создать 3+ операции офлайн → предупреждение |
| 5 | «Повторить» сбрасывает `retries` и запускает заново | После ошибки нажать → попытка повторилась |
| 6 | Фото загружается после синхронизации операции | Прикрепить фото офлайн → после sync фото видно на сервере |
| 7 | Конфликт: серверная версия побеждает | Изменить запись и на сервере и офлайн → после sync — серверная версия |
| 8 | Порядок синка: операции/движения → фото | Проверить порядок в логах DevTools |
