# MODULE_4 — Frontend: Staff

**Зависит от:** MODULE_3

---

## Шаг 1. API

`src/api/staff.api.js`:

```js
import api from '@/api/index.js';

const base = (nurseryId) => `/nurseries/${nurseryId}/users`;

export const staffApi = {
  getAll:       (nurseryId, params) => api.get(base(nurseryId), { params }),
  getById:      (nurseryId, id) => api.get(`${base(nurseryId)}/${id}`),
  create:       (nurseryId, data) => api.post(base(nurseryId), data),
  update:       (nurseryId, id, data) => api.patch(`${base(nurseryId)}/${id}`, data),
  changeRole:   (nurseryId, id, role) => api.patch(`${base(nurseryId)}/${id}/role`, { role }),
  toggleStatus: (nurseryId, id) => api.patch(`${base(nurseryId)}/${id}/status`),
};
```

---

## Шаг 2. Pinia store

`src/stores/staff.store.js`:

```js
import { defineStore } from 'pinia';
import { staffApi } from '@/api/staff.api.js';
import { useNurseryStore } from '@/stores/nursery.store.js';

export const useStaffStore = defineStore('staff', {
  state: () => ({
    users: [],
    isLoading: false,
  }),

  getters: {
    activeUsers: (state) => state.users.filter(u => u.is_active),

    byRole: (state) => (role) => state.users.filter(u => u.role === role),
  },

  actions: {
    async fetchUsers(filters = {}) {
      const nursery = useNurseryStore();
      this.isLoading = true;
      try {
        const { data } = await staffApi.getAll(nursery.nurseryId, filters);
        this.users = data;
      } finally {
        this.isLoading = false;
      }
    },

    async createUser(formData) {
      const nursery = useNurseryStore();
      const { data } = await staffApi.create(nursery.nurseryId, formData);
      this.users.push(data);
    },

    async updateUser(id, formData) {
      const nursery = useNurseryStore();
      const { data } = await staffApi.update(nursery.nurseryId, id, formData);
      updateInList(this.users, data);
    },

    async changeRole(id, role) {
      const nursery = useNurseryStore();
      const { data } = await staffApi.changeRole(nursery.nurseryId, id, role);
      updateInList(this.users, data);
    },

    async toggleStatus(id) {
      const nursery = useNurseryStore();
      const { data } = await staffApi.toggleStatus(nursery.nurseryId, id);
      updateInList(this.users, data);
    },
  },
});

function updateInList(list, updated) {
  const idx = list.findIndex(u => u.id === updated.id);
  if (idx !== -1) list.splice(idx, 1, updated);
}
```

---

## Шаг 3. StaffPage

`src/pages/staff/StaffPage.vue`:

```vue
<template>
  <div class="p-4">
    <div class="flex justify-content-between align-items-center mb-4">
      <h2>Сотрудники</h2>
      <Button
        v-if="auth.canManageStaff"
        label="Добавить"
        icon="pi pi-plus"
        @click="createVisible = true"
      />
    </div>

    <DataTable :value="staff.users" :loading="staff.isLoading" stripedRows>
      <Column field="name" header="Имя" />
      <Column field="role" header="Роль">
        <template #body="{ data }">
          <Tag :value="ROLE_LABELS[data.role]" :severity="ROLE_SEVERITY[data.role]" />
        </template>
      </Column>
      <Column field="email" header="Email" />
      <Column header="Статус">
        <template #body="{ data }">
          <Tag :value="data.is_active ? 'Активен' : 'Неактивен'"
               :severity="data.is_active ? 'success' : 'secondary'" />
        </template>
      </Column>
      <Column v-if="auth.canManageStaff" header="Действия" style="width: 160px">
        <template #body="{ data }">
          <Button icon="pi pi-pencil" text @click="openEdit(data)" />
          <Button
            :icon="data.is_active ? 'pi pi-ban' : 'pi pi-check'"
            text
            :severity="data.is_active ? 'danger' : 'success'"
            @click="handleToggle(data.id)"
          />
        </template>
      </Column>
    </DataTable>

    <StaffCreateDialog v-model:visible="createVisible" @created="staff.fetchUsers()" />
    <StaffEditDialog v-model:visible="editVisible" :user="selectedUser" @updated="staff.fetchUsers()" />
  </div>
</template>

<script>
import { defineOptions, ref, onMounted } from 'vue';
import { useStaffStore } from '@/stores/staff.store.js';
import { useAuthStore } from '@/stores/auth.store.js';
import StaffCreateDialog from '@/pages/staff/components/StaffCreateDialog.vue';
import StaffEditDialog from '@/pages/staff/components/StaffEditDialog.vue';

defineOptions({ name: 'StaffPage' });

const ROLE_LABELS = { owner: 'Владелец', agronomist: 'Агроном', worker: 'Работник', observer: 'Наблюдатель' };
const ROLE_SEVERITY = { owner: 'danger', agronomist: 'warning', worker: 'info', observer: 'secondary' };

const staff = useStaffStore();
const auth = useAuthStore();
const createVisible = ref(false);
const editVisible = ref(false);
const selectedUser = ref(null);

onMounted(() => staff.fetchUsers());

function openEdit(user) {
  selectedUser.value = user;
  editVisible.value = true;
}

async function handleToggle(id) {
  await staff.toggleStatus(id);
}
</script>
```

