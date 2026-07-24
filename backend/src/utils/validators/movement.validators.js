import { z } from 'zod';

export const createMovementSchema = z.object({
  typeId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional().nullable(),
  toLocationId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().max(2000).optional().nullable(),
  // Ключ идемпотентности повторной доставки офлайн-очереди (F2): optional (не nullable) —
  // если клиент не прислал, поле отсутствует и дедуп не применяется.
  clientRequestId: z.string().uuid().optional(),
});
