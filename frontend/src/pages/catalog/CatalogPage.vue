<template>
  <section class="catalogPage">
    <div class="catalogPage__header">
      <h2>Справочники</h2>
      <Button v-if="authStore.canManageStructure" label="Добавить вид (GBIF)" @click="speciesDialogVisible = true" />
    </div>

    <Message v-if="errorText" severity="error">{{ errorText }}</Message>

    <div class="catalogPage__grid">
      <article class="catalogPage__card">
        <h3>Виды</h3>
        <ul>
          <li v-for="item in speciesStore.species" :key="item.id">{{ item.display_name_ru || item.scientific_name }}</li>
        </ul>
      </article>

      <article class="catalogPage__card">
        <h3>Теги</h3>
        <ul>
          <li v-for="item in tagsStore.tags" :key="item.id">{{ item.name }}</li>
        </ul>
      </article>

      <article class="catalogPage__card">
        <h3>Типы движений</h3>
        <ul>
          <li v-for="item in movementTypesStore.movementTypes" :key="item.id">
            {{ item.name }}
            <Tag v-if="item.is_system" severity="secondary" value="Системный" />
          </li>
        </ul>
      </article>

      <article class="catalogPage__card">
        <h3>Типы контейнеров</h3>
        <ul>
          <li v-for="item in containerTypesStore.containerTypes" :key="item.id">
            {{ item.name }}
            <Tag v-if="item.is_system" severity="secondary" value="Системный" />
          </li>
        </ul>
      </article>
    </div>

    <SpeciesSearchDialog v-model:visible="speciesDialogVisible" @created="handleSpeciesCreated" />
  </section>
</template>

<script setup>
import SpeciesSearchDialog from '@/pages/catalog/components/SpeciesSearchDialog.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useSpeciesStore } from '@/stores/species.store'
import { useTagsStore } from '@/stores/tags.store'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'CatalogPage' })

const authStore = useAuthStore()
const speciesStore = useSpeciesStore()
const tagsStore = useTagsStore()
const movementTypesStore = useMovementTypesStore()
const containerTypesStore = useContainerTypesStore()
const speciesDialogVisible = ref(false)

const errorText = computed(() => (
  speciesStore.speciesError ||
  tagsStore.tagsError ||
  movementTypesStore.movementTypesError ||
  containerTypesStore.containerTypesError
))

onMounted(async () => {
  await Promise.all([
    speciesStore.fetchSpecies(),
    tagsStore.fetchTags(),
    movementTypesStore.fetchMovementTypes(),
    containerTypesStore.fetchContainerTypes()
  ])
})

async function handleSpeciesCreated() {
  await speciesStore.fetchSpecies()
}
</script>

<style lang="scss" scoped>
.catalogPage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.catalogPage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.catalogPage__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.catalogPage__card {
  background: #ffffff;
  border-radius: 10px;
  padding: 12px;
}

.catalogPage__card ul {
  margin: 0;
  padding-left: 18px;
}
</style>
