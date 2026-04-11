<template>
  <div class="movementHistory">
    <div v-if="isLoading" class="flex justify-center py-3">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <DataTable
      v-else
      :value="movements"
      :rows="20"
      :rowsPerPageOptions="[20, 50, 100]"
      paginator
      size="small"
      stripedRows
    >
      <template #empty>
        <div class="py-6 text-center text-sm text-slate-500">
          Движения не добавлены
        </div>
      </template>

      <Column header="Дата">
        <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
      </Column>
      <Column header="Тип">
        <template #body="{ data }">
          <span>{{ data.type_name || data.type_id || '—' }}</span>
          <Tag v-if="data._pending" class="ml-1.5" severity="warning" value="Ожидает" />
        </template>
      </Column>
      <Column header="Откуда → Куда">
        <template #body="{ data }">
          <span v-if="data.from_location_name || data.to_location_name">
            {{ data.from_location_name || '—' }} → {{ data.to_location_name || '—' }}
          </span>
          <span v-else class="text-gray-500">—</span>
        </template>
      </Column>
      <Column header="Кол-во">
        <template #body="{ data }">{{ data.quantity || 1 }}</template>
      </Column>
      <Column header="Исполнитель">
        <template #body="{ data }">{{ data.user_name || '—' }}</template>
      </Column>
      <Column v-if="canDelete">
        <template #body="{ data }">
          <Button
            v-if="!data._pending"
            icon="pi pi-trash"
            severity="danger"
            size="small"
            text
            @click="emit('delete', data)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>

defineOptions({ name: 'MovementHistory' })

defineProps({
  movements: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  canDelete: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['delete'])

function formatDate(value) {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleDateString('ru-RU')
}
</script>
