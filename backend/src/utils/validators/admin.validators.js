import { z } from 'zod';

// Э3: выпуск партии лицензионных кодов платформенным админом.
// count 1..50 (одним запросом не более 50 кодов), по умолчанию 1.
export const issueCodesSchema = z.object({
  planId: z.string().uuid(),
  durationDays: z.coerce.number().int().positive(),
  note: z.string().max(500).optional(),
  count: z.coerce.number().int().min(1).max(50).optional().default(1),
});
