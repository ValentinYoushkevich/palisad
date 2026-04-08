import { Router } from 'express';

import * as labelsController from '@/controllers/labels.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { validate } from '@/middlewares/validate.js';
import { labelsSchema } from '@/utils/validators/labels.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.post('/labels', validate(labelsSchema), labelsController.generateLabels);

export default router;
