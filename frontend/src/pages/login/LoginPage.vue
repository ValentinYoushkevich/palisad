<template>
  <section class="loginPage">
    <form class="loginCard" @submit.prevent="submitLogin">
      <h1 class="loginCard__title">Palisade</h1>
      <p class="loginCard__subtitle">Войдите в систему</p>

      <div class="loginCard__field">
        <label for="email">Email</label>
        <InputText id="email" v-model="email" type="email" autocomplete="username" />
      </div>

      <div class="loginCard__field">
        <label for="password">Пароль</label>
        <Password id="password" v-model="password" :feedback="false" toggleMask :inputProps="{ autocomplete: 'current-password' }" />
      </div>

      <Message v-if="errorText" severity="error">{{ errorText }}</Message>

      <Button :loading="authStore.isLoading" label="Войти" type="submit" />

      <button
        v-tooltip.top="'Функция будет доступна в следующем релизе'"
        class="loginCard__forgot"
        type="button"
        disabled
      >
        Забыли пароль?
      </button>
    </form>
  </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth.store'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

defineOptions({ name: 'LoginPage' })

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const errorText = ref('')
const email = ref('')
const password = ref('')

async function submitLogin() {
  errorText.value = ''

  if (!email.value || !password.value) {
    errorText.value = 'Введите email и пароль.'
    return
  }

  const result = await authStore.login(email.value, password.value)

  if (!result?.ok) {
    errorText.value = result?.error || authStore.authError || 'Не удалось выполнить вход. Проверьте данные.'
    return
  }

  const redirectTo = route.query.redirect || result.redirect
  await router.push(redirectTo)
}
</script>

<style lang="scss" scoped>
.loginPage {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f3f4f6;
}

.loginCard {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 8px;
}

.loginCard__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  text-align: center;
}

.loginCard__subtitle {
  margin: 0 0 20px;
  font-size: 13px;
  color: #6b7280;
  text-align: center;
}

.loginCard__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.loginCard__field :deep(.p-password) {
  width: 100%;
}

.loginCard__field :deep(.p-password-input) {
  width: 100%;
}

.loginCard__forgot {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  text-decoration: underline;
  cursor: not-allowed;
  align-self: center;
}
</style>
