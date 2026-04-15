<template>
  <section class="page-shell flex flex-col gap-3">
    <h2>Печать этикеток</h2>

    <Message v-if="!nurseryStore.hasFeature('feature_qr')" severity="warn">
      Функция доступна на платном тарифе.
    </Message>

    <template v-else>
      <div class="rounded-[10px] bg-white p-3">
        <h3>Выберите растения</h3>
        <DataTable
          v-model:selection="selectedPlants"
          :value="plantsStore.plants"
          dataKey="id"
          :rows="20"
          :rowsPerPageOptions="[20, 50, 100]"
          paginator
          selectionMode="multiple"
          size="small"
          stripedRows
        >
          <template #empty>
            <div class="py-6 text-center text-sm text-slate-500">
              Растения не добавлены
            </div>
          </template>

          <Column selectionMode="multiple" style="width: 3rem" />
          <Column field="numeric_code" header="Код" />
          <Column header="Вид / Сорт">
            <template #body="{ data }">
              <div>{{ data.display_name_ru }}</div>
              <div v-if="data.variety" class="text-sm text-gray-500">{{ data.variety }}</div>
            </template>
          </Column>
          <Column header="Контейнер">
            <template #body="{ data }">{{ data.container_code || '—' }}</template>
          </Column>
        </DataTable>
      </div>

      <div class="page-panel labelsPage__controls">
        <div class="labelsPage__format">
          <span class="labelsPage__muted">Формат:</span>
          <SelectButton v-model="layout" :options="LAYOUT_OPTIONS" optionLabel="label" optionValue="value" />
        </div>
        <div class="labelsPage__muted">
          Выбрано: {{ selectedPlants.length }} растений
        </div>
        <Button
          :disabled="!selectedPlants.length"
          :loading="isGenerating"
          icon="pi pi-download"
          label="Скачать PDF"
          @click="handleGenerate"
        />
      </div>
    </template>
  </section>
</template>

<script setup>
import { useNurseryStore } from '@/stores/nursery.store'
import { usePlantsStore } from '@/stores/plants.store'
import { generateLabelsPdf } from '@/utils/generateLabels'
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
.labelsPage__controls {
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: space-between;
  flex-wrap: wrap;
}

.labelsPage__format {
  display: flex;
  align-items: center;
  gap: 8px;
}

.labelsPage__muted {
  color: #6b7280;
  font-size: 14px;
}
</style>
