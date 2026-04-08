<template>
  <div class="syncBadge">
    <div v-if="!isOnline" class="syncBadge__state syncBadge__state--offline">
      <i class="pi pi-wifi" />
      <span>Офлайн</span>
    </div>

    <div v-else-if="syncStatus === 'syncing'" class="syncBadge__state syncBadge__state--syncing">
      <i class="pi pi-spin pi-spinner" />
      <span>Синхронизация...</span>
    </div>

    <button
      v-else-if="syncStatus === 'error'"
      class="syncBadge__state syncBadge__state--error"
      type="button"
      @click="handleRetry"
    >
      <i class="pi pi-exclamation-triangle" />
      <span>Ошибок: {{ failedCount }}</span>
    </button>

    <button
      v-else-if="pendingCount > 0"
      class="syncBadge__state syncBadge__state--pending"
      type="button"
      @click="handleForceSync"
    >
      <i class="pi pi-clock" />
      <span>{{ pendingCount }}</span>
    </button>

    <div v-else-if="isOnline" class="syncBadge__state syncBadge__state--ok">
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
import Button from 'primevue/button'

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

<style lang="scss" scoped>
.syncBadge {
  display: flex;
  align-items: center;
  gap: 6px;
}

.syncBadge__state {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.syncBadge__state--offline {
  color: #f59e0b;
}

.syncBadge__state--syncing {
  color: #3b82f6;
}

.syncBadge__state--error {
  color: #ef4444;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.syncBadge__state--pending {
  color: #f59e0b;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.syncBadge__state--ok {
  color: #10b981;
}
</style>
