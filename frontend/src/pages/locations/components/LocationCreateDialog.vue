<template>
  <Dialog
    :visible="visible"
    :header="dialogHeader"
    modal
    style="width: 420px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createLocationName">Название *</label>
      <InputText
        id="createLocationName"
        v-model="form.name"
        class="w-full"
        autofocus
        @keyup.enter="handleCreate"
      />
    </div>

    <Message v-if="locationsStore.locationsError" severity="error">
      {{ locationsStore.locationsError }}
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button
        :loading="locationsStore.isLoading"
        label="Создать"
        :disabled="!form.name.trim()"
        @click="handleCreate"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { useLocationsStore } from '@/stores/locations.store'
import { computed, ref, watch } from 'vue'

defineOptions({ name: 'LocationCreateDialog' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  parentId: {
    type: String,
    default: null
  },
  parentType: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'created'])
const locationsStore = useLocationsStore()

// Автоматически определяем тип нового элемента по родителю
const CHILD_TYPE = {
  area: 'section',
  section: 'row',
  row: 'place',
}
const TYPE_LABELS = {
  area: 'участок',
  section: 'секцию',
  row: 'ряд',
  place: 'место',
}

const inferredType = computed(() => {
  if (!props.parentType) return 'area'
  return CHILD_TYPE[props.parentType] ?? 'place'
})

const dialogHeader = computed(() => {
  const label = TYPE_LABELS[inferredType.value] ?? 'локацию'
  return `Новая ${label}`
})

const form = ref({ name: '' })

watch(
  () => props.visible,
  (val) => {
    if (val) form.value = { name: '' }
  }
)

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleCreate() {
  if (!form.value.name.trim()) return

  const payload = {
    name: form.value.name.trim(),
    type: inferredType.value,
  }

  if (props.parentId) {
    payload.parentId = props.parentId
  }

  const result = await locationsStore.createLocation(payload)

  if (!result?.ok) return

  form.value = { name: '' }
  emit('created')
  emitVisible(false)
}
</script>
