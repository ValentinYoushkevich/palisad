<template>
  <section class="flex max-w-[360px] flex-col gap-3">
    <h2>Change password</h2>
    <p>Для продолжения необходимо обновить пароль.</p>

    <div class="flex flex-col gap-1.5">
      <label for="currentPassword">Current password</label>
      <Password
        id="currentPassword"
        v-model="currentPassword"
        :feedback="false"
        toggleMask
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="newPassword">New password</label>
      <Password id="newPassword" v-model="newPassword" toggleMask />
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="confirmPassword">Confirm password</label>
      <Password id="confirmPassword" v-model="confirmPassword" :feedback="false" toggleMask />
    </div>

    <Message v-if="errorText" severity="error">{{ errorText }}</Message>
    <Message v-if="successText" severity="success">{{ successText }}</Message>

    <div class="flex gap-2">
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

  const result = await authStore.changePassword(currentPassword.value, newPassword.value)

  if (!result?.ok) {
    errorText.value = result?.error || authStore.authError || 'Не удалось обновить пароль.'
    return
  }

  successText.value = 'Пароль обновлен. Перенаправляем на страницу растений...'
  await router.push('/plants')
}
</script>
