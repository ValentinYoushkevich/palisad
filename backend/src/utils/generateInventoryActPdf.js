import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PDFDocument from 'pdfkit';

// PDF-акт инвентаризации (§ «Инвентаризация», Э4). Зеркалит generateLabelsPdf: строит
// документ и возвращает поток (doc.end(); return doc). Отличие — ВЕСЬ текст кириллический
// (заголовки, виды, локации), поэтому встроенные шрифты pdfkit (Helvetica) не годятся:
// они не несут кириллических глифов и превращают русский в «тофу». Регистрируем
// Unicode-TTF DejaVuSans (лежит в assets/fonts) и рисуем всё им; акцент — размером, не
// начертанием (одного regular-начертания достаточно). Рисование потоковое (doc.text без
// явного y), поэтому длинные списки pdfkit разбивает на страницы автоматически.

// Путь к шрифту резолвим относительно модуля (import.meta.url), а не от CWD, чтобы акт
// генерировался одинаково из любого рабочего каталога (сервер, тесты, скрипты).
const FONT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/fonts/DejaVuSans.ttf'
);

const DASH = '—';

// Пустое/пробельное значение → длинное тире (единый placeholder по всему акту).
function orDash(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text.length > 0 ? text : DASH;
}

// ISO-дата (строка или Date из knex) → «YYYY-MM-DD HH:mm» в UTC, чтобы вывод не зависел
// от таймзоны машины и совпадал с Z-метками сессии. Некорректная дата → тире.
function formatDateTime(value) {
  if (value === null || value === undefined) {
    return DASH;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return DASH;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return `${ymd} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

// Подпись растения: локальное имя, иначе научное, иначе тире (null-safe на оба поля).
function speciesLabel(item) {
  return orDash(item.speciesName || item.scientificName);
}

// Код строки: QR, иначе числовой, иначе тире.
function codeLabel(item) {
  return orDash(item.qrCode || item.numericCode);
}

// Секция акта: заголовок + строки. Пустой список → «—» под заголовком (секцию не прячем,
// чтобы в акте было видно «расхождений этой категории нет»). Печать потоковая → pdfkit
// сам добавит страницу, если строки не помещаются.
function drawSection(doc, title, header, rows) {
  doc.moveDown(0.8);
  doc.fontSize(13).text(title);
  doc.moveDown(0.2);
  if (rows.length === 0) {
    doc.fontSize(10).text(DASH);
    return;
  }
  doc.fontSize(9).text(header);
  for (const row of rows) {
    doc.fontSize(9).text(row);
  }
}

// Шапка: питомник + заголовок акта.
function drawHeader(doc, nurseryName) {
  doc.fontSize(16).text(orDash(nurseryName || 'Питомник'));
  doc.fontSize(18).text('Акт инвентаризации');
}

// Метаблок: зона, исполнитель (строку пропускаем, если имени нет) и период сессии.
function drawMeta(doc, detail, scannedByName) {
  doc.moveDown(0.6);
  doc.fontSize(11).text(`Зона: ${orDash(detail.locationName)}`);
  if (scannedByName) {
    doc.fontSize(11).text(`Исполнитель: ${scannedByName}`);
  }
  const period = `${formatDateTime(detail.startedAt)} … ${formatDateTime(detail.completedAt)}`;
  doc.fontSize(11).text(`Период: ${period}`);
}

// Итоги-счётчики сессии и, если что-то применяли, строка «Применено: N списано,
// M перемещено» (N/M считаем по appliedMovementId — маркеру применённого расхождения).
function drawSummary(doc, detail) {
  const counts = detail.counts ?? {};
  doc.moveDown(0.6);
  doc
    .fontSize(11)
    .text(
      `Совпало: ${counts.matched ?? 0}   Не найдено: ${counts.missing ?? 0}   ` +
        `Чужие: ${counts.foreign ?? 0}   Неизвестные: ${counts.unknown ?? 0}`
    );
  const writtenOff = detail.items.missing.filter((item) => item.appliedMovementId).length;
  const transferred = detail.items.foreign.filter((item) => item.appliedMovementId).length;
  if (writtenOff + transferred > 0) {
    doc.fontSize(11).text(`Применено: ${writtenOff} списано, ${transferred} перемещено`);
  }
}

// Строки таблиц: код | вид | стадия | локация (+пометка применения). null-safe на все поля.
function missingRow(item) {
  const base = `${codeLabel(item)} | ${speciesLabel(item)} | ${orDash(item.stageName)} | ${orDash(item.currentLocationName)}`;
  return item.appliedMovementId ? `${base} (списано)` : base;
}

function foreignRow(item) {
  const base = `${codeLabel(item)} | ${speciesLabel(item)} | ${orDash(item.currentLocationName)}`;
  return item.appliedMovementId ? `${base} (перемещено)` : base;
}

// Собирает PDF-акт по DETAIL сессии и подписям (питомник/исполнитель). Синхронно (без
// QR/await): строит документ, закрывает поток и возвращает его — контроллер стримит.
export function generateInventoryActPdf({ detail, nurseryName, scannedByName }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  // Регистрируем кириллический шрифт и ставим его ДО первого text() — иначе pdfkit
  // возьмёт Helvetica и русский отрисуется мусором.
  doc.registerFont('regular', FONT_PATH);
  doc.font('regular');

  const items = detail.items ?? { missing: [], foreign: [], unknown: [] };
  drawHeader(doc, nurseryName);
  drawMeta(doc, detail, scannedByName);
  drawSummary(doc, detail);

  drawSection(doc, 'Не найдено (missing)', 'Код | Вид | Стадия | Локация', items.missing.map(missingRow));
  drawSection(doc, 'Чужие (foreign)', 'Код | Вид | Где числится', items.foreign.map(foreignRow));
  drawSection(doc, 'Неизвестные (unknown)', 'Сырой код', items.unknown.map((item) => orDash(item.rawCode)));

  doc.end();
  return doc;
}
