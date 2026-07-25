import { z } from 'zod';

// Максимальный диапазон отчёта — ~2 года. Верхняя граница защищает от неограниченных
// агрегаций по всей истории питомника (тяжёлые сканы).
const MAX_RANGE_DAYS = 731;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Общая база всех отчётов: обязательные даты периода + формат ответа. dateFrom/dateTo
// принимают как 'YYYY-MM-DD', так и полный ISO — z.coerce.date() приводит оба через
// new Date(); отсутствующее/битое значение даёт Invalid Date и валидация падает (→ 400).
// Э2/Э3 расширяют этот shape своими полями (см. withDateRangeRefinements).
export const baseReportShape = {
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  format: z.enum(['json', 'csv']).default('json'),
};

// Навешивает на объектную схему проверки корректности диапазона: dateFrom не позже
// dateTo и длина периода в пределах MAX_RANGE_DAYS. Вынесено отдельно, чтобы Э2/Э3
// переиспользовали те же рефайнменты поверх собственных объектных схем.
export function withDateRangeRefinements(schema) {
  return schema
    .refine((value) => value.dateFrom <= value.dateTo, {
      message: 'dateFrom не может быть позже dateTo',
      path: ['dateFrom'],
    })
    .refine((value) => (value.dateTo - value.dateFrom) / MS_PER_DAY <= MAX_RANGE_DAYS, {
      message: 'Диапазон дат не должен превышать 2 года',
      path: ['dateTo'],
    });
}

// Отчёт «списания» (Э1): база + группировка. По умолчанию — помесячно.
export const writeOffsQuerySchema = withDateRangeRefinements(
  z.object({
    ...baseReportShape,
    groupBy: z.enum(['location', 'species', 'stage', 'month', 'movementType']).default('month'),
  })
);

// Отчёт «движение остатков» (Э2, stock-flow): база + измерение группировки. По
// умолчанию — по виду (species): атрибут постоянен во времени, поэтому балансовая
// идентичность closing = opening + inflow − sold − writtenOff + transfersNet закрывается.
export const stockFlowQuerySchema = withDateRangeRefinements(
  z.object({
    ...baseReportShape,
    groupBy: z.enum(['location', 'species', 'stage']).default('species'),
  })
);

// Отчёт «трудозатраты» (Э3, labor-cost, нормо-минуты): база + измерение группировки.
// По умолчанию — по виду (species). Для stage группировка идёт по ИСТОРИЧЕСКОЙ стадии
// на момент операции (см. report.service.resolveStageAtOperation), а не по текущей.
export const laborCostQuerySchema = withDateRangeRefinements(
  z.object({
    ...baseReportShape,
    groupBy: z.enum(['species', 'stage']).default('species'),
  })
);
