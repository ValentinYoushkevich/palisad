import { Router } from 'express';

import { STAFF_ROLES } from '@/constants/roles.constants.js';
import * as staffController from '@/controllers/staff.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import {
  changeRoleSchema,
  createUserSchema,
  updateUserSchema,
} from '@/utils/validators/staff.validators.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireNurseryAccess);
router.get('/', staffController.getUsers);
router.get('/:id', staffController.getUserById);
router.post(
  '/',
  requireRole(...STAFF_ROLES),
  validate(createUserSchema),
  staffController.createUser
);
router.patch(
  '/:id',
  requireRole(...STAFF_ROLES),
  validate(updateUserSchema),
  staffController.updateUser
);
router.patch(
  '/:id/role',
  requireRole(...STAFF_ROLES),
  validate(changeRoleSchema),
  staffController.changeRole
);
router.patch('/:id/status', requireRole(...STAFF_ROLES), staffController.toggleStatus);

export default router;
