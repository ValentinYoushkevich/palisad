<template>
  <section class="login">
    <h2>Login</h2>
    <p>Войдите в систему, чтобы продолжить.</p>

    <div class="login__field">
      <label for="email">Email</label>
      <InputText id="email" v-model="email" type="email" />
    </div>

    <div class="login__field">
      <label for="password">Password</label>
      <Password id="password" v-model="password" :feedback="false" toggleMask />
    </div>

    <Message v-if="errorText" severity="error">{{ errorText }}</Message>

    <Button :loading="authStore.isLoading" label="Sign in" @click="submitLogin" />
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
    errorText.value = 'Введите email и password.'
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
.login {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 320px;
}

.login__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
