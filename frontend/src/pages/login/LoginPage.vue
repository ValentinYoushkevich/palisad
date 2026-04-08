<template>
  <section class="login">
    <h2>Login</h2>
    <p>Страница авторизации для MVP.</p>
    <Button label="Имитация входа" @click="mockLogin" />
  </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth.store'
import Button from 'primevue/button'
import { useRoute, useRouter } from 'vue-router'

defineOptions({ name: 'LoginPage' })

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

function mockLogin() {
  authStore.setTokens('mock-access-token', 'mock-refresh-token')
  const redirectTo = route.query.redirect || '/'
  router.push(redirectTo)
}
</script>

<style lang="scss" scoped>
.login {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 320px;
}
</style>
