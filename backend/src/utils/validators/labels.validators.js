import { z } from 'zod';

export const labelsSchema = z.object({
  plantIds: z.array(z.string().uuid()).min(1).max(100),
  layout: z.enum(['single', 'grid']).default('grid'),
});
