<template>
  <div class="rounded-xl bg-white p-4 flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="m-0">Заявки на смену плана</h3>
      <Select
        v-model="statusFilter"
        aria-label="Фильтр заявок по статусу"
        class="w-48"
        :options="statusOptions"
        optionLabel="label"
        optionValue="value"
        @change="onStatusChange"
      />
    </div>

    <Message v-if="adminStore.error" severity="error">{{ adminStore.error }}</Message>

    <DataTable
      :value="adminStore.requests"
      :loading="adminStore.isLoading"
      lazy
      paginator
      :rows="perPage"
      :totalRecords="adminStore.requestsTotal"
      stripedRows
      @page="onPage"
    >
      <template #empty>
        <div class="py-6 text-center text-sm text-slate-500">Заявок нет</div>
      </template>

      <Column field="account_email" header="Аккаунт">
        <template #body="{ data }">{{ data.account_email || '—' }}</template>
      </Column>
      <Column field="plan_name" header="План">
        <template #body="{ data }">{{ data.plan_name || '—' }}</template>
      </Column>
      <Column header="Комментарий">
        <template #body="{ data }">{{ data.comment || '—' }}</template>
      </Column>
      <Column header="Статус">
        <template #body="{ data }">
          <Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" />
        </template>
      </Column>
      <Column header="Создана">
        <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
      </Column>
      <Column>
        <template #body="{ data }">
          <Button
            v-if="data.status === 'new'"
            label="Обработано"
            severity="success"
            outlined
            size="small"
            @click="handleProcess(data)"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { useAdminStore } from '@/stores/admin.store'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'RequestsTab' })

const adminStore = useAdminStore()
const toast = useToast()

const perPage = ref(20)
const page = ref(1)
const statusFilter = ref(null)

const statusOptions = [
  { label: 'Все статусы', value: null },
  { label: 'Новые', value: 'new' },
  { label: 'Обработанные', value: 'processed' }
]

const currentParams = computed(() => ({
  page: page.value,
  perPage: perPage.value,
  status: statusFilter.value || undefined
}))

onMounted(() => {
  loadRequests()
})

function loadRequests() {
  adminStore.fetchRequests(currentParams.value)
}

function statusLabel(status) {
  return status === 'processed' ? 'обработана' : 'новая'
}

function statusSeverity(status) {
  return status === 'processed' ? 'success' : 'warn'
}

function formatDate(value) {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('ru-RU')
}

async function handleProcess(request) {
  const result = await adminStore.processRequest(request.id, currentParams.value)
  if (result.ok) {
    toast.add({ severity: 'success', summary: 'Заявка обработана', life: 3000 })
    return
  }
  toast.add({ severity: 'error', summary: 'Не удалось обработать', detail: result.error, life: 6000 })
}

function onStatusChange() {
  page.value = 1
  loadRequests()
}

function onPage(event) {
  perPage.value = event.rows
  page.value = event.page + 1
  loadRequests()
}
</script>
