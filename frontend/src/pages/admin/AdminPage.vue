<template>
  <section class="page-shell flex flex-col gap-4">
    <h2>Администрирование платформы</h2>

    <SelectButton
      v-model="activeTab"
      :allowEmpty="false"
      :options="tabOptions"
      optionLabel="label"
      optionValue="value"
    />

    <CodesTab v-if="activeTab === 'codes'" />
    <RequestsTab v-else />
  </section>
</template>

<script setup>
import CodesTab from '@/pages/admin/components/CodesTab.vue'
import RequestsTab from '@/pages/admin/components/RequestsTab.vue'
import { useAdminStore } from '@/stores/admin.store'
import { onMounted, ref } from 'vue'

defineOptions({ name: 'AdminPage' })

const adminStore = useAdminStore()

const tabOptions = [
  { label: 'Коды', value: 'codes' },
  { label: 'Заявки', value: 'requests' }
]

const activeTab = ref('codes')

onMounted(() => {
  // Планы нужны для формы выпуска кодов (выпадающий список) — грузим один раз на входе.
  adminStore.fetchPlans()
})
</script>
