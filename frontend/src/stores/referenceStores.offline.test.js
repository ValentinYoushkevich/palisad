import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

import db from '@/db/indexedDb'
import http from '@/services/http'
import { useContainerTypesStore } from '@/stores/containerTypes.store'
import { useLocationsStore } from '@/stores/locations.store'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
import { useNurseryStore } from '@/stores/nursery.store'
import { useProductionStagesStore } from '@/stores/productionStages.store'
import { useSpeciesStore } from '@/stores/species.store'
import { useTagsStore } from '@/stores/tags.store'

// F11: каждый справочный стор при сетевом сбое должен поднимать данные из Dexie
// (раньше loadFromLocal не вызывался нигде → списки офлайн были пустыми).
const CASES = [
  { name: 'species', use: useSpeciesStore, table: 'species', action: 'fetchSpecies', prop: 'species' },
  { name: 'locations', use: useLocationsStore, table: 'locations', action: 'fetchLocations', prop: 'locations' },
  { name: 'tags', use: useTagsStore, table: 'tags', action: 'fetchTags', prop: 'tags' },
  { name: 'containerTypes', use: useContainerTypesStore, table: 'container_types', action: 'fetchContainerTypes', prop: 'containerTypes' },
  { name: 'movementTypes', use: useMovementTypesStore, table: 'movement_types', action: 'fetchMovementTypes', prop: 'movementTypes' },
  { name: 'productionStages', use: useProductionStagesStore, table: 'production_stages', action: 'fetchStages', prop: 'stages' }
]

describe('справочные сторы — офлайн-фолбэк на кэш (F11)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useNurseryStore().nursery = { id: 'n1' }
    await Promise.all(CASES.map((item) => db.table(item.table).clear()))
  })

  for (const item of CASES) {
    it(`${item.name}: при сетевой ошибке поднимает справочник из Dexie`, async () => {
      await db.table(item.table).bulkPut([
        { id: 'ref1', nursery_id: 'n1', name: 'Кэш', is_active: 1 }
      ])
      http.get.mockRejectedValue({ response: { status: 500 } })

      const store = item.use()
      const result = await store[item.action]()

      expect(result.ok).toBe(false)
      expect(store[item.prop]).toHaveLength(1)
      expect(store[item.prop][0].id).toBe('ref1')
    })

    it(`${item.name}: онлайн-загрузка наполняет кэш Dexie`, async () => {
      http.get.mockResolvedValue({ data: [{ id: 'srv1', nursery_id: 'n1', name: 'Сервер', is_active: 1 }] })

      const store = item.use()
      const result = await store[item.action]()

      expect(result.ok).toBe(true)
      expect(await db.table(item.table).count()).toBe(1)
      expect((await db.table(item.table).get('srv1')).name).toBe('Сервер')
    })
  }
})
