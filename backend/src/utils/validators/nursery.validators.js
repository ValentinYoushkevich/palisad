import { z } from 'zod';

export const createNurserySchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional(),
});

export const updateNurserySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().max(500).optional(),
});
