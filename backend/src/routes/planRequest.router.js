import { Router } from 'express';

import { ROLES } from '@/constants/roles.constants.js';
import * as planRequestController from '@/controllers/planRequest.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { createPlanRequestSchema } from '@/utils/validators/planRequest.validators.js';

// Э4: owner-ручки лидов «хочу план». Отдельный префикс /api/plan-requests (НЕ конфликтует
// с admin-роутером /api/admin/plan-requests). Только OWNER: requireAuth + requireRole.
const router = Router();

router.use(requireAuth, requireRole(ROLES.OWNER));

router.post('/', validate(createPlanRequestSchema), planRequestController.create);
router.get('/my', planRequestController.listMy);

export default router;
