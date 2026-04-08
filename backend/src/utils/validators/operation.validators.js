import { z } from 'zod';

import { OPERATION_TYPES } from '@/constants/operation.constants.js';

export const createOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  newContainerId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES).optional(),
  newContainerId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
