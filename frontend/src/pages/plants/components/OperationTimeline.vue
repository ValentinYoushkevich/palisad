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

          <div v-if="photosFor(item).length" class="mt-2 flex flex-wrap gap-2">
            <img
              v-for="photo in photosFor(item)"
              :key="photo.key"
              :src="photo.src"
              alt="operation"
              class="h-[60px] w-20 rounded object-cover"
              :class="{ 'ring-1 ring-amber-300 opacity-70': photo.pending }"
              :title="photo.title"
            >
          </div>

          <div v-if="canEdit" class="mt-2 flex items-center gap-1">
            <Button class="ui-action-icon" icon="pi pi-pencil" severity="secondary" size="small" outlined @click="emit('edit', item)" />
            <Button class="ui-action-icon" icon="pi pi-trash" severity="danger" size="small" outlined @click="emit('delete', item)" />
            <OperationPhotoCapture :busy="busyOperationId === item.id" @attach="(file) => handleAttach(item, file)" />
          </div>
        </div>
      </template>
    </Timeline>
  </div>
</template>

<script setup>
import { getPendingPhotos } from '@/db/pendingPhotos.service'
import OperationPhotoCapture from '@/pages/plants/components/OperationPhotoCapture.vue'
import { useNurseryStore } from '@/stores/nursery.store'
import { useOperationsStore } from '@/stores/operations.store'
import { onMounted, onUnmounted, ref, watch } from 'vue'

defineOptions({ name: 'OperationTimeline' })

const props = defineProps({
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

const nurseryStore = useNurseryStore()
const operationsStore = useOperationsStore()

// Локальные (ещё не синхронизированные) фото по operation_id → [{ localId, url }].
// url — objectURL Blob'а из pending_photos; освобождаем при перезагрузке/размонтировании.
const pendingByOperation = ref({})
const objectUrls = []
const busyOperationId = ref(null)

// Синхронизированные фото показываем через content-эндпоинт (куки-сессия same-origin уходит
// автоматически, в т.ч. для <img>). Метаданные фото теперь без url — строим src сами.
function contentUrl(operation, photo) {
  return `/api/nurseries/${nurseryStore.nurseryId}/plants/${operation.plant_id}/operations/${operation.id}/photos/${photo.id}/content`
}

function photosFor(operation) {
  const synced = (operation.photos || []).map((photo) => ({
    key: `srv-${photo.id}`,
    src: contentUrl(operation, photo),
    pending: false,
    title: ''
  }))
  const local = (pendingByOperation.value[operation.id] || []).map((photo) => ({
    key: `loc-${photo.localId}`,
    src: photo.url,
    pending: true,
    title: 'Ожидает синхронизации'
  }))
  return [...synced, ...local]
}

function revokeObjectUrls() {
  while (objectUrls.length) {
    URL.revokeObjectURL(objectUrls.pop())
  }
}

async function loadPendingPhotos() {
  revokeObjectUrls()
  const photos = await getPendingPhotos()
  const grouped = {}

  for (const photo of photos) {
    if (!photo?.blob) {
      continue
    }
    const url = URL.createObjectURL(photo.blob)
    objectUrls.push(url)
    if (!grouped[photo.operation_id]) {
      grouped[photo.operation_id] = []
    }
    grouped[photo.operation_id].push({ localId: photo.localId, url })
  }

  pendingByOperation.value = grouped
}

async function handleAttach(operation, file) {
  if (!file) {
    return
  }

  busyOperationId.value = operation.id
  try {
    // attachPhoto сам даунскейлит и разводит онлайн/офлайн; онлайн-ветка ещё и обновит
    // operations (метаданные). Перечитываем локальные pending, чтобы офлайн-фото показалось.
    await operationsStore.attachPhoto(operation.id, operation.plant_id, file)
    await loadPendingPhotos()
  } finally {
    busyOperationId.value = null
  }
}

onMounted(loadPendingPhotos)
onUnmounted(revokeObjectUrls)
watch(() => props.operations, loadPendingPhotos)

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
