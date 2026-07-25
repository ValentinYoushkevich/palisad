import * as reportService from '@/services/report.service.js';
import { AppError } from '@/utils/AppError.js';
import { toCsv } from '@/utils/csv.js';
import {
  laborCostQuerySchema,
  stockFlowQuerySchema,
  writeOffsQuerySchema,
} from '@/utils/validators/report.validators.js';

// Колонки CSV-выгрузки отчёта «списания».
const WRITE_OFFS_CSV_COLUMNS = [
  { key: 'label', header: 'Группа' },
  { key: 'count', header: 'Списано' },
  { key: 'share', header: 'Доля' },
];

// Колонки CSV-выгрузки отчёта «движение остатков» (Э2).
const STOCK_FLOW_CSV_COLUMNS = [
  { key: 'label', header: 'Группа' },
  { key: 'opening', header: 'Начало' },
  { key: 'inflow', header: 'Приход' },
  { key: 'sold', header: 'Продано' },
  { key: 'writtenOff', header: 'Списано' },
  { key: 'transfersNet', header: 'Перемещения' },
  { key: 'closing', header: 'Конец' },
];

// Колонки CSV-выгрузки отчёта «трудозатраты» (Э3, нормо-минуты).
const LABOR_COST_CSV_COLUMNS = [
  { key: 'label', header: 'Группа' },
  { key: 'minutes', header: 'Нормо-минуты' },
  { key: 'operations', header: 'Операций' },
  { key: 'plants', header: 'Растений' },
  { key: 'minutesPerPlant', header: 'Минут на растение' },
];

// Валидация query выполняется здесь через safeParse: проектный validate() проверяет
// только req.body, а голый schema.parse(req.query) кинул бы ZodError мимо errorHandler
// (→ 500). При ошибке отдаём 400 осмысленным AppError.
export async function getWriteOffs(req, res, next) {
  try {
    const parsed = writeOffsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Некорректные параметры запроса отчёта', 400);
    }

    const { dateFrom, dateTo, groupBy, format } = parsed.data;
    const result = await reportService.getWriteOffs({
      nurseryId: req.params.nurseryId,
      dateFrom,
      dateTo,
      groupBy,
    });

    if (format === 'csv') {
      const csv = toCsv(result.rows, WRITE_OFFS_CSV_COLUMNS);
      const filename = `write-offs_${dateFrom.toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// Отчёт «движение остатков» (Э2): opening/inflow/sold/writtenOff/transfersNet/closing по
// выбранному измерению. Валидация query — как в getWriteOffs (safeParse → 400), затем
// json или csv в зависимости от format.
export async function getStockFlow(req, res, next) {
  try {
    const parsed = stockFlowQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Некорректные параметры запроса отчёта', 400);
    }

    const { dateFrom, dateTo, groupBy, format } = parsed.data;
    const result = await reportService.getStockFlow({
      nurseryId: req.params.nurseryId,
      dateFrom,
      dateTo,
      groupBy,
    });

    if (format === 'csv') {
      const csv = toCsv(result.rows, STOCK_FLOW_CSV_COLUMNS);
      const filename = `stock-flow_${dateFrom.toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// Отчёт «трудозатраты» (Э3, labor-cost): нормо-минуты по виду/исторической стадии, без
// денег. Валидация query — как в getWriteOffs (safeParse → 400), затем json или csv.
export async function getLaborCost(req, res, next) {
  try {
    const parsed = laborCostQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Некорректные параметры запроса отчёта', 400);
    }

    const { dateFrom, dateTo, groupBy, format } = parsed.data;
    const result = await reportService.getLaborCost({
      nurseryId: req.params.nurseryId,
      dateFrom,
      dateTo,
      groupBy,
    });

    if (format === 'csv') {
      const csv = toCsv(result.rows, LABOR_COST_CSV_COLUMNS);
      const filename = `labor-cost_${dateFrom.toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
