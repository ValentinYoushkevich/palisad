<template>
  <div class="flex items-center gap-1.5">
    <div v-if="!isOnline" class="flex items-center gap-1 text-xs text-amber-500">
      <i class="pi pi-wifi" />
      <span>Офлайн</span>
    </div>

    <div v-else-if="syncStatus === 'syncing'" class="flex items-center gap-1 text-xs text-blue-500">
      <i class="pi pi-spin pi-spinner" />
      <span>Синхронизация...</span>
    </div>

    <button
      v-else-if="syncStatus === 'error'"
      class="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs text-red-500"
      type="button"
      @click="handleRetry"
    >
      <i class="pi pi-exclamation-triangle" />
      <span>Ошибок: {{ failedCount }}</span>
    </button>

    <button
      v-else-if="pendingCount > 0"
      class="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs text-amber-500"
      type="button"
      @click="handleForceSync"
    >
      <i class="pi pi-clock" />
      <span>{{ pendingCount }}</span>
    </button>

    <div v-else-if="isOnline" class="flex items-center gap-1 text-xs text-emerald-500">
      <i class="pi pi-check-circle" />
    </div>

    <Button
      v-if="isOnline && pendingCount > 0"
      icon="pi pi-refresh"
      size="small"
      text
      @click="handleForceSync"
    />
  </div>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { failedCount, pendingCount, syncStatus, useSyncManager } from '@/composables/useSyncManager'
import { retryFailed } from '@/db/syncQueue.service'

defineOptions({ name: 'SyncStatusBadge' })

const { isOnline } = useOnlineStatus()
const { forceSync } = useSyncManager()

async function handleForceSync() {
  await forceSync()
}

async function handleRetry() {
  await retryFailed()
  await forceSync()
}
</script>
