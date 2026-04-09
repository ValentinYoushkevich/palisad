<template>
  <Dialog
    :visible="visible"
    header="Редактирование питомника"
    modal
    style="width: 440px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editName">Название</label>
      <InputText id="editName" v-model="name" class="w-full" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editAddress">Адрес</label>
      <Textarea id="editAddress" v-model="address" class="w-full" rows="2" />
    </div>
    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="nurseryStore.isLoading" label="Сохранить" @click="handleSave" />
    </template>
  </Dialog>
</template>

<script setup>
import { useNurseryStore } from '@/stores/nursery.store'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { ref, watch } from 'vue'

defineOptions({ name: 'NurseryEditDialog' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible'])

const nurseryStore = useNurseryStore()
const name = ref('')
const address = ref('')

function emitVisible(value) {
  emit('update:visible', value)
}

watch(
  () => props.visible,
  (isVisible) => {
    if (!isVisible || !nurseryStore.nursery) {
      return
    }

    name.value = nurseryStore.nursery.name || ''
    address.value = nurseryStore.nursery.address || ''
  }
)

async function handleSave() {
  await nurseryStore.updateNursery({
    name: name.value,
    address: address.value
  })
  emitVisible(false)
}
</script>
