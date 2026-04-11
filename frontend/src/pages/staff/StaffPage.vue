<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2>Сотрудники</h2>
      <Button
        v-if="authStore.canManageStaff"
        icon="pi pi-plus"
        label="Добавить"
        @click="createVisible = true"
      />
    </div>

    <Message v-if="staffStore.staffError" severity="error">{{ staffStore.staffError }}</Message>

    <DataTable
      :value="staffStore.users"
      :loading="staffStore.isLoading"
      :rows="20"
      :rowsPerPageOptions="[20, 50, 100]"
      paginator
      stripedRows
      size="small"
    >
      <template #empty>
        <div class="py-6 text-center text-sm text-slate-500">
          Сотрудники не добавлены
        </div>
      </template>

      <Column field="name" header="Имя" />
      <Column field="role" header="Роль">
        <template #body="{ data }">
          <Tag :value="roleLabel(data.role)" :severity="roleSeverity(data.role)" />
        </template>
      </Column>
      <Column field="email" header="Email" />
      <Column header="Статус">
        <template #body="{ data }">
          <Tag :severity="statusSeverity(data)" :value="statusLabel(data)" />
        </template>
      </Column>
      <Column v-if="authStore.canManageStaff" header="Действия">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button icon="pi pi-pencil" text @click="openEdit(data)" />
            <Button
              :icon="toggleIcon(data)"
              :severity="toggleSeverity(data)"
              text
              @click="handleToggle(data.id)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <StaffCreateDialog v-model:visible="createVisible" @created="handleCreated" />
    <StaffEditDialog v-model:visible="editVisible" :user="selectedUser" @updated="handleUpdated" />
  </section>
</template>

<script setup>
import StaffCreateDialog from '@/pages/staff/components/StaffCreateDialog.vue'
import StaffEditDialog from '@/pages/staff/components/StaffEditDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useStaffStore } from '@/stores/staff.store'
import { onMounted, ref } from 'vue'

defineOptions({ name: 'StaffPage' })

const ROLE_LABELS = {
  owner: 'Владелец',
  agronomist: 'Агроном',
  worker: 'Работник',
  observer: 'Наблюдатель'
}

const ROLE_SEVERITY = {
  owner: 'danger',
  agronomist: 'warning',
  worker: 'info',
  observer: 'secondary'
}

const authStore = useAuthStore()
const staffStore = useStaffStore()
const createVisible = ref(false)
const editVisible = ref(false)
const selectedUser = ref(null)

onMounted(async () => {
  await staffStore.fetchUsers()
})

function openEdit(user) {
  selectedUser.value = user
  editVisible.value = true
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role
}

function roleSeverity(role) {
  return ROLE_SEVERITY[role] || 'secondary'
}

function statusLabel(user) {
  return user.is_active ? 'Активен' : 'Неактивен'
}

function statusSeverity(user) {
  return user.is_active ? 'success' : 'secondary'
}

function toggleIcon(user) {
  return user.is_active ? 'pi pi-ban' : 'pi pi-check'
}

function toggleSeverity(user) {
  return user.is_active ? 'danger' : 'success'
}

async function handleToggle(id) {
  await staffStore.toggleStatus(id)
}

async function handleCreated() {
  createVisible.value = false
  await staffStore.fetchUsers()
}

async function handleUpdated() {
  editVisible.value = false
  await staffStore.fetchUsers()
}
</script>
