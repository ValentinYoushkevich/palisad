import { Router } from 'express';

import { WRITE_ROLES } from '@/constants/roles.constants.js';
import * as operationController from '@/controllers/operation.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import {
  createOperationSchema,
  updateOperationSchema,
} from '@/utils/validators/operation.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', operationController.getOperations);
router.post(
  '/',
  requireRole(...WRITE_ROLES),
  validate(createOperationSchema),
  operationController.createOperation
);
router.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  validate(updateOperationSchema),
  operationController.updateOperation
);
router.delete('/:id', requireRole(...WRITE_ROLES), operationController.softDelete);
router.post('/:id/photos', requireRole(...WRITE_ROLES), operationController.attachPhoto);
router.delete(
  '/:id/photos/:photoId',
  requireRole(...WRITE_ROLES),
  operationController.deletePhoto
);

export default router;
