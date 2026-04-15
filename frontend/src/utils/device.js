export function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent || ''
  const mobilePattern = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS/i
  const hasMobileUa = mobilePattern.test(userAgent)
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const isNarrowViewport = window.matchMedia?.('(max-width: 900px)').matches ?? false

  return hasMobileUa || (hasCoarsePointer && isNarrowViewport)
}
