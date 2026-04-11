<template>
  <div class="flex flex-wrap gap-2">
    <DatePicker
      v-model="dateFrom"
      dateFormat="dd.mm.yy"
      placeholder="От"
      showIcon
      @date-select="onFilterChange"
    />
    <DatePicker
      v-model="dateTo"
      dateFormat="dd.mm.yy"
      placeholder="До"
      showIcon
      @date-select="onFilterChange"
    />
    <div class="min-w-0">
      <label class="sr-only" for="activity-event-type">Тип события</label>
      <Select
        v-model="eventType"
        inputId="activity-event-type"
        :options="EVENT_TYPE_OPTIONS"
        optionLabel="label"
        optionValue="value"
        placeholder="Тип события"
        showClear
        @change="onFilterChange"
      />
    </div>
  </div>
</template>

<script setup>
import { useActivityStore } from '@/stores/activity.store'
import { computed } from 'vue'

defineOptions({ name: 'ActivityFilters' })

const emit = defineEmits(['change'])
const activityStore = useActivityStore()

const EVENT_TYPE_OPTIONS = [
  { label: 'Растение создано', value: 'plant.created' },
  { label: 'Растение изменено', value: 'plant.updated' },
  { label: 'Растение удалено', value: 'plant.deleted' },
  { label: 'Смена статуса', value: 'plant.status_changed' },
  { label: 'Операция добавлена', value: 'operation.created' },
  { label: 'Фото прикреплено', value: 'photo.attached' },
  { label: 'Движение записано', value: 'movement.created' },
  { label: 'Локация создана', value: 'location.created' },
  { label: 'Сотрудник добавлен', value: 'user.created' },
  { label: 'Роль изменена', value: 'user.role_changed' },
  { label: 'Вход в систему', value: 'auth.login' }
]

const dateFrom = computed({
  get: () => activityStore.filters.dateFrom,
  set: (value) => activityStore.setFilter('dateFrom', value)
})

const dateTo = computed({
  get: () => activityStore.filters.dateTo,
  set: (value) => activityStore.setFilter('dateTo', value)
})

const eventType = computed({
  get: () => activityStore.filters.eventType,
  set: (value) => activityStore.setFilter('eventType', value)
})

function onFilterChange() {
  emit('change')
}
</script>
