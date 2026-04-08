<template>
  <section class="changePassword">
    <h2>Change password</h2>
    <p>Для продолжения необходимо обновить пароль.</p>

    <div class="changePassword__field">
      <label for="currentPassword">Current password</label>
      <Password
        id="currentPassword"
        v-model="currentPassword"
        :feedback="false"
        toggleMask
      />
    </div>

    <div class="changePassword__field">
      <label for="newPassword">New password</label>
      <Password id="newPassword" v-model="newPassword" toggleMask />
    </div>

    <div class="changePassword__field">
      <label for="confirmPassword">Confirm password</label>
      <Password id="confirmPassword" v-model="confirmPassword" :feedback="false" toggleMask />
    </div>

    <Message v-if="errorText" severity="error">{{ errorText }}</Message>
    <Message v-if="successText" severity="success">{{ successText }}</Message>

    <div class="changePassword__actions">
      <Button :loading="authStore.isLoading" label="Save new password" @click="submitChangePassword" />
      <Button
        :disabled="authStore.isLoading"
        label="Logout"
        severity="secondary"
        outlined
        @click="logout"
      />
    </div>
  </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth.store'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'ChangePasswordPage' })

const router = useRouter()
const authStore = useAuthStore()
const errorText = ref('')
const successText = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

async function logout() {
  await authStore.logout()
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

  try {
    await authStore.changePassword(currentPassword.value, newPassword.value)
    successText.value = 'Пароль обновлен. Перенаправляем на страницу растений...'
    await router.push('/plants')
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Change password failed', error)
    }
    errorText.value = 'Не удалось обновить пароль.'
  }
}
</script>

<style lang="scss" scoped>
.changePassword {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
}

.changePassword__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.changePassword__actions {
  display: flex;
  gap: 8px;
}
</style>
