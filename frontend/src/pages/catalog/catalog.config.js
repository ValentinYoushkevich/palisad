export const SECTION_TITLES = {
  species: 'Виды',
  tags: 'Теги',
  movementTypes: 'Типы движений',
  containerTypes: 'Типы контейнеров'
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
