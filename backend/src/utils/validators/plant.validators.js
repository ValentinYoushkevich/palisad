import { z } from 'zod';

export const createPlantSchema = z.object({
  speciesId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  containerId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  variety: z.string().max(200).optional().nullable(),
  plantedAt: z.string().date().optional().nullable(),
  source: z.enum(['own', 'purchased']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const bulkCreateSchema = z.object({
  count: z.number().int().min(1).max(500),
  template: createPlantSchema,
});

export const updatePlantSchema = z.object({
  speciesId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  containerId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  variety: z.string().max(200).optional().nullable(),
  plantedAt: z.string().date().optional().nullable(),
  source: z.enum(['own', 'purchased']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const plantFiltersSchema = z.object({
  status: z.enum(['growing', 'storage', 'sold', 'written_off']).optional(),
  speciesId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  containerId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  numericCode: z.string().optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});
