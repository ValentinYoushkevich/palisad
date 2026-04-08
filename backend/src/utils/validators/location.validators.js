import { z } from 'zod';

const locationTypeSchema = z.enum(['area', 'section', 'row', 'place']);

export const createLocationSchema = z.object({
  name: z.string().min(1).max(200),
  type: locationTypeSchema,
  parentId: z.string().uuid().optional().nullable(),
});

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: locationTypeSchema.optional(),
  parentId: z.string().uuid().optional().nullable(),
});
