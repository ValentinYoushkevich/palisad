import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

// Управляем онлайн/офлайн через hoisted-состояние (безопасно для фабрики vi.mock).
const onlineState = vi.hoisted(() => ({ online: true }))
vi.mock('@/composables/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: { value: onlineState.online } })
}))

// Даунскейл мокаем — canvas в jsdom не рисует; возвращаем предсказуемый webp-Blob.
vi.mock('@/utils/imageDownscale', () => ({
  downscaleImage: vi.fn(async () => new Blob([new Uint8Array(10)], { type: 'image/webp' })),
  photoFileName: (mime) => `photo.${mime === 'image/webp' ? 'webp' : 'jpg'}`
}))

// savePhoto мокаем как spy: в связке fake-indexeddb+jsdom Blob не переживает structuredClone
// (jsdom-Blob → {}), поэтому «Blob кладётся в pending_photos» проверяем на границе вызова,
// а не чтением из БД. В реальном браузере Blob хранится Dexie нормально.
vi.mock('@/db/pendingPhotos.service', () => ({
  savePhoto: vi.fn(async () => 'photo_local_1'),
  getPendingPhotos: vi.fn(async () => []),
  markPhotoDone: vi.fn(),
  markPhotoFailed: vi.fn()
}))

import db from '@/db/indexedDb'
import { savePhoto } from '@/db/pendingPhotos.service'
import { getPending } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { useOperationsStore } from '@/stores/operations.store'
import { downscaleImage } from '@/utils/imageDownscale'
import { createPinia, setActivePinia } from 'pinia'

describe('operations.store attachPhoto (F13)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useNurseryStore().nursery = { id: 'n1' }
    await db.table('sync_queue').clear()
    await db.operations.clear()
  })

  it('офлайн: даунскейл → Blob в pending_photos + attach_photo в очередь', async () => {
    onlineState.online = false
    const store = useOperationsStore()
    const file = new File([new Uint8Array(5000)], 'big.jpg', { type: 'image/jpeg' })

    const result = await store.attachPhoto('op_1', 'p1', file)

    expect(result.ok).toBe(true)
    expect(downscaleImage).toHaveBeenCalledWith(file)
    expect(http.post).not.toHaveBeenCalled()

    // В pending_photos уходит именно Blob (даунскейленный), а не исходный File-объект as-is.
    expect(savePhoto).toHaveBeenCalledWith('op_1', expect.any(Blob))

    const queue = await getPending()
    expect(queue).toHaveLength(1)
    expect(queue[0].type).toBe('attach_photo')
    expect(queue[0].payload).toMatchObject({ operationId: 'op_1', plantId: 'p1', nurseryId: 'n1' })
    // localId в очереди совпадает с ключом pending_photo — по нему синк достанет Blob.
    expect(queue[0].payload.localId).toBe('photo_local_1')
  })

  it('онлайн: FormData (поле file) на upload-эндпоинт + обновление операций', async () => {
    onlineState.online = true
    http.post.mockResolvedValue({ data: { id: 'ph_1' } })
    http.get.mockResolvedValue({ data: [] })
    const store = useOperationsStore()
    const file = new File([new Uint8Array(5000)], 'big.jpg', { type: 'image/jpeg' })

    const result = await store.attachPhoto('op_1', 'p1', file)

    expect(result.ok).toBe(true)
    const [url, body] = http.post.mock.calls[0]
    expect(url).toBe('/nurseries/n1/plants/p1/operations/op_1/photos')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBeInstanceOf(Blob)
    // Офлайн-хранилища не тронуты, метаданные подтянуты заново.
    expect(savePhoto).not.toHaveBeenCalled()
    expect(await getPending()).toHaveLength(0)
    expect(http.get).toHaveBeenCalledWith('/nurseries/n1/plants/p1/operations')
  })
})
