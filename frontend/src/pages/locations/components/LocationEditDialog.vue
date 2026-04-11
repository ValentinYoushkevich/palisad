<template>
  <Dialog
    :visible="visible"
    header="Редактирование локации"
    modal
    style="width: 420px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editLocationName">Название</label>
      <InputText id="editLocationName" v-model="form.name" class="w-full" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editLocationType">Тип</label>
      <Select
        id="editLocationType"
        v-model="form.type"
        :options="TYPE_OPTIONS"
        class="w-full"
        optionLabel="label"
        optionValue="value"
      />
    </div>

    <Message v-if="locationsStore.locationsError" severity="error">
      {{ locationsStore.locationsError }}
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="locationsStore.isLoading" label="Сохранить" @click="handleSave" />
    </template>
  </Dialog>
</template>

<script setup>
import { useLocationsStore } from '@/stores/locations.store'
import { ref, watch } from 'vue'

defineOptions({ name: 'LocationEditDialog' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  location: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'updated'])
const locationsStore = useLocationsStore()

const TYPE_OPTIONS = [
  { label: 'Участок', value: 'area' },
  { label: 'Секция', value: 'section' },
  { label: 'Ряд', value: 'row' },
  { label: 'Место', value: 'place' }
]

const form = ref({
  name: '',
  type: 'section'
})

watch(
  () => props.location,
  (location) => {
    if (!location) {
      return
    }

    form.value = {
      name: location.name || '',
      type: location.type || 'section'
    }
  },
  { immediate: true }
)

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleSave() {
  if (!props.location?.id) {
    return
  }

  const result = await locationsStore.updateLocation(props.location.id, {
    name: form.value.name,
    type: form.value.type
  })

  if (!result?.ok) {
    return
  }

  emit('updated')
  emitVisible(false)
}
</script>
