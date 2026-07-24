import { Router } from 'express';

import * as subscriptionController from '@/controllers/subscription.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';

const router = Router();
router.use(requireAuth);

// B33: раньше этот алиас висел инлайном в app.js мимо роутеров. Путь и поведение прежние —
// GET /api/plans возвращает список планов (тест subscriptions.test.js «GET /api/plans (alias)»).
router.get('/', subscriptionController.getPlans);

export default router;
