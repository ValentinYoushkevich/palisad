<template>
  <Dialog
    :visible="visible"
    header="Новый сотрудник"
    modal
    style="width: 440px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createName">Имя *</label>
      <InputText id="createName" v-model="form.name" class="w-full" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createRole">Роль *</label>
      <Select
        id="createRole"
        v-model="form.role"
        :options="ROLE_OPTIONS"
        class="w-full"
        optionLabel="label"
        optionValue="value"
      />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createEmail">Email</label>
      <InputText id="createEmail" v-model="form.email" class="w-full" type="email" />
    </div>
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="createPassword">Временный пароль *</label>
      <Password id="createPassword" v-model="form.password" :feedback="false" toggleMask />
    </div>

    <Message v-if="staffStore.staffError" severity="error">{{ staffStore.staffError }}</Message>

    <template #footer>
      <Button label="Отмена" text @click="emitVisible(false)" />
      <Button :loading="staffStore.isLoading" label="Создать" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script setup>
import { useStaffStore } from '@/stores/staff.store'
import { ref } from 'vue'

defineOptions({ name: 'StaffCreateDialog' })

defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'created'])
const staffStore = useStaffStore()

const ROLE_OPTIONS = [
  { label: 'Агроном', value: 'agronomist' },
  { label: 'Работник', value: 'worker' },
  { label: 'Наблюдатель', value: 'observer' }
]

const form = ref({
  name: '',
  role: 'worker',
  email: '',
  password: ''
})

function emitVisible(value) {
  emit('update:visible', value)
}

async function handleCreate() {
  const result = await staffStore.createUser({
    name: form.value.name,
    role: form.value.role,
    email: form.value.email,
    password: form.value.password
  })

  if (!result?.ok) {
    return
  }

  form.value = {
    name: '',
    role: 'worker',
    email: '',
    password: ''
  }
  emit('created')
}
</script>
