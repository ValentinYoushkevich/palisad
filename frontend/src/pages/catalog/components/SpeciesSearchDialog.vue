<template>
  <Dialog
    :visible="visible"
    header="Добавить вид"
    modal
    style="width: 520px"
    @update:visible="emitVisible"
  >
    <div class="mb-3 flex flex-col gap-1.5">
      <label for="speciesSearch">Поиск по GBIF</label>
      <InputText
        id="speciesSearch"
        v-model="query"
        class="w-full"
        placeholder="Введите латинское или русское название..."
        @input="handleSearch"
      />
      <small class="text-color-secondary">Минимум 2 символа</small>
    </div>

    <div v-if="speciesStore.isSearching" class="flex justify-center py-3">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <div v-if="speciesStore.searchResults.length" class="mb-3 flex max-h-56 flex-col gap-1.5 overflow-auto">
      <button
        v-for="result in speciesStore.searchResults"
        :key="result.gbifId"
        class="cursor-pointer rounded-lg border border-gray-200 bg-white p-2 text-left"
        type="button"
        @click="selectedGbif = result"
      >
        <div class="font-semibold">{{ result.scientificName }}</div>
        <div class="text-sm text-gray-500">{{ result.family }}</div>
      </button>
    </div>

    <div v-if="selectedGbif" class="mb-3 flex flex-col gap-1.5">
      <label for="displayNameRu">Русское название *</label>
      <InputText
        id="displayNameRu"
        v-model="displayNameRu"
        class="w-full"
        placeholder="Например: Сосна обыкновенная"
      />
    </div>

    <Message v-if="alreadyExists" class="mb-2" severity="info">
      Этот вид уже есть в справочнике питомника.
    </Message>
    <Message v-if="speciesStore.speciesError" class="mb-2" severity="error">
      {{ speciesStore.speciesError }}
    </Message>

    <template #footer>
      <Button label="Отмена" text @click="close" />
      <Button
        :disabled="!canSubmit"
        :loading="speciesStore.isLoading"
        label="Добавить"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { useSpeciesStore } from '@/stores/species.store'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { computed, ref } from 'vue'

defineOptions({ name: 'SpeciesSearchDialog' })

defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'created'])
const speciesStore = useSpeciesStore()

const query = ref('')
const selectedGbif = ref(null)
const displayNameRu = ref('')
const alreadyExists = ref(false)

const canSubmit = computed(() => Boolean(selectedGbif.value && displayNameRu.value))

function emitVisible(value) {
  emit('update:visible', value)
}

function handleSearch() {
  selectedGbif.value = null
  alreadyExists.value = false
  speciesStore.searchGbif(query.value)
}

async function handleSave() {
  if (!selectedGbif.value) {
    return
  }

  const result = await speciesStore.createSpecies({
    scientific_name: selectedGbif.value.scientificName,
    display_name_ru: displayNameRu.value.trim()
  })

  if (!result?.ok) {
    return
  }

  if (result?.data?.alreadyExists) {
    alreadyExists.value = true
    return
  }

  emit('created')
  close()
}

function close() {
  query.value = ''
  selectedGbif.value = null
  displayNameRu.value = ''
  alreadyExists.value = false
  speciesStore.searchResults = []
  emitVisible(false)
}
</script>
