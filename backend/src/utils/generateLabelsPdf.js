import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const GRID_COLS = 4;
const GRID_ROWS = 3;
const LABELS_PER_PAGE = GRID_COLS * GRID_ROWS;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 20;

const CELL_W = (PAGE_WIDTH - MARGIN * 2) / GRID_COLS;
const CELL_H = (PAGE_HEIGHT - MARGIN * 2) / GRID_ROWS;
const QR_SIZE = Math.min(CELL_W, CELL_H) * 0.5;

export async function generateLabelsPdf(plants, layout) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });

  if (layout === 'single') {
    await renderSingle(doc, plants);
  } else {
    await renderGrid(doc, plants);
  }

  doc.end();
  return doc;
}

async function renderGrid(doc, plants) {
  for (let i = 0; i < plants.length; i += 1) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS) % GRID_ROWS;

    if (i > 0 && i % LABELS_PER_PAGE === 0) {
      doc.addPage();
    }

    const x = MARGIN + col * CELL_W;
    const y = MARGIN + row * CELL_H;
    await drawLabel(doc, plants[i], { x, y, w: CELL_W, h: CELL_H });
  }
}

async function renderSingle(doc, plants) {
  for (let i = 0; i < plants.length; i += 1) {
    if (i > 0) {
      doc.addPage();
    }
    await drawLabel(doc, plants[i], {
      x: MARGIN,
      y: MARGIN,
      w: PAGE_WIDTH - MARGIN * 2,
      h: PAGE_HEIGHT - MARGIN * 2,
    });
  }
}

async function drawLabel(doc, plant, frame) {
  const { x, y, w, h } = frame;
  const qrBuffer = await QRCode.toBuffer(plant.qr_code, { width: QR_SIZE, margin: 1 });

  doc.image(qrBuffer, x + (w - QR_SIZE) / 2, y + 8, { width: QR_SIZE });

  const textY = y + QR_SIZE + 16;
  doc.fontSize(8).text(plant.qr_code, x, textY, { width: w, align: 'center' });
  doc
    .fontSize(8)
    .text(plant.numeric_code, x, textY + 10, { width: w, align: 'center' });

  const speciesLine = [plant.display_name_ru || plant.scientific_name, plant.variety]
    .filter(Boolean)
    .join(' / ');

  doc
    .fontSize(7)
    .text(speciesLine || 'Без вида', x, textY + 12, { width: w, align: 'center' });

  if (plant.container_code) {
    doc.fontSize(6).text(`Контейнер: ${plant.container_code}`, x, textY + 22, {
      width: w,
      align: 'center',
    });
  }

  if (plant.planted_at) {
    doc.fontSize(6).text(`Посажено: ${plant.planted_at}`, x, textY + 30, {
      width: w,
      align: 'center',
    });
  }

  if (plant.location_name) {
    doc.fontSize(6).text(plant.location_name, x, textY + 38, {
      width: w,
      align: 'center',
    });
  }

  doc.rect(x, y, w, h).stroke('#cccccc');
}
