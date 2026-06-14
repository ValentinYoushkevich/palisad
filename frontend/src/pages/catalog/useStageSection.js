import { defaultStageForm } from '@/pages/catalog/catalog.config'
import { useProductionStagesStore } from '@/stores/productionStages.store'
import { computed, ref } from 'vue'

// Состояние и обработчики секции «Производственные стадии» в CatalogPage —
// вынесено в композабл, чтобы не раздувать страницу справочников.
export function useStageSection() {
  const store = useProductionStagesStore()
  const visible = ref(false)
  const editingId = ref(null)
  const initialForm = ref(defaultStageForm())

  const title = computed(() => (editingId.value ? 'Редактировать стадию' : 'Добавить стадию'))
  const saveLabel = computed(() => (editingId.value ? 'Сохранить' : 'Добавить'))

  function openCreate() {
    editingId.value = null
    initialForm.value = defaultStageForm()
    store.stagesError = ''
    visible.value = true
  }

  function openEdit(item) {
    if (item.is_system) {
      store.stagesError = 'Системную стадию нельзя изменять.'
      return
    }
    editingId.value = item.id
    initialForm.value = {
      name: item.name || '',
      slug: item.slug || '',
      sort_order: item.sort_order ?? 0,
      is_active: Boolean(item.is_active)
    }
    store.stagesError = ''
    visible.value = true
  }

  async function handleSave(formData) {
    if (!formData?.name?.trim() || !formData?.slug?.trim()) {
      return
    }
    const payload = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      sort_order: Number(formData.sort_order) || 0,
      is_active: Boolean(formData.is_active)
    }
    const result = editingId.value
      ? await store.updateStage(editingId.value, payload)
      : await store.createStage(payload)
    if (!result?.ok) {
      return
    }
    visible.value = false
  }

  return { store, visible, initialForm, title, saveLabel, openCreate, openEdit, handleSave }
}
