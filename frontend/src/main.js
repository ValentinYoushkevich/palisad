import App from '@/App.vue'
import '@/assets/main.css'
import db from '@/db/indexedDb'
import { registerServiceWorker } from '@/registerServiceWorker'
import router from '@/router'
import http from '@/services/http'
import { createPinia } from 'pinia'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import 'primevue/resources/primevue.min.css'
import 'primevue/resources/themes/lara-light-blue/theme.css'
import ToastService from 'primevue/toastservice'
import { createApp } from 'vue'

const app = createApp(App)
const pinia = createPinia()

// Разрешить регистрацию service worker в dev-режиме (для отладки offline/cache).
const SW_ENABLE_IN_DEV = false
// Включить подробные логи service worker в консоли браузера.
const SW_DEBUG = false

app.use(pinia)
app.use(router)
app.use(PrimeVue)
app.use(ToastService)
app.use(ConfirmationService)

db.open().catch((error) => {
  console.error('Dexie open failed:', error)
})

app.mount('#app')

http.get('/health').catch(() => {})
registerServiceWorker({
  enableInDev: SW_ENABLE_IN_DEV,
  debug: SW_DEBUG
})
