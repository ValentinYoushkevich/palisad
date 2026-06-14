import { Router } from 'express';

import * as notificationController from '@/controllers/notification.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', notificationController.getNotifications);
router.patch('/:id/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);

export default router;
