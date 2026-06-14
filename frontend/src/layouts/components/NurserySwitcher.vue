<template>
  <div v-if="nurseryStore.nurseries.length" class="switcher">
    <label class="switcher__field">
      <span class="switcher__caption">Питомник</span>
      <select
        class="switcher__select"
        :value="nurseryStore.activeNurseryId || ''"
        :disabled="nurseryStore.isLoading"
        @change="onChange"
      >
        <option v-for="n in nurseryStore.nurseries" :key="n.id" :value="n.id">
          {{ n.name }}
        </option>
      </select>
    </label>
    <button class="switcher__add" type="button" title="Создать питомник" @click="goCreate">
      +
    </button>
  </div>
</template>

<script setup>
import { useNurserySwitch } from '@/composables/useNurserySwitch'
import { useNurseryStore } from '@/stores/nursery.store'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'

defineOptions({ name: 'NurserySwitcher' })

const nurseryStore = useNurseryStore()
const router = useRouter()
const toast = useToast()
const { switchTo } = useNurserySwitch()

async function onChange(event) {
  const nurseryId = event.target.value
  const result = await switchTo(nurseryId)
  if (!result.ok) {
    // вернуть селект к активному значению (переключение не состоялось)
    event.target.value = nurseryStore.activeNurseryId || ''
    toast.add({
      severity: 'warn',
      summary: 'Питомник не переключён',
      detail: result.error || 'Не удалось переключить питомник.',
      life: 6000
    })
  }
}

function goCreate() {
  router.push('/nursery/create')
}
</script>

<style lang="scss" scoped>
.switcher {
  display: flex;
  align-items: center;
  gap: 6px;
}

.switcher__field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.switcher__caption {
  color: #cbd5e1;
  font-size: 12px;
}

.switcher__select {
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 8px;
  max-width: 200px;
}

.switcher__add {
  background: #1f2937;
  color: #f9fafb;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
</style>
