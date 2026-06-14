export const SECTION_TITLES = {
  species: 'Виды',
  tags: 'Теги',
  movementTypes: 'Типы движений',
  containerTypes: 'Типы контейнеров',
  productionStages: 'Производственные стадии'
}

export const STATUS_OPTIONS = [
  { value: 'growing', label: 'В росте' },
  { value: 'storage', label: 'Склад' },
  { value: 'sold', label: 'Продано' },
  { value: 'written_off', label: 'Списано' }
]

export const CONTAINER_KIND_OPTIONS = [
  { value: 'pot', label: 'Горшок' },
  { value: 'open_root', label: 'Открытый грунт' },
  { value: 'trench', label: 'Прикоп' },
  { value: 'cold_room', label: 'Холодное хранение' },
  { value: 'greenhouse', label: 'Теплица' }
]

export const SECTION_CARD_META = [
  {
    key: 'species',
    title: 'Виды',
    subtitle: 'Каталог растений',
    description: 'Виды и наименования, с которыми работает питомник.',
    iconClass: 'pi pi-sparkles text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #059669 0%, #0d9488 52%, #0284c7 100%)'
  },
  {
    key: 'tags',
    title: 'Теги',
    subtitle: 'Маркировка',
    description: 'Теги для группировки, поиска и фильтрации растений.',
    iconClass: 'pi pi-tag text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #2563eb 0%, #4f46e5 52%, #7c3aed 100%)'
  },
  {
    key: 'movementTypes',
    title: 'Типы движений',
    subtitle: 'Операции',
    description: 'Типы операций перемещения и изменения статусов.',
    iconClass: 'pi pi-arrow-right-arrow-left text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #f59e0b 0%, #f97316 52%, #ef4444 100%)'
  },
  {
    key: 'containerTypes',
    title: 'Типы контейнеров',
    subtitle: 'Тара и ёмкости',
    description: 'Шаблоны контейнеров и параметры тары для учета.',
    iconClass: 'pi pi-box text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #64748b 0%, #334155 52%, #0f172a 100%)'
  },
  {
    key: 'productionStages',
    title: 'Производственные стадии',
    subtitle: 'Цикл выращивания',
    description: 'Стадии производства растений: размножение, контейнер, поле и кастомные.',
    iconClass: 'pi pi-sitemap text-2xl text-white',
    headerGradient: 'linear-gradient(120deg, #0891b2 0%, #0d9488 52%, #16a34a 100%)'
  }
]

export function defaultTagForm() {
  return {
    name: '',
    color: '#3B82F6',
    is_active: true
  }
}

export function defaultMovementForm() {
  return {
    name: '',
    slug: '',
    sets_status: null,
    is_active: true
  }
}

export function defaultContainerForm() {
  return {
    code: '',
    name: '',
    container_kind: 'pot',
    volume_liters: null,
    side_cm: null,
    is_active: true
  }
}

export function defaultStageForm() {
  return {
    name: '',
    slug: '',
    sort_order: 0,
    is_active: true
  }
}

export function activeLabel(isActive) {
  return isActive ? 'Активен' : 'Неактивен'
}

export function activeSeverity(isActive) {
  return isActive ? 'success' : 'secondary'
}

export function systemLabel(isSystem) {
  return isSystem ? 'Системный' : 'Пользовательский'
}

export function systemSeverity(isSystem) {
  return isSystem ? 'secondary' : 'info'
}

export function statusLabelByValue(status) {
  if (!status) {
    return '—'
  }
  const match = STATUS_OPTIONS.find((item) => item.value === status)
  return match?.label || status
}

export function kindLabelByValue(kind) {
  const match = CONTAINER_KIND_OPTIONS.find((item) => item.value === kind)
  return match?.label || kind
}

export function normalizeHexColor(value) {
  if (!value) {
    return '#3B82F6'
  }
  const raw = value.trim().replace('#', '')
  const candidate = `#${raw}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) {
    return '#3B82F6'
  }
  return candidate.toUpperCase()
}

export function emptyTextBySection(section) {
  if (section === 'species') {
    return 'Виды еще не добавлены.'
  }
  if (section === 'tags') {
    return 'Теги еще не добавлены.'
  }
  if (section === 'movementTypes') {
    return 'Типы движений еще не добавлены.'
  }
  if (section === 'containerTypes') {
    return 'Типы контейнеров еще не добавлены.'
  }
  if (section === 'productionStages') {
    return 'Стадии еще не добавлены.'
  }
  return 'Записи еще не добавлены.'
}