---

## Шаг 4. StaffCreateDialog

`src/pages/staff/components/StaffCreateDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Новый сотрудник" modal style="width: 440px">
    <div class="field mb-3">
      <label>Имя *</label>
      <InputText v-model="form.name" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Роль *</label>
      <Dropdown v-model="form.role" :options="ROLE_OPTIONS" optionLabel="label" optionValue="value" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Email</label>
      <InputText v-model="form.email" type="email" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Временный пароль *</label>
      <Password v-model="form.password" :feedback="false" class="w-full" inputClass="w-full" />
    </div>
    <p class="text-color-secondary text-sm">Сотрудник будет обязан сменить пароль при первом входе.</p>
    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Создать" :loading="isLoading" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref } from 'vue';
import { useStaffStore } from '@/stores/staff.store.js';

defineOptions({ name: 'StaffCreateDialog' });

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['update:visible', 'created']);

const ROLE_OPTIONS = [
  { label: 'Агроном', value: 'agronomist' },
  { label: 'Работник', value: 'worker' },
  { label: 'Наблюдатель', value: 'observer' },
];

const staff = useStaffStore();
const isLoading = ref(false);
const form = ref({ name: '', role: 'worker', email: '', password: '' });

async function handleCreate() {
  isLoading.value = true;
  try {
    await staff.createUser(form.value);
    emit('created');
    emit('update:visible', false);
    form.value = { name: '', role: 'worker', email: '', password: '' };
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## Шаг 5. StaffEditDialog

`src/pages/staff/components/StaffEditDialog.vue`:

```vue
<template>
  <Dialog v-model:visible="visible" header="Редактирование сотрудника" modal style="width: 440px">
    <div class="field mb-3">
      <label>Имя</label>
      <InputText v-model="form.name" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Роль</label>
      <Dropdown v-model="form.role" :options="ROLE_OPTIONS" optionLabel="label" optionValue="value" class="w-full" />
    </div>
    <div class="field mb-3">
      <label>Email</label>
      <InputText v-model="form.email" type="email" class="w-full" />
    </div>
    <template #footer>
      <Button label="Отмена" text @click="visible = false" />
      <Button label="Сохранить" :loading="isLoading" @click="handleSave" />
    </template>
  </Dialog>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref, watch } from 'vue';
import { useStaffStore } from '@/stores/staff.store.js';

defineOptions({ name: 'StaffEditDialog' });

const props = defineProps({ visible: Boolean, user: Object });
const emit = defineEmits(['update:visible', 'updated']);

const ROLE_OPTIONS = [
  { label: 'Агроном', value: 'agronomist' },
  { label: 'Работник', value: 'worker' },
  { label: 'Наблюдатель', value: 'observer' },
];

const staff = useStaffStore();
const isLoading = ref(false);
const form = ref({ name: '', role: '', email: '' });

watch(() => props.user, (u) => {
  if (u) form.value = { name: u.name, role: u.role, email: u.email ?? '' };
}, { immediate: true });

async function handleSave() {
  isLoading.value = true;
  try {
    if (form.value.role !== props.user.role) {
      await staff.changeRole(props.user.id, form.value.role);
    }
    await staff.updateUser(props.user.id, { name: form.value.name, email: form.value.email });
    emit('updated');
    emit('update:visible', false);
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Не-owner не видит кнопку «Добавить» | Войти как agronomist → кнопки нет |
| 2 | Новый сотрудник появляется в списке без reload | Создать → запись в таблице |
| 3 | Смена роли через Edit сохраняется | Изменить роль → в БД новое значение |
| 4 | Деактивация отображается сразу | Нажать ban → статус меняется в строке |
| 5 | Нельзя назначить роль `owner` через UI | В Dropdown нет опции `owner` |
| 6 | Список фильтруется по `is_active` | `activeUsers` геттер возвращает только активных |
