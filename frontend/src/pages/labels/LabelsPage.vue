<template>
  <section class="labelsPage">
    <h2>Печать этикеток</h2>

    <Message v-if="!nurseryStore.hasFeature('feature_qr')" severity="warn">
      Функция доступна на платном тарифе.
    </Message>

    <template v-else>
      <div class="labelsPage__card">
        <h3>Выберите растения</h3>
        <DataTable
          v-model:selection="selectedPlants"
          :value="plantsStore.plants"
          dataKey="id"
          selectionMode="multiple"
          size="small"
          stripedRows
        >
          <Column selectionMode="multiple" style="width: 3rem" />
          <Column field="numeric_code" header="Код" />
          <Column header="Вид / Сорт">
            <template #body="{ data }">
              <div>{{ data.display_name_ru }}</div>
              <div v-if="data.variety" class="labelsPage__muted">{{ data.variety }}</div>
            </template>
          </Column>
          <Column header="Контейнер">
            <template #body="{ data }">{{ data.container_code || '—' }}</template>
          </Column>
        </DataTable>
      </div>

      <div class="labelsPage__controls">
        <div>
          <span class="labelsPage__controlLabel">Формат:</span>
          <SelectButton
            v-model="layout"
            :options="LAYOUT_OPTIONS"
            optionLabel="label"
            optionValue="value"
          />
        </div>
        <div class="labelsPage__muted">
          Выбрано: {{ selectedPlants.length }} растений
        </div>
      </div>

      <Button
        :disabled="!selectedPlants.length"
        :loading="isGenerating"
        icon="pi pi-download"
        label="Скачать PDF"
        @click="handleGenerate"
      />
    </template>
  </section>
</template>

<script setup>
import { useNurseryStore } from '@/stores/nursery.store'
import { usePlantsStore } from '@/stores/plants.store'
import { generateLabelsPdf } from '@/utils/generateLabels'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import { onMounted, ref } from 'vue'

defineOptions({ name: 'LabelsPage' })

const LAYOUT_OPTIONS = [
  { label: 'Сетка 4x3', value: 'grid' },
  { label: 'Один на лист', value: 'single' }
]

const plantsStore = usePlantsStore()
const nurseryStore = useNurseryStore()
const selectedPlants = ref([])
const layout = ref('grid')
const isGenerating = ref(false)

onMounted(async () => {
  await plantsStore.fetchPlants()
})

async function handleGenerate() {
  isGenerating.value = true

  const pdfBytes = await generateLabelsPdf(selectedPlants.value, layout.value)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `labels_${Date.now()}.pdf`
  link.click()
  URL.revokeObjectURL(url)

  isGenerating.value = false
}
</script>

<style lang="scss" scoped>
.labelsPage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.labelsPage__card {
  background: #ffffff;
  border-radius: 10px;
  padding: 12px;
}

.labelsPage__controls {
  display: flex;
  align-items: center;
  gap: 24px;
}

.labelsPage__controlLabel {
  margin-right: 8px;
}

.labelsPage__muted {
  color: #6b7280;
  font-size: 13px;
}
</style>
