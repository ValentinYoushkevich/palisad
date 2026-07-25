<template>
  <section class="page-shell flex flex-col gap-4">
    <h2>Сканирование зоны</h2>

    <div v-if="store.currentSession" class="rounded-xl bg-white p-4">
      <p class="scan__zone">
        Зона: <strong>{{ store.currentSession.locationName }}</strong>
      </p>
    </div>

    <!-- Итог после завершения сессии. -->
    <div v-if="finished && summary" class="rounded-xl bg-white p-4">
      <h3 class="scan__section-title">Расхождения</h3>
      <div class="scan__counts">
        <div class="scan__count"><span>Совпало</span><strong>{{ summary.matched }}</strong></div>
        <div class="scan__count"><span>Не найдено</span><strong>{{ summary.missing }}</strong></div>
        <div class="scan__count"><span>Чужие</span><strong>{{ summary.foreign }}</strong></div>
        <div class="scan__count"><span>Неизвестные</span><strong>{{ summary.unknown }}</strong></div>
      </div>
      <Message :closable="false" severity="info">
        Сессия сохранена. После синхронизации она появится в истории — там доступны применение
        и PDF.
      </Message>
      <Button label="К списку" @click="goToList" />
    </div>

    <!-- Активное сканирование. -->
    <template v-else>
      <div class="rounded-xl bg-white p-4">
        <div class="scan__counter">Отсканировано: {{ store.scanCount }}</div>

        <div v-if="canUseCamera" class="scan__camera">
          <QrScanner @error="onCameraError" @scanned="onScan" />
        </div>

        <div class="scan__manual">
          <label for="scanCode">Код растения (QR или числовой)</label>
          <div class="scan__manual-row">
            <InputText
              id="scanCode"
              v-model="manualCode"
              class="flex-1"
              placeholder="Введите или отсканируйте код..."
              @keyup.enter="onManualSubmit"
            />
            <Button label="Добавить" @click="onManualSubmit" />
          </div>
        </div>
      </div>

      <div class="rounded-xl bg-white p-4 scan__actions">
        <Button
          label="Показать расхождения"
          outlined
          @click="showPreview"
        />
        <Button
          label="Завершить"
          severity="success"
          @click="finish"
        />
      </div>

      <div v-if="previewCounts" class="rounded-xl bg-white p-4">
        <h3 class="scan__section-title">Предпросмотр расхождений</h3>
        <div class="scan__counts">
          <div class="scan__count"><span>Совпало</span><strong>{{ previewCounts.matched }}</strong></div>
          <div class="scan__count"><span>Не найдено</span><strong>{{ previewCounts.missing }}</strong></div>
          <div class="scan__count"><span>Чужие</span><strong>{{ previewCounts.foreign }}</strong></div>
          <div class="scan__count"><span>Неизвестные</span><strong>{{ previewCounts.unknown }}</strong></div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import QrScanner from '@/pages/scanner/components/QrScanner.vue'
import { useInventoryStore } from '@/stores/inventory.store'
import { isMobileDevice } from '@/utils/device'
import { useToast } from 'primevue/usetoast'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'InventoryScanPage' })

const store = useInventoryStore()
const router = useRouter()
const toast = useToast()

const canUseCamera = isMobileDevice()
const manualCode = ref('')
const previewCounts = ref(null)
const finished = ref(false)
const summary = ref(null)

async function onScan(code) {
  const result = await store.addScan(code)

  // Дубликат — короткий сигнал. reason 'blank'/'no_session' тихо игнорируем;
  // счётчик обновляется сам при ok.
  if (result.duplicate) {
    toast.add({ severity: 'info', summary: 'Уже отсканирован', life: 1500 })
  }
}

async function onManualSubmit() {
  const code = manualCode.value.trim()
  if (!code) {
    return
  }

  await onScan(code)
  manualCode.value = ''
}

function onCameraError() {
  // Камера недоступна — остаётся ручной ввод, дополнительных действий не требуется.
}

async function showPreview() {
  const result = await store.computePreview()
  if (result.ok) {
    previewCounts.value = result.diff.counts
  }
}

async function finish() {
  const result = await store.completeSession()
  if (result.ok) {
    summary.value = result.diff.counts
    finished.value = true
  }
}

function goToList() {
  store.resetCurrent()
  router.push('/inventory')
}

onMounted(() => {
  // Перезагрузка страницы теряет currentSession — возвращаемся к списку.
  if (!store.currentSession) {
    router.replace('/inventory')
  }
})
</script>

<style lang="scss" scoped>
.scan__zone {
  margin: 0;
  color: #374151;
}

.scan__section-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.scan__counter {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 12px;
}

.scan__camera {
  margin-bottom: 16px;
}

.scan__manual {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 560px;
}

.scan__manual-row {
  display: flex;
  gap: 8px;
}

.scan__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.scan__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.scan__count {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 96px;
  padding: 12px 16px;
  border-radius: 10px;
  background: #f3f4f6;
}

.scan__count span {
  font-size: 12px;
  color: #6b7280;
}

.scan__count strong {
  font-size: 20px;
  color: #111827;
}
</style>
