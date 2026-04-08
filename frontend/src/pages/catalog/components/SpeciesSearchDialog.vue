<template>
  <Dialog
    :visible="visible"
    header="Добавить вид"
    modal
    style="width: 520px"
    @update:visible="emitVisible"
  >
    <div class="field">
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

    <div v-if="speciesStore.isSearching" class="speciesSearch__spinner">
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <div v-if="speciesStore.searchResults.length" class="speciesSearch__results">
      <button
        v-for="result in speciesStore.searchResults"
        :key="result.gbifId"
        class="speciesSearch__result"
        type="button"
        @click="selectedGbif = result"
      >
        <div class="speciesSearch__resultTitle">{{ result.scientificName }}</div>
        <div class="speciesSearch__resultMeta">{{ result.family }}</div>
      </button>
    </div>

    <div v-if="selectedGbif" class="field">
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
  const result = await speciesStore.createSpecies({
    gbifId: selectedGbif.value.gbifId,
    scientificName: selectedGbif.value.scientificName,
    displayNameRu: displayNameRu.value,
    gbifFamily: selectedGbif.value.family,
    gbifGenus: selectedGbif.value.genus
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

<style lang="scss" scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.speciesSearch__spinner {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.speciesSearch__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  max-height: 220px;
  overflow: auto;
}

.speciesSearch__result {
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #ffffff;
  cursor: pointer;
}

.speciesSearch__resultTitle {
  font-weight: 600;
}

.speciesSearch__resultMeta {
  color: #6b7280;
  font-size: 13px;
}
</style>
