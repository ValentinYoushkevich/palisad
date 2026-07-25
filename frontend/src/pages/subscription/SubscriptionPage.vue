<template>
  <section class="page-shell flex flex-col gap-4">
    <h2>Подписка</h2>

    <!-- Текущий план -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-2">
      <h3 class="m-0">Текущий план</h3>
      <p class="m-0">
        План: <strong>{{ subscription?.name || '—' }}</strong>
      </p>
      <p class="m-0">Растений: до {{ nurseryStore.plantLimit ?? '∞' }}</p>
      <p class="m-0">Пользователей: до {{ nurseryStore.userLimit ?? '∞' }}</p>
      <p class="m-0">
        Действует до:
        <strong>{{ expiresLabel }}</strong>
      </p>

      <Message v-if="showExpiryWarning" class="mt-1" severity="warn">
        Подписка истекает через {{ daysUntilExpiry }} дн.
      </Message>
    </div>

    <!-- Активация кода -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-2">
      <h3 class="m-0">Активация кода</h3>
      <div class="flex flex-wrap items-center gap-2">
        <InputText
          v-model="code"
          class="w-full sm:w-auto"
          placeholder="XXXX-XXXX-XXXX"
        />
        <Button
          :disabled="!isOnline || !code || activating"
          :loading="activating"
          label="Активировать"
          @click="handleActivate"
        />
      </div>
      <small v-if="!isOnline" class="text-slate-500">Активация доступна только онлайн</small>
    </div>

    <!-- Доступные планы -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-3">
      <h3 class="m-0">Доступные планы</h3>
      <p v-if="!nurseryStore.plans.length" class="m-0 text-sm text-slate-500">Планы не найдены.</p>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="plan in nurseryStore.plans"
          :key="plan.id"
          class="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <strong>{{ plan.name }}</strong>
            <Tag v-if="subscription?.id === plan.id" severity="success" value="Текущий" />
          </div>
          <p class="m-0 text-sm text-slate-600">Растений: до {{ plan.plant_limit ?? '∞' }}</p>
          <p class="m-0 text-sm text-slate-600">Пользователей: до {{ plan.user_limit ?? '∞' }}</p>
          <div v-if="planFeatures(plan).length" class="flex flex-wrap gap-1">
            <Tag
              v-for="feature in planFeatures(plan)"
              :key="feature"
              :value="feature"
              severity="info"
            />
          </div>
          <Button
            class="mt-1"
            :disabled="!isOnline"
            label="Хочу этот план"
            outlined
            size="small"
            @click="openRequestDialog(plan)"
          />
        </div>
      </div>
      <small v-if="!isOnline" class="text-slate-500">Заявки доступны только онлайн</small>
    </div>

    <!-- Мои заявки -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-2">
      <h3 class="m-0">Мои заявки</h3>
      <DataTable
        v-if="nurseryStore.planRequests.length"
        :value="nurseryStore.planRequests"
        size="small"
        stripedRows
      >
        <Column field="plan_name" header="План" />
        <Column header="Статус">
          <template #body="{ data }">
            <Tag :severity="requestStatusSeverity(data.status)" :value="requestStatusLabel(data.status)" />
          </template>
        </Column>
        <Column header="Дата">
          <template #body="{ data }">
            {{ formatDate(data.created_at) }}
          </template>
        </Column>
      </DataTable>
      <p v-else class="m-0 text-sm text-slate-500">Заявок нет.</p>
    </div>

    <!-- Как оплатить -->
    <div class="rounded-xl bg-white p-4 flex flex-col gap-2">
      <h3 class="m-0">{{ PAYMENT_INFO.title }}</h3>
      <ol class="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm text-slate-700">
        <li v-for="(step, index) in PAYMENT_INFO.steps" :key="index">{{ step }}</li>
      </ol>
      <p class="m-0 text-sm text-slate-500">{{ PAYMENT_INFO.contacts }}</p>
    </div>

    <!-- Диалог заявки на план -->
    <Dialog
      v-model:visible="requestVisible"
      :header="requestDialogHeader"
      modal
      style="width: 440px"
    >
      <div class="flex flex-col gap-2">
        <label for="requestComment">Контакт и пожелания (необязательно)</label>
        <Textarea
          id="requestComment"
          v-model="requestComment"
          autoResize
          class="w-full"
          rows="4"
        />
      </div>

      <template #footer>
        <Button label="Отмена" text @click="requestVisible = false" />
        <Button :loading="requesting" label="Отправить заявку" @click="handleCreateRequest" />
      </template>
    </Dialog>
  </section>
