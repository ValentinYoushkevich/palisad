import App from '@/App.vue'
import '@/assets/main.css'
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

app.use(pinia)
app.use(router)
app.use(PrimeVue)
app.use(ToastService)
app.use(ConfirmationService)

app.mount('#app')

http.get('/health').catch(() => {})
registerServiceWorker()
