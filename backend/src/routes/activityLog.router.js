import { Router } from 'express';

import * as activityLogController from '@/controllers/activityLog.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', activityLogController.getLogs);

export default router;