</template>

<script setup>
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { PAYMENT_INFO } from '@/pages/subscription/payment.config.js'
import { useNurseryStore } from '@/stores/nursery.store'
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'SubscriptionPage' })

const FEATURE_LABELS = {
  feature_tags: 'Теги',
  feature_operations: 'Операции',
  feature_qr: 'QR-этикетки',
  feature_photos: 'Фото',
  feature_export: 'Экспорт'
}

const nurseryStore = useNurseryStore()
const toast = useToast()
const { isOnline } = useOnlineStatus()

const code = ref('')
const activating = ref(false)
const requestVisible = ref(false)
const requestComment = ref('')
const requesting = ref(false)
const selectedPlan = ref(null)

const subscription = computed(() => nurseryStore.subscription)

const daysUntilExpiry = computed(() => {
  const raw = subscription.value?.expires_at
  if (!raw) {
    return null
  }
  const expires = new Date(raw)
  if (Number.isNaN(expires.getTime())) {
    return null
  }
  return Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
})

const showExpiryWarning = computed(
  () => daysUntilExpiry.value !== null && daysUntilExpiry.value > 0 && daysUntilExpiry.value <= 14
)

const expiresLabel = computed(() => {
  if (!subscription.value?.expires_at) {
    return 'бессрочно (free)'
  }
  return formatDate(subscription.value.expires_at)
})

const requestDialogHeader = computed(() => {
  if (!selectedPlan.value) {
    return 'Заявка на план'
  }
  return `Заявка на план «${selectedPlan.value.name}»`
})

onMounted(async () => {
  await Promise.all([
    nurseryStore.fetchSubscription(),
    nurseryStore.fetchPlans(),
    nurseryStore.fetchMyRequests()
  ])
})

function formatDate(value) {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }
  return parsed.toLocaleDateString('ru-RU')
}

function planFeatures(plan) {
  return Object.keys(FEATURE_LABELS)
    .filter((key) => plan[key])
    .map((key) => FEATURE_LABELS[key])
}

function requestStatusLabel(status) {
  return status === 'processed' ? 'обработана' : 'на рассмотрении'
}

function requestStatusSeverity(status) {
  return status === 'processed' ? 'success' : 'warn'
}

async function handleActivate() {
  activating.value = true
  try {
    const result = await nurseryStore.activateCode(code.value)
    if (result.ok) {
      toast.add({ severity: 'success', summary: 'Код активирован', detail: 'Подписка обновлена.', life: 4000 })
      code.value = ''
      return
    }
    toast.add({ severity: 'error', summary: 'Ошибка активации', detail: result.error, life: 6000 })
  } finally {
    activating.value = false
  }
}

function openRequestDialog(plan) {
  selectedPlan.value = plan
  requestComment.value = ''
  requestVisible.value = true
}

async function handleCreateRequest() {
  if (!selectedPlan.value) {
    return
  }

  requesting.value = true
  try {
    const result = await nurseryStore.createPlanRequest(selectedPlan.value.id, requestComment.value)
    if (result.ok) {
      toast.add({
        severity: 'success',
        summary: 'Заявка отправлена',
        detail: 'Мы свяжемся с вами.',
        life: 4000
      })
      requestVisible.value = false
      return
    }
    toast.add({ severity: 'error', summary: 'Не удалось отправить заявку', detail: result.error, life: 6000 })
  } finally {
    requesting.value = false
  }
}
</script>
