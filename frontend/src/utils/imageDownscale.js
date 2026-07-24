// Клиентский даунскейл фото перед отправкой/офлайн-сохранением. Фото в питомнике мелкие,
// а на бэке хранятся как bytea, поэтому режем макс. сторону до 1280px и жмём в webp q~0.7
// (fallback jpeg для движков без webp в toBlob). Это резко уменьшает размер и офлайн-трафик
// синка (F13). Возвращаем Blob; при полном отказе canvas — исходный файл.
const MAX_SIDE = 1280
const QUALITY = 0.7

export async function downscaleImage(file, { maxSide = MAX_SIDE, quality = QUALITY } = {}) {
  const source = await loadBitmap(file)
  const { width, height } = fitWithin(source.width, source.height, maxSide)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    releaseBitmap(source)
    return file
  }

  ctx.drawImage(source, 0, 0, width, height)
  releaseBitmap(source)

  const webp = await canvasToBlob(canvas, 'image/webp', quality)
  if (webp && webp.type === 'image/webp') {
    return webp
  }

  // Safari/старые движки игнорируют webp в toBlob (возвращают png/null) — откат на jpeg.
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality)
  return jpeg || webp || file
}

// Имя файла для поля multipart `file` (бэку важен Content-Type, но имя нужно для FormData).
export function photoFileName(mimeType) {
  const ext = extByMime(mimeType)
  return `photo-${Date.now()}.${ext}`
}

function extByMime(mimeType) {
  if (mimeType === 'image/webp') {
    return 'webp'
  }
  if (mimeType === 'image/png') {
    return 'png'
  }
  return 'jpg'
}

function fitWithin(width, height, maxSide) {
  const longest = Math.max(width, height)
  if (!longest || longest <= maxSide) {
    return { width: width || 1, height: height || 1 }
  }

  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  return loadViaImage(file)
}

function loadViaImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.addEventListener('load', () => {
      URL.revokeObjectURL(url)
      resolve(img)
    })
    img.addEventListener('error', (error) => {
      URL.revokeObjectURL(url)
      reject(error)
    })

    img.src = url
  })
}

function releaseBitmap(source) {
  if (source && typeof source.close === 'function') {
    source.close()
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }

    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}
