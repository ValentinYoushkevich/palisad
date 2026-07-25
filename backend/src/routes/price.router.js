import { Router } from 'express';

import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as priceController from '@/controllers/price.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { upsertPriceSchema } from '@/utils/validators/price.validators.js';

// Прайс-лист питомника (v3, Э1 «Экспорт»). Как и отчёты — доступ только «структурным»
// ролям (owner/agronomist); worker/observer получают 403. Экспорт CSV прайс-листа (Э2/Э3)
// будет гейтиться feature_export, но само управление ценами (Э1) — нет (любой тариф).
const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess, requireRole(...STRUCTURE_ROLES));

router.get('/', priceController.getPrices);
router.put('/', validate(upsertPriceSchema), priceController.upsertPrice);
router.delete('/:id', priceController.deletePrice);

export default router;
