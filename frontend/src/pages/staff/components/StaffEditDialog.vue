<template>
  <Dialog
    :visible="visible"
    header="Редактирование сотрудника"
    modal
    style="width: 440px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editName">Имя</label>
      <InputText id="editName" v-model="form.name" class="w-full" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editRole">Роль</label>
      <Select
        id="editRole"
        v-model="form.role"
        :options="ROLE_OPTIONS"
        class="w-full"
        optionLabel="label"
        optionValue="value"
      />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="editEmail">Email</label>
      <InputText id="editEmail" v-model="form.email" class="w-full" type="email" />
    </div>

    <Message v-if="staffStore.staffError" severity="error">{{ staffStore.staffError }}</Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="staffStore.isLoading" label="Сохранить" @click="handleSave" />
    </template>
  </Dialog>
</template>

<script setup>
import { useStaffStore } from '@/stores/staff.store'
import { ref, watch } from 'vue'

defineOptions({ name: 'StaffEditDialog' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  user: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'updated'])
const staffStore = useStaffStore()

const ROLE_OPTIONS = [
  { label: 'Агроном', value: 'agronomist' },
  { label: 'Работник', value: 'worker' },
  { label: 'Наблюдатель', value: 'observer' }
]

const form = ref({
  name: '',
  role: 'worker',
  email: ''
})

watch(
  () => props.user,
  (user) => {
    if (!user) {
      return
    }

    form.value = {
      name: user.name || '',
      role: user.role || 'worker',
      email: user.email || ''
    }
  },
  { immediate: true }
)

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleSave() {
  if (!props.user?.id) {
    return
  }

  if (form.value.role !== props.user.role) {
    const roleResult = await staffStore.changeRole(props.user.id, form.value.role)
    if (!roleResult?.ok) {
      return
    }
  }

  const updateResult = await staffStore.updateUser(props.user.id, {
    name: form.value.name,
    email: form.value.email
  })

  if (!updateResult?.ok) {
    return
  }

  emit('updated')
}
</script>
