import { z } from 'zod';

export const changePlanSchema = z.object({
  planId: z.string().uuid(),
});
