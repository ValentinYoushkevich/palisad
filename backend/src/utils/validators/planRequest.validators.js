import { z } from 'zod';

// Э4 (owner «хочу план»): planId обязателен (uuid), comment опционален.
export const createPlanRequestSchema = z.object({
  planId: z.string().uuid(),
  comment: z.string().max(1000).optional(),
});
