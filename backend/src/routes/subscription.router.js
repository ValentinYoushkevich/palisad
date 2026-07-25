import { Router } from 'express';

import { ROLES } from '@/constants/roles.constants.js';
import * as subscriptionController from '@/controllers/subscription.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { activateCodeLimiter } from '@/middlewares/rateLimit.js';
import { validate } from '@/middlewares/validate.js';
import {
  activateCodeSchema,
  changePlanSchema,
} from '@/utils/validators/subscription.validators.js';

const router = Router();

router.use(requireAuth);
router.get('/current', subscriptionController.getCurrent);
router.get('/plans', subscriptionController.getPlans);
router.post('/change', validate(changePlanSchema), subscriptionController.changePlan);
// Э2: активация лицензионного кода. Строгий rate-limit + только OWNER; логика — одна
// транзакция в сервисе. requireAuth уже навешен через router.use выше.
router.post(
  '/activate-code',
  activateCodeLimiter,
  requireRole(ROLES.OWNER),
  validate(activateCodeSchema),
  subscriptionController.activateCode
);

export default router;
