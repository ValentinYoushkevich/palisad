import { Router } from 'express';

import * as adminController from '@/controllers/admin.controller.js';
import { adminLimiter } from '@/middlewares/rateLimit.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requirePlatformAdmin } from '@/middlewares/requirePlatformAdmin.js';
import { validate } from '@/middlewares/validate.js';
import { issueCodesSchema } from '@/utils/validators/admin.validators.js';

// Э3: платформенный админ-API. НЕ проходит через nursery-скоуп (/api/nurseries/:id/*) —
// это операции над всей платформой (лицензии, заявки). requirePlatformAdmin читает флаг
// из БД на каждый запрос (привилегия не живёт в JWT). adminLimiter — строгий rate-limit.
const router = Router();

router.use(requireAuth, requirePlatformAdmin, adminLimiter);

router.post('/license-codes', validate(issueCodesSchema), adminController.issueCodes);
router.get('/license-codes', adminController.listCodes);
router.post('/license-codes/:id/revoke', adminController.revokeCode);

router.get('/plan-requests', adminController.listPlanRequests);
router.post('/plan-requests/:id/process', adminController.processPlanRequest);

export default router;
