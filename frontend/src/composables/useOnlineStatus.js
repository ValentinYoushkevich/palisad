import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function useOnlineStatus() {
  const isOnline = ref(navigator.onLine)

  const setOnline = () => {
    isOnline.value = true
  }

  const setOffline = () => {
    isOnline.value = false
  }

  onMounted(() => {
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('online', setOnline)
    window.removeEventListener('offline', setOffline)
  })

  return {
    isOnline: computed(() => isOnline.value)
  }
}
