import { Router } from 'express';

import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as nurseryController from '@/controllers/nursery.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
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
// B22: PATCH /my гейтит роль в контроллере updateMyNursery — там нужно сперва отличить
// «активного питомника нет» (404) от «недостаточно прав» (403); requireRole в middleware
// не видит контекста питомника и дал бы 403 owner'у без питомника. PATCH /:nurseryId ниже
// имеет гарантированный контекст (requireNurseryAccess) и гейтится requireRole.
router.patch('/my', validate(updateNurserySchema), nurseryController.updateMyNursery);

router.post('/:nurseryId/switch', nurseryController.switchNursery);
router.get('/:nurseryId', requireNurseryAccess, nurseryController.getNurseryById);
router.patch(
  '/:nurseryId',
  requireNurseryAccess,
  requireRole(...STRUCTURE_ROLES),
  validate(updateNurserySchema),
  nurseryController.updateNursery
);

export default router;
