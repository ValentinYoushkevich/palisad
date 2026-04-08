<template>
  <div class="movementHistory">
    <div v-if="isLoading" class="movementHistory__loading">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <DataTable v-else :value="movements" size="small" stripedRows>
      <Column header="Дата">
        <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
      </Column>
      <Column header="Тип">
        <template #body="{ data }">
          <span>{{ data.type_name || data.type_id || '—' }}</span>
          <Tag v-if="data._pending" class="movementHistory__pendingTag" severity="warning" value="Ожидает" />
        </template>
      </Column>
      <Column header="Откуда → Куда">
        <template #body="{ data }">
          <span v-if="data.from_location_name || data.to_location_name">
            {{ data.from_location_name || '—' }} → {{ data.to_location_name || '—' }}
          </span>
          <span v-else class="movementHistory__muted">—</span>
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
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import ProgressSpinner from 'primevue/progressspinner'
import Tag from 'primevue/tag'

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

<style lang="scss" scoped>
.movementHistory__loading {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.movementHistory__pendingTag {
  margin-left: 6px;
}

.movementHistory__muted {
  color: #6b7280;
}
</style>
