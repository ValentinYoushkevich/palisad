import { Router } from 'express';

import * as nurseryController from '@/controllers/nursery.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { validate } from '@/middlewares/validate.js';
import {
  createNurserySchema,
  updateNurserySchema,
} from '@/utils/validators/nursery.validators.js';

const router = Router();

router.use(requireAuth);
router.get('/my', nurseryController.getMyNursery);
router.post('/', validate(createNurserySchema), nurseryController.createNursery);
router.patch('/my', validate(updateNurserySchema), nurseryController.updateNursery);

export default router;
