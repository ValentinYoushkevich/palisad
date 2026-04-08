import { Router } from 'express';

import * as subscriptionController from '@/controllers/subscription.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { validate } from '@/middlewares/validate.js';
import { changePlanSchema } from '@/utils/validators/subscription.validators.js';

const router = Router();

router.use(requireAuth);
router.get('/current', subscriptionController.getCurrent);
router.get('/plans', subscriptionController.getPlans);
router.post('/change', validate(changePlanSchema), subscriptionController.changePlan);

export default router;
