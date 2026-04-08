<template>
  <div class="operationTimeline">
    <div v-if="isLoading" class="operationTimeline__loading">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <Timeline v-else :value="operations" class="w-full">
      <template #marker="{ item }">
        <span class="operationTimeline__marker" :style="{ background: typeColor(item.type) }">
          <i :class="typeIcon(item.type)" class="operationTimeline__markerIcon" />
        </span>
      </template>

      <template #content="{ item }">
        <div class="operationTimeline__card">
          <div class="operationTimeline__cardHead">
            <div>
              <div class="operationTimeline__title">{{ typeLabel(item.type) }}</div>
              <div v-if="item.notes" class="operationTimeline__notes">{{ item.notes }}</div>
              <div v-if="item._pending" class="operationTimeline__pending">Ожидает синхронизации</div>
            </div>
            <div class="operationTimeline__date">{{ formatDate(item.created_at) }}</div>
          </div>

          <div v-if="item.photos?.length" class="operationTimeline__photos">
            <img
              v-for="photo in item.photos"
              :key="photo.id"
              :src="photo.url"
              alt="operation"
              class="operationTimeline__photo"
            >
          </div>

          <div v-if="canEdit" class="operationTimeline__actions">
            <Button icon="pi pi-pencil" size="small" text @click="emit('edit', item)" />
            <Button icon="pi pi-trash" severity="danger" size="small" text @click="emit('delete', item)" />
          </div>
        </div>
      </template>
    </Timeline>
  </div>
</template>

<script setup>
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import Timeline from 'primevue/timeline'

defineOptions({ name: 'OperationTimeline' })

defineProps({
  operations: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  canEdit: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['edit', 'delete'])

const TYPE_LABELS = {
  grafting: 'Прививка',
  pruning: 'Обрезка',
  treatment: 'Обработка СЗР',
  transplant: 'Пересадка',
  inspection: 'Осмотр',
  other: 'Другое'
}

const TYPE_ICONS = {
  grafting: 'pi pi-cog',
  pruning: 'pi pi-scissors',
  treatment: 'pi pi-shield',
  transplant: 'pi pi-box',
  inspection: 'pi pi-eye',
  other: 'pi pi-file'
}

const TYPE_COLORS = {
  grafting: '#6366f1',
  pruning: '#f59e0b',
  treatment: '#10b981',
  transplant: '#3b82f6',
  inspection: '#8b5cf6',
  other: '#9ca3af'
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type
}

function typeIcon(type) {
  return TYPE_ICONS[type] || 'pi pi-circle'
}

function typeColor(type) {
  return TYPE_COLORS[type] || '#9ca3af'
}

function formatDate(value) {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}
</script>

<style lang="scss" scoped>
.operationTimeline__loading {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.operationTimeline__marker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.operationTimeline__markerIcon {
  color: #ffffff;
  font-size: 13px;
}

.operationTimeline__card {
  background: #ffffff;
  border-radius: 10px;
  padding: 12px;
}

.operationTimeline__cardHead {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.operationTimeline__title {
  font-weight: 600;
}

.operationTimeline__notes {
  color: #6b7280;
  font-size: 13px;
  margin-top: 4px;
}

.operationTimeline__pending {
  color: #d97706;
  font-size: 13px;
  margin-top: 4px;
}

.operationTimeline__date {
  color: #6b7280;
  font-size: 13px;
}

.operationTimeline__photos {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.operationTimeline__photo {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.operationTimeline__actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
</style>
