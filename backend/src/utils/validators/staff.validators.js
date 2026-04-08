import { z } from 'zod';

import { ROLES } from '@/constants/roles.constants.js';

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum([ROLES.AGRONOMIST, ROLES.WORKER, ROLES.OBSERVER]),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export const changeRoleSchema = z.object({
  role: z.enum([ROLES.AGRONOMIST, ROLES.WORKER, ROLES.OBSERVER]),
});
