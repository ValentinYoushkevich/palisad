import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downscaleImage, photoFileName } from '@/utils/imageDownscale'

// Полноценный canvas 2d в jsdom недоступен — мокаем bitmap-загрузку, getContext и toBlob.
describe('imageDownscale (F13)', () => {
  beforeEach(() => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 2000, height: 1000, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, type) => {
      // Небольшой Blob — эмуляция сжатия; тип совпадает с запрошенным (движок умеет формат).
      cb(new Blob([new Uint8Array(64)], { type }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.createImageBitmap
  })

  it('возвращает webp-Blob меньшего размера и вписывает в maxSide 1280', async () => {
    const big = new File([new Uint8Array(50_000)], 'big.jpg', { type: 'image/jpeg' })
    const createElementSpy = vi.spyOn(document, 'createElement')

    const result = await downscaleImage(big)

    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/webp')
    expect(result.size).toBeLessThan(big.size)

    // 2000x1000 → длинная сторона ужата до 1280, высота 640.
    const canvas = createElementSpy.mock.results
      .map((entry) => entry.value)
      .find((element) => element?.tagName === 'CANVAS')
    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(640)
  })

  it('фолбэк на jpeg, если toBlob игнорирует запрос webp', async () => {
    HTMLCanvasElement.prototype.toBlob.mockImplementation((cb, type) => {
      // Движок без webp: на запрос webp отдаёт png, jpeg отдаёт как просили.
      const actual = type === 'image/webp' ? 'image/png' : type
      cb(new Blob([new Uint8Array(32)], { type: actual }))
    })

    const result = await downscaleImage(new File([new Uint8Array(9000)], 'x.png', { type: 'image/png' }))

    expect(result.type).toBe('image/jpeg')
  })

  it('photoFileName подбирает расширение по mime', () => {
    expect(photoFileName('image/webp')).toMatch(/\.webp$/)
    expect(photoFileName('image/jpeg')).toMatch(/\.jpg$/)
  })
})
