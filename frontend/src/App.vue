<template>
  <AppLayout v-if="!isPublicRoute">
    <RouterView />
  </AppLayout>
  <RouterView v-else />
  <Toast />
  <ConfirmDialog />
</template>

<script setup>
import AppLayout from '@/layouts/AppLayout.vue'
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

defineOptions({ name: 'App' })

const route = useRoute()
const isPublicRoute = computed(() => Boolean(route.meta.public))
</script>
