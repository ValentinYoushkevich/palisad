import { z } from 'zod';

export const createMovementSchema = z.object({
  typeId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional().nullable(),
  toLocationId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().max(2000).optional().nullable(),
});
