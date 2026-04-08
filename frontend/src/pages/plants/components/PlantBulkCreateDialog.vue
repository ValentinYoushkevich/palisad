<template>
  <Dialog
    :visible="visible"
    header="Массовый ввод растений"
    modal
    style="width: 460px"
    @update:visible="emitVisible"
  >
    <div class="field">
      <label for="bulkCount">Количество *</label>
      <InputNumber id="bulkCount" v-model="count" :max="500" :min="1" showButtons />
    </div>
    <div class="field">
      <label for="bulkSpecies">Вид</label>
      <Dropdown
        id="bulkSpecies"
        v-model="template.speciesId"
        :options="speciesStore.activeSpecies"
        optionLabel="display_name_ru"
        optionValue="id"
        class="w-full"
      />
    </div>
    <div class="field">
      <label for="bulkLocation">Локация</label>
      <Dropdown
        id="bulkLocation"
        v-model="template.locationId"
        :options="locationsStore.flatList"
        optionLabel="name"
        optionValue="id"
        class="w-full"
      />
    </div>

    <Message v-if="plantsStore.plantsError" severity="error">{{ plantsStore.plantsError }}</Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="plantsStore.isLoading" label="Создать" @click="handleBulkCreate" />
    </template>
  </Dialog>
</template>

<script setup>
import { useLocationsStore } from '@/stores/locations.store'
import { usePlantsStore } from '@/stores/plants.store'
import { useSpeciesStore } from '@/stores/species.store'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import { ref } from 'vue'

defineOptions({ name: 'PlantBulkCreateDialog' })

defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'created'])
const plantsStore = usePlantsStore()
const speciesStore = useSpeciesStore()
const locationsStore = useLocationsStore()

const count = ref(10)
const template = ref({
  speciesId: null,
  locationId: null,
  containerId: null,
  source: 'own'
})

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleBulkCreate() {
  const result = await plantsStore.bulkCreate(template.value, count.value)

  if (!result?.ok) {
    return
  }

  emit('created')
  emitVisible(false)
}
</script>

<style lang="scss" scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
</style>
