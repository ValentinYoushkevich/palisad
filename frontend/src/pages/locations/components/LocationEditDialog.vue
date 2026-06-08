<template>
  <Dialog
    :visible="visible"
    header="Редактирование"
    modal
    style="width: 420px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editLocationName">Название</label>
      <InputText
        id="editLocationName"
        v-model="form.name"
        class="w-full"
        autofocus
        @keyup.enter="handleSave"
      />
    </div>

    <Message v-if="locationsStore.locationsError" severity="error">
      {{ locationsStore.locationsError }}
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button
        :loading="locationsStore.isLoading"
        label="Сохранить"
        :disabled="!form.name.trim()"
        @click="handleSave"
      />
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

const form = ref({ name: '' })

watch(
  () => props.location,
  (location) => {
    if (location) form.value = { name: location.name || '' }
  },
  { immediate: true }
)

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleSave() {
  if (!props.location?.id || !form.value.name.trim()) return

  const result = await locationsStore.updateLocation(props.location.id, {
    name: form.value.name.trim(),
    type: props.location.type,
  })

  if (!result?.ok) return

  emit('updated')
  emitVisible(false)
}
</script>
