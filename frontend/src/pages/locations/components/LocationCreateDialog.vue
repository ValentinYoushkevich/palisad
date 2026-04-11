<template>
  <Dialog
    :visible="visible"
    header="Новая локация"
    modal
    style="width: 420px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createLocationName">Название *</label>
      <InputText id="createLocationName" v-model="form.name" class="w-full" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createLocationType">Тип *</label>
      <Select
        id="createLocationType"
        v-model="form.type"
        :options="typeOptions"
        :disabled="!typeOptions.length"
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
      <Button :loading="locationsStore.isLoading" label="Создать" @click="handleCreate" />
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

const TYPE_LEVEL = {
  area: 0,
  section: 1,
  row: 2,
  place: 3
}

const ALL_TYPE_OPTIONS = [
  { label: 'Участок', value: 'area' },
  { label: 'Секция', value: 'section' },
  { label: 'Ряд', value: 'row' },
  { label: 'Место', value: 'place' }
]

const typeOptions = computed(() => {
  if (!props.parentType) {
    return ALL_TYPE_OPTIONS
  }
  const parentLevel = TYPE_LEVEL[props.parentType]
  if (parentLevel === undefined) {
    return ALL_TYPE_OPTIONS
  }
  return ALL_TYPE_OPTIONS.filter((o) => TYPE_LEVEL[o.value] > parentLevel)
})

const form = ref({
  name: '',
  type: 'area'
})

watch(
  () => [props.visible, props.parentType],
  () => {
    if (!props.visible) {
      return
    }
    const opts = typeOptions.value
    if (!opts.length) {
      return
    }
    if (!props.parentType) {
      form.value.type = 'area'
      return
    }
    if (!opts.some((o) => o.value === form.value.type)) {
      form.value.type = opts[0].value
    }
  },
  { flush: 'post' }
)

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleCreate() {
  const payload = {
    name: form.value.name,
    type: form.value.type
  }

  if (props.parentId) {
    payload.parentId = props.parentId
  }

  const result = await locationsStore.createLocation(payload)

  if (!result?.ok) {
    return
  }

  form.value = {
    name: '',
    type: props.parentType ? (typeOptions.value[0]?.value ?? 'section') : 'area'
  }

  emit('created')
  emitVisible(false)
}
</script>
