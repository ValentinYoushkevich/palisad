<template>
  <AppLayout>
    <RouterView />
    <Toast />
    <ConfirmDialog />
  </AppLayout>
</template>

<script setup>
import AppLayout from '@/layouts/AppLayout.vue'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
import { RouterView } from 'vue-router'

defineOptions({ name: 'App' })
</script>
