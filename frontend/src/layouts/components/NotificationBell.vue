<template>
  <div ref="rootEl" class="bell">
    <button
      class="bell__trigger"
      type="button"
      :aria-label="bellAriaLabel"
      @click="toggle"
    >
      <i class="pi pi-bell" />
      <span v-if="store.unreadCount > 0" class="bell__badge">{{ badgeText }}</span>
    </button>

    <div v-if="isOpen" class="bell__panel">
      <header class="bell__head">
        <span class="bell__title">Уведомления</span>
        <button
          v-if="store.unreadCount > 0"
          class="bell__markAll"
          type="button"
          @click="handleMarkAll"
        >
          Прочитать всё
        </button>
      </header>

      <ul v-if="store.items.length > 0" class="bell__list">
        <li v-for="item in store.items" :key="item.id">
          <button
            type="button"
            class="bell__item"
            :class="{ 'bell__item--unread': !item.is_read }"
            @click="handleItemClick(item)"
          >
            <span v-if="!item.is_read" class="bell__dot" aria-hidden="true" />
            <span class="bell__body">
              <span class="bell__itemTitle">{{ titleFor(item) }}</span>
              <span class="bell__itemTime">{{ formatTime(item.created_at) }}</span>
            </span>
          </button>
        </li>
      </ul>

      <p v-else class="bell__empty">Нет уведомлений</p>
    </div>
  </div>
</template>

<script setup>
import { useNotificationsStore } from '@/stores/notifications.store'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

defineOptions({ name: 'NotificationBell' })

const store = useNotificationsStore()
const isOpen = ref(false)
const rootEl = ref(null)

const TYPE_LABELS = {
  'user.role_changed': 'Ваша роль изменена',
  'sync.conflict': 'Конфликт синхронизации',
  'subscription.expiring': 'Подписка скоро истекает',
  'task.due': 'Приближается срок задачи'
}

const badgeText = computed(() => (store.unreadCount > 9 ? '9+' : String(store.unreadCount)))

const bellAriaLabel = computed(() =>
  store.unreadCount > 0
    ? `Уведомления: непрочитанных ${store.unreadCount}`
    : 'Уведомления'
)

function titleFor(item) {
  return TYPE_LABELS[item.type] || 'Уведомление'
}

function formatTime(value) {
  if (!value) {
    return ''
  }

  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    store.fetchNotifications()
  }
}

function close() {
  isOpen.value = false
}

async function handleItemClick(item) {
  if (!item.is_read) {
    await store.markRead(item.id)
  }
}

async function handleMarkAll() {
  await store.markAllRead()
}

function handleOutsideClick(event) {
  if (rootEl.value && !rootEl.value.contains(event.target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<style lang="scss" scoped>
.bell {
  position: relative;
}

.bell__trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid #475569;
  background: #1f2937;
  color: #f9fafb;
  border-radius: 6px;
  cursor: pointer;
}

.bell__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  font-weight: 600;
}

.bell__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 50;
}

.bell__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
}

.bell__title {
  font-weight: 600;
  color: #111827;
}

.bell__markAll {
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  cursor: pointer;
}

.bell__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bell__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.bell__item:hover {
  background: #f8fafc;
}

.bell__item--unread {
  background: #eff6ff;
}

.bell__dot {
  margin-top: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2563eb;
  flex-shrink: 0;
}

.bell__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.bell__itemTitle {
  color: #111827;
  font-size: 14px;
}

.bell__itemTime {
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
}

.bell__empty {
  margin: 0;
  padding: 24px 14px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}
</style>
