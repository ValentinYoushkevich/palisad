<template>
  <section class="activityPage">
    <div class="activityPage__head">
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

    <div v-if="activityStore.isLoading && !activityStore.logs.length" class="activityPage__loading">
      <ProgressSpinner style="width: 40px; height: 40px" />
    </div>

    <div v-else-if="!activityStore.logs.length" class="activityPage__empty">
      Событий нет
    </div>

    <div v-else class="activityPage__list">
      <ActivityLogItem
        v-for="log in activityStore.logs"
        :key="log.id"
        :log="log"
      />

      <div class="activityPage__footer">
        <Button
          v-if="activityStore.logs.length < activityStore.pagination.total"
          :loading="activityStore.isLoading"
          label="Загрузить еще"
          outlined
          @click="handleLoadMore"
        />
        <span v-else class="activityPage__empty">
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

<style lang="scss" scoped>
.activityPage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activityPage__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.activityPage__loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.activityPage__empty {
  text-align: center;
  color: #6b7280;
}

.activityPage__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.activityPage__footer {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
</style>
