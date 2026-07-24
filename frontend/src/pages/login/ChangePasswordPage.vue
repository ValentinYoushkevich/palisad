<template>
  <section class="changePasswordPage">
    <form class="changePasswordPage__card" @submit.prevent="submitChangePassword">
      <h1 class="changePasswordPage__title">Смена пароля</h1>
      <p class="changePasswordPage__subtitle">Для продолжения необходимо обновить пароль.</p>

      <div class="changePasswordPage__field">
        <label for="currentPassword">Текущий пароль</label>
        <Password id="currentPassword" v-model="currentPassword" :feedback="false" toggleMask />
      </div>

      <div class="changePasswordPage__field">
        <label for="newPassword">Новый пароль</label>
        <Password id="newPassword" v-model="newPassword" toggleMask />
      </div>

      <div class="changePasswordPage__field">
        <label for="confirmPassword">Подтверждение пароля</label>
        <Password id="confirmPassword" v-model="confirmPassword" :feedback="false" toggleMask />
      </div>

      <Message v-if="errorText" severity="error">{{ errorText }}</Message>
      <Message v-if="successText" severity="success">{{ successText }}</Message>

      <div class="changePasswordPage__actions">
        <Button :loading="authStore.isLoading" label="Сохранить пароль" type="submit" />
        <Button
          :disabled="authStore.isLoading"
          label="Выйти"
          severity="secondary"
          outlined
          @click="logout"
        />
      </div>
    </form>
  </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth.store'
import { useConfirm } from 'primevue/useconfirm'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'ChangePasswordPage' })

const router = useRouter()
const authStore = useAuthStore()
const confirm = useConfirm()
const errorText = ref('')
const successText = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

async function logout() {
  const result = await authStore.logout()

  // F5: не теряем несинхронизированную очередь молча — подтверждаем выход.
  if (result?.pending) {
    confirm.require({
      header: 'Есть несохранённые изменения',
      message: 'Часть данных ещё не синхронизирована с сервером и будет потеряна при выходе. Выйти всё равно?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Выйти и удалить',
      rejectLabel: 'Отмена',
      acceptClass: 'p-button-danger',
      accept: async () => {
        await authStore.logout({ force: true })
        await router.push('/login')
      }
    })
    return
  }

  await router.push('/login')
}

async function submitChangePassword() {
  errorText.value = ''
  successText.value = ''

  if (!currentPassword.value || !newPassword.value) {
    errorText.value = 'Заполните оба поля пароля.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorText.value = 'Пароли не совпадают.'
    return
  }

  const result = await authStore.changePassword(currentPassword.value, newPassword.value)

  if (!result?.ok) {
    errorText.value = result?.error || authStore.authError || 'Не удалось обновить пароль.'
    return
  }

  successText.value = 'Пароль обновлен. Перенаправляем на страницу растений...'
  await router.push('/plants')
}
</script>

<style lang="scss" scoped>
.changePasswordPage {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f3f4f6;
}

.changePasswordPage__card {
  width: 100%;
  max-width: 460px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changePasswordPage__title {
  margin: 0;
  font-size: 24px;
}

.changePasswordPage__subtitle {
  margin: 0;
  color: #6b7280;
}

.changePasswordPage__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.changePasswordPage__actions {
  display: flex;
  gap: 8px;
}

.changePasswordPage__field :deep(.p-password),
.changePasswordPage__field :deep(.p-password-input) {
  width: 100%;
}
</style>
