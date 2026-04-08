import { Router } from 'express';

import { WRITE_ROLES } from '@/constants/roles.constants.js';
import * as movementController from '@/controllers/movement.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { createMovementSchema } from '@/utils/validators/movement.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', movementController.getMovements);
router.post(
  '/',
  requireRole(...WRITE_ROLES),
  validate(createMovementSchema),
  movementController.createMovement
);
router.delete('/:id', movementController.deleteMovement);

export default router;
