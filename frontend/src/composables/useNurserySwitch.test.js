import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

import { useNurserySwitch } from '@/composables/useNurserySwitch'
import db from '@/db/indexedDb'
import { addToQueue } from '@/db/syncQueue.service'
import http from '@/services/http'

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('useNurserySwitch — гард переключения питомника', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    await db.table('sync_queue').clear()
  })

  it('офлайн: переключение запрещено', async () => {
    setOnline(false)

    const { ensureCanSwitch } = useNurserySwitch()
    const result = await ensureCanSwitch()

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/офлайн/i)
  })

  it('онлайн с несинхронизированной очередью: переключение запрещено (защита от потери данных)', async () => {
    setOnline(true)
    // Отправка падает → элемент остаётся в очереди → гард не пускает.
    http.post.mockRejectedValue({ response: { status: 500 } })
    await addToQueue('create_operation', {
      plantId: 'p1',
      nurseryId: 'n1',
      localId: 'local_1',
      clientRequestId: 'uuid-1',
      type: 'note'
    })

    const { ensureCanSwitch } = useNurserySwitch()
    const result = await ensureCanSwitch()

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/синхронизирован/i)
  })

  it('онлайн с пустой очередью: переключение разрешено', async () => {
    setOnline(true)

    const { ensureCanSwitch } = useNurserySwitch()
    const result = await ensureCanSwitch()

    expect(result.ok).toBe(true)
  })
})
