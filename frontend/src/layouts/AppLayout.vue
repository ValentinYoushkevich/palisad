<template>
  <div class="layout">
    <header class="layout__header">
      <h1 class="layout__title">Palisad</h1>
      <router-link class="layout__link" to="/">Home</router-link>
    </header>
    <main class="layout__content">
      <slot />
    </main>
  </div>
</template>

<script setup>
defineOptions({ name: 'AppLayout' })
</script>

<style lang="scss" scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout__header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #111827;
}

.layout__title {
  margin: 0;
  color: #f9fafb;
  font-size: 20px;
}

.layout__link {
  color: #f9fafb;
  text-decoration: none;
}

.layout__content {
  flex: 1;
  padding: 16px;
}
</style>
