<template>
  <section class="flex min-h-screen items-center justify-center bg-gray-100 p-6">
    <form class="flex w-full max-w-[520px] flex-col gap-3.5 px-2" @submit.prevent="submitLogin">
      <h1 class="m-0 text-center text-xl font-bold">Palisade</h1>
      <p class="mb-5 mt-0 text-center text-sm text-gray-500">Войдите в систему</p>

      <div class="loginCard__field flex flex-col gap-1.5">
        <label for="email">Email</label>
        <InputText id="email" v-model="email" type="email" autocomplete="username" />
      </div>

      <div class="loginCard__field flex flex-col gap-1.5">
        <label for="password">Пароль</label>
        <Password id="password" v-model="password" :feedback="false" toggleMask :inputProps="{ autocomplete: 'current-password' }" />
      </div>

      <Message v-if="errorText" severity="error">{{ errorText }}</Message>

      <Button :loading="authStore.isLoading" label="Войти" type="submit" />

      <button
        v-tooltip.top="'Функция будет доступна в следующем релизе'"
        class="cursor-not-allowed self-center border-none bg-transparent text-xs text-gray-400 underline"
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
.loginCard__field :deep(.p-password) {
  width: 100%;
}

.loginCard__field :deep(.p-password-input) {
  width: 100%;
}

</style>
