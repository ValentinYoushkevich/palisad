import { useOnlineStatus } from '@/composables/useOnlineStatus'
import db from '@/db/indexedDb'
import { addToQueue } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { usePlantsStore } from '@/stores/plants.store'
import { defineStore } from 'pinia'

const CLOSED_STATUSES = new Set(['sold', 'written_off'])

export const useMovementsStore = defineStore('movements', {
  state: () => ({
    movementsByPlant: {},
    movementsError: '',
    isLoading: false
  }),

  getters: {
    forPlant: (state) => (plantId) => state.movementsByPlant[plantId] ?? []
  },

  actions: {
    async fetchMovements(plantId) {
      const nurseryStore = useNurseryStore()
      this.movementsError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/movements`)
        const data = response?.data || []
        this.movementsByPlant[plantId] = data
        await db.movements.bulkPut(data)
        return { ok: true }
      } catch (error) {
        this.movementsError = error?.response?.data?.error || 'Не удалось загрузить движения.'
        return { ok: false, error: this.movementsError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal(plantId) {
      const local = await db.movements
        .filter((item) => item.plant_id === plantId)
        .toArray()
      this.movementsByPlant[plantId] = local
    },

    async createMovement(plantId, formData) {
      const { isOnline } = useOnlineStatus()
      const plantsStore = usePlantsStore()
      this.movementsError = ''
      this.isLoading = true

      try {
        const plant = plantsStore.plants.find((item) => item.id === plantId)

        if (plant && CLOSED_STATUSES.has(plant.status)) {
          this.movementsError = 'Нельзя добавлять движения к проданному или списанному растению.'
          return { ok: false, error: this.movementsError }
        }

        if (isOnline.value) {
          const nurseryStore = useNurseryStore()
          const response = await http.post(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/movements`, formData)
          const created = response?.data || null

          if (!this.movementsByPlant[plantId]) {
            this.movementsByPlant[plantId] = []
          }

          if (created) {
            this.movementsByPlant[plantId].unshift(created)
            await db.movements.put(created)
            await applyMovementToPlant(plantsStore, plantId, created)
          }

          return { ok: true, data: created }
        }

        const localMovement = {
          id: `local_${Date.now()}`,
          plant_id: plantId,
          type_id: formData.typeId,
          from_location_id: formData.fromLocationId ?? null,
          to_location_id: formData.toLocationId ?? null,
          quantity: formData.quantity ?? 1,
          notes: formData.notes,
          created_at: new Date().toISOString(),
          _pending: true
        }

        if (!this.movementsByPlant[plantId]) {
          this.movementsByPlant[plantId] = []
        }

        this.movementsByPlant[plantId].unshift(localMovement)
        await db.movements.put(localMovement)
        await addToQueue('create_movement', { plantId, ...formData })
        return { ok: true, data: localMovement }
      } catch (error) {
        this.movementsError = error?.response?.data?.error || 'Не удалось создать движение.'
        return { ok: false, error: this.movementsError }
      } finally {
        this.isLoading = false
      }
    },

    async deleteMovement(id, plantId) {
      const nurseryStore = useNurseryStore()
      this.movementsError = ''
      this.isLoading = true

      try {
        await http.delete(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/movements/${id}`)

        if (this.movementsByPlant[plantId]) {
          this.movementsByPlant[plantId] = this.movementsByPlant[plantId].filter((item) => item.id !== id)
        }

        await db.movements.delete(id)
        return { ok: true }
      } catch (error) {
        this.movementsError = error?.response?.data?.error || 'Не удалось удалить движение.'
        return { ok: false, error: this.movementsError }
      } finally {
        this.isLoading = false
      }
    },

    async syncPending() {
      return null
    }
  }
})

async function applyMovementToPlant(plantsStore, plantId, movement) {
  const updates = {}

  if (movement?.sets_status) {
    updates.status = movement.sets_status
  }

  if (movement?.to_location_id) {
    updates.locationId = movement.to_location_id
  }

  if (Object.keys(updates).length > 0) {
    await plantsStore.updatePlant(plantId, updates)
  }
}
