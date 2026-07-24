import { ref } from 'vue'

// F16: модульный синглтон онлайн-статуса. Раньше composable вешал слушатели через
// onMounted, поэтому при вызове внутри Pinia-actions (вне setup) слушатели не
// навешивались, а `isOnline` был разовым снапшотом navigator.onLine, который никогда не
// обновлялся. Теперь ref и слушатели online/offline создаются один раз на уровне модуля —
// значение реактивно и актуально и в setup-компонентах, и в actions.
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

function setOnline() {
  isOnline.value = true
}

function setOffline() {
  isOnline.value = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOffline)
}

// Для чтения внутри actions/сервисов — берём общий ref напрямую, не создавая инстанс.
export { isOnline }

// Совместимость с setup-компонентами: возвращаем тот же синглтон.
export function useOnlineStatus() {
  return { isOnline }
}
