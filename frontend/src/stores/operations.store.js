import { useOnlineStatus } from '@/composables/useOnlineStatus'
import db from '@/db/indexedDb'
import { getPendingPhotos, markPhotoDone, markPhotoFailed, savePhoto } from '@/db/pendingPhotos.service'
import { addToQueue } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { usePlantsStore } from '@/stores/plants.store'
import { defineStore } from 'pinia'

const CLOSED_STATUSES = new Set(['sold', 'written_off'])

export const useOperationsStore = defineStore('operations', {
  state: () => ({
    operationsByPlant: {},
    operationsError: '',
    isLoading: false
  }),

  getters: {
    forPlant: (state) => (plantId) => state.operationsByPlant[plantId] ?? []
  },

  actions: {
    async fetchOperations(plantId) {
      const nurseryStore = useNurseryStore()
      this.operationsError = ''
      this.isLoading = true

      try {
        const response = await http.get(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/operations`)
        const data = response?.data || []
        this.operationsByPlant[plantId] = data
        await db.operations.bulkPut(data)
        return { ok: true }
      } catch (error) {
        this.operationsError = error?.response?.data?.error || 'Не удалось загрузить операции.'
        return { ok: false, error: this.operationsError }
      } finally {
        this.isLoading = false
      }
    },

    async loadFromLocal(plantId) {
      const local = await db.operations
        .filter((item) => item.plant_id === plantId && !item.deleted_at)
        .toArray()
      this.operationsByPlant[plantId] = local
    },

    async createOperation(plantId, formData) {
      const { isOnline } = useOnlineStatus()
      const plantsStore = usePlantsStore()
      const nurseryStore = useNurseryStore()
      this.operationsError = ''
      this.isLoading = true

      // Идемпотентный ключ фиксируется на всё время жизни этой записи: и онлайн-POST, и
      // повторная доставка из офлайн-очереди уходят с одним clientRequestId, поэтому
      // потерянный ответ при живом сервере не создаёт дубль (F2, дедуп на бэкенде).
      const clientRequestId = crypto.randomUUID()
      const ctx = { plantId, nurseryId: nurseryStore.nurseryId, formData, clientRequestId }

      try {
        const plant = plantsStore.plants.find((item) => item.id === plantId)

        if (plant && CLOSED_STATUSES.has(plant.status)) {
          this.operationsError = 'Нельзя добавлять операции к проданному или списанному растению.'
          return { ok: false, error: this.operationsError }
        }

        if (isOnline.value) {
          const created = await runOnlineCreateOperation(this, plantsStore, ctx)
          return { ok: true, data: created }
        }

        const localOperation = await enqueueLocalOperation(this, plantsStore, ctx)
        return { ok: true, data: localOperation }
      } catch (error) {
        this.operationsError = error?.response?.data?.error || 'Не удалось создать операцию.'
        return { ok: false, error: this.operationsError }
      } finally {
        this.isLoading = false
      }
    },

    async updateOperation(id, plantId, formData) {
      const { isOnline } = useOnlineStatus()
      this.operationsError = ''
      this.isLoading = true

      try {
        if (isOnline.value) {
          const nurseryStore = useNurseryStore()
          const response = await http.patch(
            `/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/operations/${id}`,
            formData
          )
          updateInMap(this.operationsByPlant, plantId, response?.data)
          await db.operations.put(response?.data)
          return { ok: true }
        }

        const nurseryStore = useNurseryStore()
        const local = this.operationsByPlant[plantId]?.find((item) => item.id === id)
        if (local) {
          Object.assign(local, formData, { _pending: true })
          await db.operations.put(local)
        }
        await addToQueue('update_operation', { id, plantId, nurseryId: nurseryStore.nurseryId, ...formData })
        return { ok: true }
      } catch (error) {
        this.operationsError = error?.response?.data?.error || 'Не удалось обновить операцию.'
        return { ok: false, error: this.operationsError }
      } finally {
        this.isLoading = false
      }
    },

    async softDelete(id, plantId) {
      const { isOnline } = useOnlineStatus()
      this.operationsError = ''
      this.isLoading = true

      try {
        if (isOnline.value) {
          const nurseryStore = useNurseryStore()
          await http.delete(`/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/operations/${id}`)
          removeFromMap(this.operationsByPlant, plantId, id)
          await db.operations.update(id, { deleted_at: new Date().toISOString() })
          return { ok: true }
        }

        const nurseryStore = useNurseryStore()
        removeFromMap(this.operationsByPlant, plantId, id)
        await db.operations.update(id, { deleted_at: new Date().toISOString() })
        await addToQueue('delete_operation', { id, plantId, nurseryId: nurseryStore.nurseryId })
        return { ok: true }
      } catch (error) {
        this.operationsError = error?.response?.data?.error || 'Не удалось удалить операцию.'
        return { ok: false, error: this.operationsError }
      } finally {
        this.isLoading = false
      }
    },

    async attachPhoto(operationId, plantId, file) {
      const { isOnline } = useOnlineStatus()
      this.operationsError = ''

      try {
        if (isOnline.value) {
          const nurseryStore = useNurseryStore()
          const response = await http.post(
            `/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/operations/${operationId}/photos`,
            { url: file }
          )
          return { ok: true, data: response?.data || null }
        }

        const nurseryStore = useNurseryStore()
        const localId = await savePhoto(operationId, file)
        await addToQueue('attach_photo', { operationId, plantId, nurseryId: nurseryStore.nurseryId, localId })
        return { ok: true }
      } catch (error) {
        this.operationsError = error?.response?.data?.error || 'Не удалось прикрепить фото.'
        return { ok: false, error: this.operationsError }
      }
    },

    async deletePhoto(photoId, operationId, plantId) {
      const nurseryStore = useNurseryStore()
      this.operationsError = ''

      try {
        await http.delete(
          `/nurseries/${nurseryStore.nurseryId}/plants/${plantId}/operations/${operationId}/photos/${photoId}`
        )
        await this.fetchOperations(plantId)
        return { ok: true }
      } catch (error) {
        this.operationsError = error?.response?.data?.error || 'Не удалось удалить фото.'
        return { ok: false, error: this.operationsError }
      }
    },

    async syncPending() {
      const pendingPhotos = await getPendingPhotos()

      for (const photo of pendingPhotos) {
        if (!photo?.localId) {
          continue
        }

        try {
          await markPhotoDone(photo.localId)
        } catch {
          await markPhotoFailed(photo.localId)
        }
      }
    }
  }
})

async function runOnlineCreateOperation(store, plantsStore, { plantId, nurseryId, formData, clientRequestId }) {
  const response = await http.post(
    `/nurseries/${nurseryId}/plants/${plantId}/operations`,
    { ...formData, clientRequestId }
  )
  const created = response?.data || null

  if (!store.operationsByPlant[plantId]) {
    store.operationsByPlant[plantId] = []
  }

  if (created) {
    store.operationsByPlant[plantId].unshift(created)
    await db.operations.put(created)
  }

  if (formData.type === 'transplant' && formData.newContainerId) {
    await plantsStore.updatePlant(plantId, { containerId: formData.newContainerId })
  }

  // Стадию меняет бэкенд (plants.stage_id + история) — подтягиваем актуальную карточку.
  if (formData.type === 'change_stage' && formData.newStageId) {
    await plantsStore.refreshPlant(plantId)
  }

  return created
}

async function enqueueLocalOperation(store, plantsStore, { plantId, nurseryId, formData, clientRequestId }) {
  const localId = `local_${Date.now()}`
  const localOperation = {
    id: localId,
    plant_id: plantId,
    type: formData.type,
    notes: formData.notes,
    created_at: new Date().toISOString(),
    _pending: true
  }

  if (!store.operationsByPlant[plantId]) {
    store.operationsByPlant[plantId] = []
  }

  store.operationsByPlant[plantId].unshift(localOperation)
  await db.operations.put(localOperation)

  // Офлайн: оптимистично отражаем смену стадии в локальной карточке растения.
  if (formData.type === 'change_stage' && formData.newStageId) {
    const localPlant = plantsStore.plants.find((item) => item.id === plantId)
    if (localPlant) {
      localPlant.stage_id = formData.newStageId
      await db.plants.update(plantId, { stage_id: formData.newStageId })
    }
  }

  // nurseryId фиксируется при постановке в очередь (F7), localId — для замены на серверный
  // id после синка (F8), clientRequestId — для идемпотентности повторной доставки (F2).
  await addToQueue('create_operation', {
    plantId,
    nurseryId,
    localId,
    clientRequestId,
    ...formData
  })
  return localOperation
}

function updateInMap(map, plantId, updated) {
  const list = map[plantId]
  if (!list || !updated) {
    return
  }

  const index = list.findIndex((item) => item.id === updated.id)
  if (index !== -1) {
    list.splice(index, 1, updated)
  }
}

function removeFromMap(map, plantId, id) {
  if (!map[plantId]) {
    return
  }

  map[plantId] = map[plantId].filter((item) => item.id !== id)
}
