import { Router } from 'express';

import * as nurseryController from '@/controllers/nursery.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { validate } from '@/middlewares/validate.js';
import {
  createNurserySchema,
  updateNurserySchema,
} from '@/utils/validators/nursery.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', nurseryController.listNurseries);
router.get('/my', nurseryController.getMyNursery);
router.post('/', validate(createNurserySchema), nurseryController.createNursery);
router.patch('/my', validate(updateNurserySchema), nurseryController.updateMyNursery);

router.post('/:nurseryId/switch', nurseryController.switchNursery);
router.get('/:nurseryId', requireNurseryAccess, nurseryController.getNurseryById);
router.patch(
  '/:nurseryId',
  requireNurseryAccess,
  validate(updateNurserySchema),
  nurseryController.updateNursery
);

export default router;
