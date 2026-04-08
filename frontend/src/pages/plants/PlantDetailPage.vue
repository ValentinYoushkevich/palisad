<template>
  <section class="plantDetail">
    <h2>Карточка растения</h2>
    <p class="plantDetail__meta">ID: {{ route.params.id }}</p>
    <Button label="Назад к реестру" text @click="router.push('/plants')" />
  </section>
</template>

<script setup>
import Button from 'primevue/button'
import { useRoute, useRouter } from 'vue-router'

defineOptions({ name: 'PlantDetailPage' })

const route = useRoute()
const router = useRouter()
</script>

<style lang="scss" scoped>
.plantDetail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.plantDetail__meta {
  color: #6b7280;
}
</style>
