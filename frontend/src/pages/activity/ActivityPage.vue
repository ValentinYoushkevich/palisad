<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2>Лента активности</h2>
      <Button
        v-if="activityStore.hasActiveFilters"
        label="Сбросить фильтры"
        text
        @click="handleResetFilters"
      />
    </div>

    <ActivityFilters @change="activityStore.fetchLogs(true)" />

    <Message v-if="activityStore.activityError" severity="error">
      {{ activityStore.activityError }}
    </Message>

    <div v-if="activityStore.isLoading && !activityStore.logs.length" class="flex justify-center py-6">
      <ProgressSpinner style="width: 40px; height: 40px" />
    </div>

    <div v-else-if="!activityStore.logs.length" class="text-center text-sm text-gray-500">
      Событий нет
    </div>

    <div v-else class="flex flex-col gap-2">
      <ActivityLogItem
        v-for="log in activityStore.logs"
        :key="log.id"
        :log="log"
      />

      <div class="mt-2 flex justify-center">
        <Button
          v-if="activityStore.logs.length < activityStore.pagination.total"
          :loading="activityStore.isLoading"
          label="Загрузить еще"
          outlined
          @click="handleLoadMore"
        />
        <span v-else class="text-center text-sm text-gray-500">
          Показано все {{ activityStore.pagination.total }} событий
        </span>
      </div>
    </div>
  </section>
</template>

<script setup>
import ActivityLogItem from '@/components/ActivityLogItem.vue'
import ActivityFilters from '@/pages/activity/components/ActivityFilters.vue'
import { useActivityStore } from '@/stores/activity.store'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { onMounted } from 'vue'

defineOptions({ name: 'ActivityPage' })

const activityStore = useActivityStore()

onMounted(async () => {
  await activityStore.fetchLogs(true)
})

async function handleResetFilters() {
  await activityStore.resetFilters()
}

async function handleLoadMore() {
  await activityStore.loadMore()
}
</script>
