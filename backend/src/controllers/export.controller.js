import * as exportService from '@/services/export.service.js';
import { AppError } from '@/utils/AppError.js';
import { escapeCell, toCsv } from '@/utils/csv.js';
import {
  priceListExportQuerySchema,
  stockExportQuerySchema,
} from '@/utils/validators/export.validators.js';

// Колонки CSV сводки наличия по виду (Э2). Порядок = порядок колонок в файле.
const STOCK_SPECIES_CSV_COLUMNS = [
  { key: 'speciesName', header: 'Вид' },
  { key: 'variety', header: 'Сорт' },
  { key: 'stageName', header: 'Стадия' },
  { key: 'containerName', header: 'Контейнер' },
  { key: 'count', header: 'Количество' },
];

// Колонки CSV сводки наличия по локации (Э2): «Локация» первой, далее — как у species.
const STOCK_LOCATION_CSV_COLUMNS = [
  { key: 'locationPath', header: 'Локация' },
  ...STOCK_SPECIES_CSV_COLUMNS,
];

// Колонки CSV прайс-листа (Э3), customer-facing. Порядок = порядок колонок в файле.
const PRICE_LIST_CSV_COLUMNS = [
  { key: 'scientificName', header: 'Научное название' },
  { key: 'speciesName', header: 'Вид' },
  { key: 'containerName', header: 'Контейнер' },
  { key: 'count', header: 'В наличии, шт' },
  { key: 'price', header: 'Цена, BYN' },
];

// Итоговая строка «Всего»: подпись — в первую текстовую колонку, count — сумма, остальные
// ячейки пустые (toCsv отдаёт '' для отсутствующих ключей).
function totalRow(columns, total) {
  return { [columns[0].key]: 'Всего', count: total };
}

// GET /exports/stock — сводка «что есть в наличии». Валидация query здесь через safeParse:
// validate()-middleware проверяет только req.body, а голый parse кинул бы ZodError мимо
// errorHandler (→ 500). Оба формата (json/csv) гейтятся feature_export в сервисе.
export async function getStockExport(req, res, next) {
  try {
    const parsed = stockExportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Некорректные параметры экспорта', 400);
    }

    const { groupBy, format } = parsed.data;
    const accountId = req.user.accountId;
    const nurseryId = req.params.nurseryId;

    const result = await exportService.getStockExport(nurseryId, accountId, { groupBy });

    if (format === 'csv') {
      const columns = groupBy === 'location' ? STOCK_LOCATION_CSV_COLUMNS : STOCK_SPECIES_CSV_COLUMNS;
      const csv = toCsv([...result.rows, totalRow(columns, result.total)], columns);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="stock_${groupBy}_${date}.csv"`);
      return res.send(csv);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// GET /exports/price-list — «готовый файл покупателю». Валидация query через safeParse
// (см. коммент к getStockExport). Оба формата (json/csv) гейтятся feature_export в сервисе.
// CSV дополнительно несёт блок-шапку (имя питомника, дата, «Цены в BYN») перед таблицей:
// toCsv отдаёт таблицу со своим BOM и ';'+CRLF, а шапку дорисовываем здесь — снимаем BOM
// таблицы и склеиваем '﻿' + шапка + таблица. Имя питомника экранируем тем же
// escapeCell, что и ячейки, — на случай ';' / '"' / переводов строк в названии.
export async function getPriceListExport(req, res, next) {
  try {
    const parsed = priceListExportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Некорректные параметры экспорта', 400);
    }

    const { includeUnpriced, format } = parsed.data;
    const accountId = req.user.accountId;
    const nurseryId = req.params.nurseryId;

    const result = await exportService.getPriceListExport(nurseryId, accountId, { includeUnpriced });

    if (format === 'csv') {
      const columns = PRICE_LIST_CSV_COLUMNS;
      const date = result.meta.exportedAt;
      const table = toCsv([...result.rows, totalRow(columns, result.total)], columns);
      const metaBlock =
        [escapeCell(result.meta.nurseryName), date, 'Цены в BYN'].join('\r\n') + '\r\n\r\n';
      const csv = '﻿' + metaBlock + table.slice(1); // снимаем BOM таблицы, ставим свой
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="price-list_${date}.csv"`);
      return res.send(csv);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
