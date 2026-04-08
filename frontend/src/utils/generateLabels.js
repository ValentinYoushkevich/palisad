import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

const A4_W = 595
const A4_H = 842
const MARGIN = 20
const COLS = 4
const ROWS = 3
const CELL_W = (A4_W - MARGIN * 2) / COLS
const CELL_H = (A4_H - MARGIN * 2) / ROWS
const QR_SIZE = Math.min(CELL_W, CELL_H) * 0.55

export async function generateLabelsPdf(plants, layout = 'grid') {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  if (layout === 'single') {
    for (const plant of plants) {
      const page = doc.addPage([A4_W, A4_H])
      await drawLabel(doc, page, font, plant, MARGIN, MARGIN, A4_W - MARGIN * 2, A4_H - MARGIN * 2)
    }
  } else {
    const labelsPerPage = COLS * ROWS

    for (let index = 0; index < plants.length; index += 1) {
      const pageIndex = Math.floor(index / labelsPerPage)
      const posOnPage = index % labelsPerPage

      if (posOnPage === 0) {
        doc.addPage([A4_W, A4_H])
      }

      const page = doc.getPages()[pageIndex]
      const col = posOnPage % COLS
      const row = Math.floor(posOnPage / COLS)
      const x = MARGIN + col * CELL_W
      const y = A4_H - MARGIN - (row + 1) * CELL_H

      await drawLabel(doc, page, font, plants[index], x, y, CELL_W, CELL_H)
    }
  }

  return doc.save()
}

async function drawLabel(doc, page, font, plant, x, y, width, height) {
  const qrDataUrl = await QRCode.toDataURL(plant.qr_code, { width: QR_SIZE, margin: 1 })
  const qrBytes = await fetch(qrDataUrl).then((response) => response.arrayBuffer())
  const qrImage = await doc.embedPng(qrBytes)

  const qrX = x + (width - QR_SIZE) / 2
  const qrY = y + height - QR_SIZE - 8

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: QR_SIZE,
    height: QR_SIZE
  })

  const numericCode = plant.numeric_code || '—'
  page.drawText(numericCode, {
    x: x + width / 2 - font.widthOfTextAtSize(numericCode, 9) / 2,
    y: qrY - 14,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3)
  })

  const speciesText = plant.display_name_ru || plant.scientific_name || '—'
  const truncated = speciesText.length > 22 ? `${speciesText.slice(0, 20)}…` : speciesText
  page.drawText(truncated, {
    x: x + width / 2 - font.widthOfTextAtSize(truncated, 8) / 2,
    y: qrY - 26,
    size: 8,
    font,
    color: rgb(0, 0, 0)
  })

  if (plant.variety) {
    page.drawText(plant.variety, {
      x: x + width / 2 - font.widthOfTextAtSize(plant.variety, 7) / 2,
      y: qrY - 38,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4)
    })
  }

  if (plant.container_code) {
    page.drawText(plant.container_code, {
      x: x + width / 2 - font.widthOfTextAtSize(plant.container_code, 7) / 2,
      y: qrY - 50,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4)
    })
  }

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5
  })
}
