<template>
  <div class="operationTimeline">
    <div v-if="isLoading" class="flex justify-center py-4">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <Timeline v-else :value="operations" class="w-full">
      <template #marker="{ item }">
        <span class="inline-flex h-7 w-7 items-center justify-center rounded-full" :style="{ background: typeColor(item.type) }">
          <i :class="typeIcon(item.type)" class="text-[13px] text-white" />
        </span>
      </template>

      <template #content="{ item }">
        <div class="rounded-[10px] bg-white p-3">
          <div class="flex justify-between gap-3">
            <div>
              <div class="font-semibold">{{ typeLabel(item.type) }}</div>
              <div v-if="item.notes" class="mt-1 text-sm text-gray-500">{{ item.notes }}</div>
              <div v-if="item._pending" class="mt-1 text-sm text-amber-600">Ожидает синхронизации</div>
            </div>
            <div class="text-sm text-gray-500">{{ formatDate(item.created_at) }}</div>
          </div>

          <div v-if="item.photos?.length" class="mt-2 flex flex-wrap gap-2">
            <img
              v-for="photo in item.photos"
              :key="photo.id"
              :src="photo.url"
              alt="operation"
              class="h-[60px] w-20 rounded object-cover"
            >
          </div>

          <div v-if="canEdit" class="mt-2 flex gap-1">
            <Button class="ui-action-icon" icon="pi pi-pencil" severity="secondary" size="small" outlined @click="emit('edit', item)" />
            <Button class="ui-action-icon" icon="pi pi-trash" severity="danger" size="small" outlined @click="emit('delete', item)" />
          </div>
        </div>
      </template>
    </Timeline>
  </div>
</template>

<script setup>

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
