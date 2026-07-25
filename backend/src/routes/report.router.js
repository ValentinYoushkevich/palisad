import { Router } from 'express';

import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as reportController from '@/controllers/report.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';

// Отчёты — read-only и доступны только «структурным» ролям (owner/agronomist);
// worker/observer получают 403. Каждый отчёт — отдельный GET. Скелет рассчитан на
// добавление Э2/Э3 (ещё два отчёта) поверх этого же роутера/контроллера/сервиса.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess, requireRole(...STRUCTURE_ROLES));

router.get('/write-offs', reportController.getWriteOffs);
router.get('/stock-flow', reportController.getStockFlow);
router.get('/labor-cost', reportController.getLaborCost);

export default router;
