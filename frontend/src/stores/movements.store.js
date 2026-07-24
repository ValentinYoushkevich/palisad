import { isOnline } from '@/composables/useOnlineStatus'
import db from '@/db/indexedDb'
import { addToQueue } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useMovementTypesStore } from '@/stores/movementTypes.store'
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
      const plantsStore = usePlantsStore()
      const nurseryStore = useNurseryStore()
      this.movementsError = ''
      this.isLoading = true

      // Один идемпотентный ключ на онлайн-POST и на повторную доставку из очереди (F2).
      const clientRequestId = crypto.randomUUID()
      const ctx = { plantId, nurseryId: nurseryStore.nurseryId, formData, clientRequestId }

      try {
        const plant = plantsStore.plants.find((item) => item.id === plantId)

        if (plant && CLOSED_STATUSES.has(plant.status)) {
          this.movementsError = 'Нельзя добавлять движения к проданному или списанному растению.'
          return { ok: false, error: this.movementsError }
        }

        if (isOnline.value) {
          const created = await runOnlineCreateMovement(this, plantsStore, ctx)
          return { ok: true, data: created }
        }

        const localMovement = await enqueueLocalMovement(this, plantsStore, ctx)
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
        if (isOnline.value) {
          await http.delete(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/movements/${id}`)
          removeMovementLocally(this, plantId, id)
          await db.movements.delete(id)
          return { ok: true }
        }

        // F17: офлайн-удаление — убираем локально и ставим delete_movement в очередь
        // (syncManager обрабатывает этот тип; 404 при повторной доставке считается успехом).
        // Если id ещё local_ (движение создано офлайн и не синкнуто), reconcileLocalId
        // перепишет payload.id на серверный после доставки create_movement (F8).
        removeMovementLocally(this, plantId, id)
        await db.movements.delete(id)
        await addToQueue('delete_movement', { id, plantId, nurseryId: nurseryStore.nurseryId })
        return { ok: true }
      } catch (error) {
        this.movementsError = error?.response?.data?.error || 'Не удалось удалить движение.'
        return { ok: false, error: this.movementsError }
      } finally {
        this.isLoading = false
      }
    }
  }
})

async function runOnlineCreateMovement(store, plantsStore, { plantId, nurseryId, formData, clientRequestId }) {
  const response = await http.post(
    `/nurseries/${nurseryId}/plants/${plantId}/movements`,
    { ...formData, clientRequestId }
  )
  const created = response?.data || null

  if (!store.movementsByPlant[plantId]) {
    store.movementsByPlant[plantId] = []
  }

  if (created) {
    store.movementsByPlant[plantId].unshift(created)
    await db.movements.put(created)
    await applyMovementToPlant(plantsStore, plantId, created)
  }

  return created
}

async function enqueueLocalMovement(store, plantsStore, { plantId, nurseryId, formData, clientRequestId }) {
  const localId = `local_${Date.now()}`
  // sets_status тип движения задаёт на сервере; офлайн резолвим его из кэша типов, чтобы
  // оптимистично отразить смену статуса растения в локальной карточке (F17).
  const movementType = useMovementTypesStore().movementTypes.find((item) => item.id === formData.typeId)
  const localMovement = {
    id: localId,
    plant_id: plantId,
    type_id: formData.typeId,
    from_location_id: formData.fromLocationId ?? null,
    to_location_id: formData.toLocationId ?? null,
    sets_status: movementType?.sets_status ?? null,
    quantity: formData.quantity ?? 1,
    notes: formData.notes,
    created_at: new Date().toISOString(),
    _pending: true
  }

  if (!store.movementsByPlant[plantId]) {
    store.movementsByPlant[plantId] = []
  }

  store.movementsByPlant[plantId].unshift(localMovement)
  await db.movements.put(localMovement)

  // F17: как и в онлайне, применяем эффект движения к растению (статус/локация). Офлайн
  // это делается локально (state + Dexie), см. applyMovementToPlant.
  await applyMovementToPlant(plantsStore, plantId, localMovement)

  // nurseryId — фиксация питомника очереди (F7), localId — замена на серверный id (F8),
  // clientRequestId — идемпотентность повторной доставки (F2).
  await addToQueue('create_movement', {
    plantId,
    nurseryId,
    localId,
    clientRequestId,
    ...formData
  })
  return localMovement
}

async function applyMovementToPlant(plantsStore, plantId, movement) {
  const updates = {}

  if (movement?.sets_status) {
    updates.status = movement.sets_status
  }

  if (movement?.to_location_id) {
    updates.locationId = movement.to_location_id
  }

  if (Object.keys(updates).length === 0) {
    return
  }

  if (isOnline.value) {
    await plantsStore.updatePlant(plantId, updates)
    return
  }

  // Офлайн: HTTP-patch недоступен — отражаем статус/локацию в локальной карточке напрямую
  // (state + Dexie). Серверная сторона применит эффект при доставке create_movement.
  const localPatch = {}
  if (updates.status) {
    localPatch.status = updates.status
  }
  if (updates.locationId) {
    localPatch.location_id = updates.locationId
  }

  const localPlant = plantsStore.plants.find((item) => item.id === plantId)
  if (localPlant) {
    Object.assign(localPlant, localPatch)
  }
  await db.plants.update(plantId, localPatch)
}

function removeMovementLocally(store, plantId, id) {
  if (store.movementsByPlant[plantId]) {
    store.movementsByPlant[plantId] = store.movementsByPlant[plantId].filter((item) => item.id !== id)
  }
}
