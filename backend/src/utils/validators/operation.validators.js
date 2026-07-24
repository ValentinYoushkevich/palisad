import { z } from 'zod';

import { OPERATION_TYPES } from '@/constants/operation.constants.js';

export const createOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  newContainerId: z.string().uuid().optional().nullable(),
  newStageId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // Ключ идемпотентности повторной доставки офлайн-очереди (F2): optional (не nullable) —
  // если клиент не прислал, поле отсутствует и дедуп не применяется.
  clientRequestId: z.string().uuid().optional(),
});

export const updateOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES).optional(),
  newContainerId: z.string().uuid().optional().nullable(),
  newStageId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
