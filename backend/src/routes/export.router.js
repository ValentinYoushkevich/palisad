import { Router } from 'express';

import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as exportController from '@/controllers/export.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';

// CSV-экспорт (§4 «Экспорт»). Как отчёты и прайс-лист — только «структурным» ролям
// (owner/agronomist); worker/observer получают 403. Дополнительно каждый экспорт гейтится
// feature_export (см. export.service). Э2 — сводка наличия; Э3 добавит /price-list здесь же.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess, requireRole(...STRUCTURE_ROLES));

router.get('/stock', exportController.getStockExport);
router.get('/price-list', exportController.getPriceListExport);

export default router;
