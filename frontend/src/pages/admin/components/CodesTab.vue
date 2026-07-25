<template>
  <div class="flex flex-col gap-4">
    <!-- Форма выпуска кодов -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-3">
      <h3 class="m-0">Выпуск лицензионных кодов</h3>

      <div class="flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1">
          <label for="issuePlan">План</label>
          <Select
            id="issuePlan"
            v-model="form.planId"
            class="w-56"
            :options="adminStore.plans"
            optionLabel="name"
            optionValue="id"
            placeholder="Выберите план"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="issueDuration">Срок (дней)</label>
          <InputNumber
            id="issueDuration"
            v-model="form.durationDays"
            :min="1"
            showButtons
            class="w-32"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="issueCount">Количество</label>
          <InputNumber
            id="issueCount"
            v-model="form.count"
            :min="1"
            :max="50"
            showButtons
            class="w-32"
          />
        </div>

        <div class="flex flex-col gap-1 grow">
          <label for="issueNote">Заметка (необязательно)</label>
          <InputText id="issueNote" v-model="form.note" class="w-full" />
        </div>

        <Button
          :disabled="!isFormValid"
          :loading="issuing"
          label="Выпустить"
          @click="handleIssue"
        />
      </div>

      <Message v-if="formError" severity="warn">{{ formError }}</Message>

      <!-- Свежевыпущенные коды -->
      <div v-if="adminStore.lastIssued.length" class="flex flex-col gap-2">
        <h4 class="m-0">Выпущенные коды</h4>
        <div
          v-for="item in adminStore.lastIssued"
          :key="item.id"
          class="flex items-center gap-2 rounded-lg border border-slate-200 p-2"
        >
          <span class="font-mono grow">{{ item.code }}</span>
          <Button
            icon="pi pi-copy"
            severity="secondary"
            outlined
            size="small"
            @click="copyCode(item.code)"
          />
        </div>
      </div>
    </div>

    <!-- Таблица кодов -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="m-0">Все коды</h3>
        <Select
          v-model="statusFilter"
          aria-label="Фильтр кодов по статусу"
          class="w-48"
          :options="statusOptions"
          optionLabel="label"
          optionValue="value"
          @change="onStatusChange"
        />
      </div>

      <Message v-if="adminStore.error" severity="error">{{ adminStore.error }}</Message>

      <DataTable
        :value="adminStore.codes"
        :loading="adminStore.isLoading"
        lazy
        paginator
        :rows="perPage"
        :totalRecords="adminStore.codesTotal"
        stripedRows
        @page="onPage"
      >
        <template #empty>
          <div class="py-6 text-center text-sm text-slate-500">Коды не найдены</div>
        </template>

        <Column header="Код">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <span class="font-mono">{{ data.code }}</span>
              <Button
                icon="pi pi-copy"
                severity="secondary"
                text
                size="small"
                @click="copyCode(data.code)"
              />
            </div>
          </template>
        </Column>
        <Column header="План">
          <template #body="{ data }">{{ planName(data.plan_id) }}</template>
        </Column>
        <Column field="duration_days" header="Срок, дней" />
        <Column header="Статус">
          <template #body="{ data }">
            <Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" />
          </template>
        </Column>
        <Column header="Кем активирован">
          <template #body="{ data }">{{ data.activated_by_email || '—' }}</template>
        </Column>
        <Column header="Создан">
          <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
        </Column>
        <Column>
          <template #body="{ data }">
            <Button
              v-if="data.status === 'issued'"
              label="Отозвать"
              severity="danger"
              outlined
              size="small"
              @click="confirmRevoke(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<script setup>
import { useAdminStore } from '@/stores/admin.store'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'CodesTab' })

const STATUS_LABELS = {
  issued: 'выпущен',
  activated: 'активирован',
  revoked: 'отозван'
}

const STATUS_SEVERITY = {
  issued: 'warn',
  activated: 'success',
  revoked: 'danger'
}

const adminStore = useAdminStore()
const toast = useToast()
const confirm = useConfirm()

const perPage = ref(20)
const page = ref(1)
const statusFilter = ref(null)
const issuing = ref(false)
const formError = ref('')

const statusOptions = [
  { label: 'Все статусы', value: null },
  { label: 'Выпущенные', value: 'issued' },
  { label: 'Активированные', value: 'activated' },
  { label: 'Отозванные', value: 'revoked' }
]

const form = ref({
  planId: null,
  durationDays: 30,
  count: 1,
  note: ''
})

const isFormValid = computed(() => (
  Boolean(form.value.planId) &&
  Number(form.value.durationDays) >= 1 &&
  Number(form.value.count) >= 1 &&
  Number(form.value.count) <= 50
))

const currentParams = computed(() => ({
  page: page.value,
  perPage: perPage.value,
  status: statusFilter.value || undefined
}))

onMounted(() => {
  loadCodes()
})

function loadCodes() {
  adminStore.fetchCodes(currentParams.value)
}

function planName(planId) {
  return adminStore.plans.find((plan) => plan.id === planId)?.name || planId || '—'
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function statusSeverity(status) {
  return STATUS_SEVERITY[status] || 'secondary'
}

function formatDate(value) {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('ru-RU')
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code)
    toast.add({ severity: 'success', summary: 'Скопировано', detail: code, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось скопировать', life: 3000 })
  }
}

async function handleIssue() {
  formError.value = ''
  if (!isFormValid.value) {
    formError.value = 'Выберите план, срок ≥ 1 дня и количество от 1 до 50.'
    return
  }

  issuing.value = true
  try {
    const result = await adminStore.issueCodes({
      planId: form.value.planId,
      durationDays: form.value.durationDays,
      note: form.value.note || undefined,
      count: form.value.count
    })
    if (result.ok) {
      toast.add({
        severity: 'success',
        summary: 'Коды выпущены',
        detail: `Выпущено кодов: ${result.codes.length}`,
        life: 4000
      })
      // Синхронизируем таблицу с локальными фильтрами (issueCodes тянет первую страницу).
      page.value = 1
      loadCodes()
      return
    }
    toast.add({ severity: 'error', summary: 'Ошибка выпуска', detail: result.error, life: 6000 })
  } finally {
    issuing.value = false
  }
}

function confirmRevoke(code) {
  confirm.require({
    header: 'Отозвать код',
    message: `Отозвать код ${code.code}? Действие необратимо.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Отозвать',
    rejectLabel: 'Отмена',
    acceptClass: 'p-button-danger',
    accept: async () => {
      const result = await adminStore.revokeCode(code.id, currentParams.value)
      if (result.ok) {
        toast.add({ severity: 'success', summary: 'Код отозван', life: 3000 })
        return
      }
      toast.add({ severity: 'error', summary: 'Не удалось отозвать', detail: result.error, life: 6000 })
    }
  })
}

function onStatusChange() {
  page.value = 1
  loadCodes()
}

function onPage(event) {
  perPage.value = event.rows
  page.value = event.page + 1
  loadCodes()
}
</script>
