# MODULE_12 — Backend: QR-коды и этикетки

**Зависит от:** MODULE_9, MODULE_6

---

## Шаг 1. Зависимость

```bash
npm install pdfkit
```

`pdfkit` — Node.js библиотека для генерации PDF без внешних процессов. Поддерживает растровое рисование QR-кодов через буфер.

Для генерации QR-изображения:

```bash
npm install qrcode
```

---

## Шаг 2. Validators

`src/utils/validators/labels.validators.js`:

```js
import { z } from 'zod';

export const labelsSchema = z.object({
  plantIds: z.array(z.string().uuid()).min(1).max(100),
  layout: z.enum(['single', 'grid']).default('grid'),
});
```

---

## Шаг 3. Утилита генерации PDF

`src/utils/generateLabelsPdf.js`:

```js
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
  for (let i = 0; i < plants.length; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS) % GRID_ROWS;

    if (i > 0 && i % LABELS_PER_PAGE === 0) doc.addPage();

    const x = MARGIN + col * CELL_W;
    const y = MARGIN + row * CELL_H;

    await drawLabel(doc, plants[i], x, y, CELL_W, CELL_H);
  }
}

async function renderSingle(doc, plants) {
  for (let i = 0; i < plants.length; i++) {
    if (i > 0) doc.addPage();
    await drawLabel(doc, plants[i], MARGIN, MARGIN, PAGE_WIDTH - MARGIN * 2, PAGE_HEIGHT - MARGIN * 2);
  }
}

async function drawLabel(doc, plant, x, y, w, h) {
  const qrBuffer = await QRCode.toBuffer(plant.qr_code, { width: QR_SIZE, margin: 1 });

  doc.image(qrBuffer, x + (w - QR_SIZE) / 2, y + 8, { width: QR_SIZE });

  const textY = y + QR_SIZE + 16;
  doc.fontSize(8).text(plant.qr_code, x, textY, { width: w, align: 'center' });
  doc.fontSize(8).text(plant.numeric_code, x, textY + 10, { width: w, align: 'center' });

  const speciesLine = [plant.display_name_ru || plant.scientific_name, plant.variety]
    .filter(Boolean)
    .join(' / ');

  doc.fontSize(7).text(speciesLine || 'Без вида', x, textY + 12, { width: w, align: 'center' });

  if (plant.container_code) {
    doc.fontSize(6).text(`Контейнер: ${plant.container_code}`, x, textY + 22, { width: w, align: 'center' });
  }

  if (plant.planted_at) {
    doc.fontSize(6).text(`Посажено: ${plant.planted_at}`, x, textY + 30, { width: w, align: 'center' });
  }

  if (plant.location_name) {
    doc.fontSize(6).text(plant.location_name, x, textY + 38, { width: w, align: 'center' });
  }

  doc.rect(x, y, w, h).stroke('#cccccc');
}
```

---

## Шаг 4. Service

`src/services/labels.service.js`:

```js
import * as plantRepo from '@/repositories/plant.repository.js';
import { checkFeature } from '@/utils/planGuards.js';
import { generateLabelsPdf } from '@/utils/generateLabelsPdf.js';
import { AppError } from '@/utils/AppError.js';

export async function generateLabels(nurseryId, accountId, plantIds, layout) {
  await checkFeature(accountId, 'feature_qr');

  const plants = await Promise.all(
    plantIds.map(id => plantRepo.findByNurseryAndId(nurseryId, id))
  );

  const missing = plants.some(p => !p);
  if (missing) throw new AppError('Одно или несколько растений не найдены', 404);

  return generateLabelsPdf(plants, layout);
}
```

---

## Шаг 5. Controller

`src/controllers/labels.controller.js`:

```js
import * as labelsService from '@/services/labels.service.js';

export async function generateLabels(req, res, next) {
  try {
    const { plantIds, layout } = req.body;

    const pdfStream = await labelsService.generateLabels(
      req.params.nurseryId,
      req.user.accountId,
      plantIds,
      layout
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="labels.pdf"');
    pdfStream.pipe(res);
  } catch (err) {
    next(err);
  }
}
```

---

## Шаг 6. Router

`src/routes/labels.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { validate } from '@/middlewares/validate.js';
import * as labelsController from '@/controllers/labels.controller.js';
import { labelsSchema } from '@/utils/validators/labels.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.post('/labels', validate(labelsSchema), labelsController.generateLabels);

export default router;
```

Подключить в `app.js`:

```js
import labelsRouter from '@/routes/labels.router.js';
app.use('/api/nurseries/:nurseryId/plants', labelsRouter);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | `feature_qr` обязательна | `POST .../plants/labels` при плане `free` → 403 |
| 2 | PDF генерируется | `POST .../plants/labels` с валидным plantIds → бинарный PDF в ответе |
| 3 | Несуществующий plantId → 404 | Передать id несуществующего растения |
| 4 | Лayout `grid` создаёт сетку | Запросить 12 растений, проверить что на одной странице A4 |
| 5 | Layout `single` — страница на растение | Запросить 3 растения с `layout: 'single'` → PDF из 3 страниц |
| 6 | Этикетка содержит QR и numeric code | Проверка визуально в PDF |
| 7 | Этикетка содержит вид, сорт и контейнер | Проверка строк `display_name_ru/scientific_name`, `variety`, `container_code` |

Реализовано — критерии 1–5 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12; число страниц PDF проверено по объектам `/Type /Page`).
Критерии 6–7 сверены по коду `src/utils/generateLabelsPdf.js` (рисует QR, qr_code, numeric_code, вид/сорт, контейнер, дату посадки, локацию); финальная визуальная проверка печати — за пользователем.
