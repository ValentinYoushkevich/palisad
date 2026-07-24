import { describe, expect, it } from 'vitest'

import { shouldReloadAfterControllerChange } from '@/registerServiceWorker'

describe('shouldReloadAfterControllerChange (F14)', () => {
  it('первая установка SW (контроллера не было) — не перезагружаем', () => {
    expect(shouldReloadAfterControllerChange({ hadController: false, alreadyReloading: false })).toBe(false)
  })

  it('обновление активного SW — перезагружаем один раз', () => {
    expect(shouldReloadAfterControllerChange({ hadController: true, alreadyReloading: false })).toBe(true)
  })

  it('guard от петли: повторно не перезагружаем', () => {
    expect(shouldReloadAfterControllerChange({ hadController: true, alreadyReloading: true })).toBe(false)
  })
})
