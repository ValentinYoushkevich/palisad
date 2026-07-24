import { Router } from 'express';

import { ROLES, STRUCTURE_ROLES, WRITE_ROLES } from '@/constants/roles.constants.js';
import * as plantController from '@/controllers/plant.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import {
  bulkCreateSchema,
  createPlantSchema,
  updatePlantSchema,
} from '@/utils/validators/plant.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', plantController.getPlants);
router.get('/by-qr/:qrCode', plantController.findByQr);
router.get('/by-code/:numericCode', plantController.findByNumericCode);
router.get('/:id', plantController.getPlantById);
router.post(
  '/',
  requireRole(...STRUCTURE_ROLES),
  validate(createPlantSchema),
  plantController.createPlant
);
router.post(
  '/bulk',
  requireRole(...STRUCTURE_ROLES),
  validate(bulkCreateSchema),
  plantController.bulkCreate
);
router.patch(
  '/:id',
  requireRole(...STRUCTURE_ROLES),
  validate(updatePlantSchema),
  plantController.updatePlant
);
router.delete('/:id', requireRole(...STRUCTURE_ROLES), plantController.softDelete);
// B32: гейт роли — в middleware, как у остальных маршрутов (restore в сервисе owner-only).
router.patch('/:id/restore', requireRole(ROLES.OWNER), plantController.restore);
router.post('/:id/tags/:tagId', requireRole(...WRITE_ROLES), plantController.addTag);
router.delete(
  '/:id/tags/:tagId',
  requireRole(...STRUCTURE_ROLES),
  plantController.removeTag
);

export default router;
