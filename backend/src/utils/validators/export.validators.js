import { z } from 'zod';

// Query-параметры CSV-экспорта (§4 «Экспорт», Э2 «наличие»). groupBy выбирает измерение
// сводки: по виду (species, дефолт) или по локации (location). format — тело ответа:
// json (дефолт) или csv. Оба формата гейтятся feature_export в сервисе. Э3 добавит сюда
// собственные схемы (прайс-лист) на том же роутере.
export const stockExportQuerySchema = z.object({
  groupBy: z.enum(['species', 'location']).default('species'),
  format: z.enum(['json', 'csv']).default('json'),
});

// Query-параметры прайс-листа (Э3). includeUnpriced принимает строку 'true'/'false' (из
// query) либо boolean и приводится к boolean (дефолт false = только позиции с ценой;
// true = режим владельца «найти пробелы»). format — json (дефолт) или csv. Оба формата
// гейтятся feature_export в сервисе.
export const priceListExportQuerySchema = z.object({
  includeUnpriced: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  format: z.enum(['json', 'csv']).default('json'),
});
