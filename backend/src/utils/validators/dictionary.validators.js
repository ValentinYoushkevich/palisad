import { z } from 'zod';

import { OPERATION_TYPES } from '@/constants/operation.constants.js';

const statusSchema = z.enum(['growing', 'storage', 'sold', 'written_off']);
const containerKindSchema = z.enum([
  'pot',
  'open_root',
  'trench',
  'cold_room',
  'greenhouse',
]);

export const attachSpeciesByNameSchema = z.object({
  scientific_name: z.string().min(1).max(255),
  display_name_ru: z.string().min(1).max(255),
});

export const updateSpeciesSchema = z.object({
  display_name_ru: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  is_active: z.boolean().optional(),
});

export const createMovementTypeSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  sets_status: statusSchema.optional().nullable(),
});

export const updateMovementTypeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  sets_status: statusSchema.optional().nullable(),
  is_active: z.boolean().optional(),
});

export const createContainerTypeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(120),
  container_kind: containerKindSchema,
  volume_liters: z.number().nonnegative().optional().nullable(),
  side_cm: z.number().nonnegative().optional().nullable(),
});

export const updateContainerTypeSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(120).optional(),
  container_kind: containerKindSchema.optional(),
  volume_liters: z.number().nonnegative().optional().nullable(),
  side_cm: z.number().nonnegative().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const createProductionStageSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  sort_order: z.number().int().min(0).optional(),
});

export const updateProductionStageSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const createLaborNormSchema = z.object({
  stage_id: z.string().uuid(),
  operation_type: z.enum(OPERATION_TYPES),
  norm_minutes: z.number().int().min(0),
});

export const updateLaborNormSchema = z.object({
  operation_type: z.enum(OPERATION_TYPES).optional(),
  norm_minutes: z.number().int().min(0).optional(),
});
