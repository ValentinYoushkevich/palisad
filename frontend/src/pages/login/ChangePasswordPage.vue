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

    <Message v-if="errorText" severity="error">{{ errorText }}</Message>
    <Message v-if="successText" severity="success">{{ successText }}</Message>

    <div class="changePassword__actions">
      <Button :loading="isSaving" label="Save new password" @click="submitChangePassword" />
      <Button
        :disabled="isSaving"
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
const isSaving = ref(false)
const errorText = ref('')
const successText = ref('')
const currentPassword = ref('')
const newPassword = ref('')

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

  isSaving.value = true

  try {
    await authStore.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    })
    successText.value = 'Пароль обновлен. Перенаправляем на главную...'
    await router.push('/')
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Change password failed', error)
    }
    errorText.value = 'Не удалось обновить пароль.'
  } finally {
    isSaving.value = false
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
