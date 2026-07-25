import { z } from 'zod';

// Множество категорий строки сверки — общее для БД (CHECK), сервиса и поздних стадий
// (тело «применить»). Экспортируется, чтобы не дублировать литералы по слоям.
export const INVENTORY_CATEGORIES = ['matched', 'missing', 'foreign', 'unknown'];

// Одна запись скана: код (QR или числовой) + момент сканирования на устройстве.
// trim + min(1) отсекают пустые/пробельные коды на входе; max(128) — защита от мусора.
// datetime с offset — сканы собираются офлайн, метка времени приходит с часовым поясом устройства.
const scanSchema = z.object({
  code: z.string().trim().min(1).max(128),
  scannedAt: z.string().datetime({ offset: true }),
});

// Тело POST создания сессии инвентаризации (Э1 «Инвентаризация»). Парсится
// middleware validate() из req.body. locationId — корень сканируемой зоны;
// startedAt/completedAt приходят с устройства (сессия может собираться офлайн);
// clientRequestId — ключ идемпотентности повторной доставки (F2). scans ограничены
// сверху (5000) — переполнение отдаёт 400; пустой массив допустим (сессия без единого
// скана = вся зона в missing).
export const createInventorySessionSchema = z
  .object({
    locationId: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    clientRequestId: z.string().uuid(),
    scans: z.array(scanSchema).max(5000),
  })
  .refine((data) => new Date(data.completedAt) >= new Date(data.startedAt), {
    message: 'completedAt не может быть раньше startedAt',
    path: ['completedAt'],
  });

// Список id растений для одной операции применения. plantIds по умолчанию [] (пустой
// выбор = ничего не делать), сверху зажат тем же лимитом 5000, что и сканы — защита от
// мусорного тела. Дедуп входа делает сервис (валидатор допускает повторы).
const applyPlantIds = z.array(z.string().uuid()).max(5000).default([]);

// Тело POST /:id/apply (Э3 «Инвентаризация» — применить расхождения). Две независимые
// группы: writeOff (списать «пропавшие» — числятся в зоне, но не отсканированы) и
// transfer (вернуть «чужие» — отсканированы в зоне, но числятся в другой). Обе группы
// необязательны: пустое/{} тело — валидный no-op (сервис вернёт 0/0). movementTypeId
// обязателен ТОЛЬКО когда есть что списывать (refine) — тип списания выбирает
// пользователь (own/system, sets_status='written_off'); тип перемещения системный и
// резолвится сервисом по slug, поэтому его в теле нет.
export const applyInventorySchema = z.object({
  writeOff: z
    .object({
      plantIds: applyPlantIds,
      movementTypeId: z.string().uuid().optional(),
    })
    .refine((value) => value.plantIds.length === 0 || Boolean(value.movementTypeId), {
      message: 'movementTypeId обязателен, когда указаны plantIds для списания',
      path: ['movementTypeId'],
    })
    .optional(),
  transfer: z
    .object({
      plantIds: applyPlantIds,
    })
    .optional(),
});
