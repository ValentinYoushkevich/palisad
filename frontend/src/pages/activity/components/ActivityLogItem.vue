<template>
  <div class="flex gap-3 rounded-[10px] bg-white p-3">
    <div
      class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full"
      :style="{ background: eventColor(log.event_type) }"
    >
      <i :class="eventIcon(log.event_type)" class="text-[13px] text-white" />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex justify-between gap-2">
        <div>
          <span class="font-semibold">{{ eventLabel(log.event_type) }}</span>
          <span v-if="log.user_name" class="ml-1.5 text-sm text-gray-500">· {{ log.user_name }}</span>
        </div>
        <span class="text-xs text-gray-500">{{ formatDate(log.created_at) }}</span>
      </div>

      <div v-if="isMovementCreated" class="mt-1 text-sm text-gray-500">
        {{ log.details.type_name }}<span v-if="log.details.plant_qr"> · {{ log.details.plant_qr }}</span>
      </div>

      <div v-if="isTransplantOperation" class="mt-1 text-sm text-gray-500">
        Пересадка: {{ log.details.from_container || '—' }} → {{ log.details.to_container || '—' }}
      </div>

      <div v-if="isStatusChanged" class="mt-1 text-sm text-gray-500">
        {{ statusLabel(log.details.from) }} → {{ statusLabel(log.details.to) }}
      </div>

      <div v-if="canOpenPlant">
        <Button
          class="mt-1 p-0"
          label="Открыть растение"
          size="small"
          text
          @click="router.push(`/plants/${log.entity_id}`)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'ActivityLogItem' })

const props = defineProps({
  log: {
    type: Object,
    required: true
  }
})

const router = useRouter()

const isMovementCreated = computed(() => props.log.event_type === 'movement.created' && Boolean(props.log.details))
const isTransplantOperation = computed(() => {
  if (props.log.event_type !== 'operation.created' || !props.log.details) {
    return false
  }
  return props.log.details.type === 'transplant'
})
const isStatusChanged = computed(() => props.log.event_type === 'plant.status_changed' && Boolean(props.log.details))
const canOpenPlant = computed(() => props.log.entity_type === 'plant' && Boolean(props.log.entity_id))

const EVENT_LABELS = {
  'plant.created': 'Растение создано',
  'plant.updated': 'Растение изменено',
  'plant.deleted': 'Растение удалено',
  'plant.restored': 'Растение восстановлено',
  'plant.status_changed': 'Статус изменен',
  'operation.created': 'Операция добавлена',
  'operation.deleted': 'Операция удалена',
  'photo.attached': 'Фото прикреплено',
  'movement.created': 'Движение записано',
  'location.created': 'Локация создана',
  'location.updated': 'Локация изменена',
  'location.deleted': 'Локация удалена',
  'user.created': 'Сотрудник добавлен',
  'user.deactivated': 'Сотрудник деактивирован',
  'user.role_changed': 'Роль изменена',
  'auth.login': 'Вход в систему'
}

const EVENT_ICONS = {
  'plant.created': 'pi pi-plus',
  'plant.deleted': 'pi pi-trash',
  'plant.status_changed': 'pi pi-refresh',
  'operation.created': 'pi pi-cog',
  'photo.attached': 'pi pi-image',
  'movement.created': 'pi pi-arrows-h',
  'location.created': 'pi pi-map-marker',
  'user.created': 'pi pi-user-plus',
  'auth.login': 'pi pi-sign-in'
}

const EVENT_COLORS = {
  'plant.created': '#10b981',
  'plant.deleted': '#ef4444',
  'plant.status_changed': '#f59e0b',
  'operation.created': '#6366f1',
  'movement.created': '#3b82f6',
  'auth.login': '#8b5cf6'
}

const STATUS_LABELS = {
  growing: 'В росте',
  storage: 'На хранении',
  sold: 'Продано',
  written_off: 'Списано'
}

function eventLabel(eventType) {
  return EVENT_LABELS[eventType] || eventType
}

function eventIcon(eventType) {
  return EVENT_ICONS[eventType] || 'pi pi-circle'
}

function eventColor(eventType) {
  return EVENT_COLORS[eventType] || '#9ca3af'
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value
}

function formatDate(value) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>
