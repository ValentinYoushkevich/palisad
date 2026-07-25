import { Router } from 'express';

import { STRUCTURE_ROLES, WRITE_ROLES } from '@/constants/roles.constants.js';
import * as inventorySessionController from '@/controllers/inventorySession.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import {
  applyInventorySchema,
  createInventorySessionSchema,
} from '@/utils/validators/inventory.validators.js';

// Инвентаризация сканированием (§ «Инвентаризация», Э2). Создание сессии — «пишущим»
// ролям (owner/agronomist/worker); чтение истории и деталей доступно ЛЮБОЙ роли питомника
// (включая observer), поэтому GET'ы без requireRole. Поздние стадии («применить»
// расхождения, PDF-акт) добавятся сюда же поверх того же роутера/контроллера/сервиса.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.post(
  '/',
  requireRole(...WRITE_ROLES),
  validate(createInventorySessionSchema),
  inventorySessionController.create
);
router.get('/', inventorySessionController.list);
router.get('/:id', inventorySessionController.getById);

// Применить расхождения (Э3) — структурным ролям (owner/agronomist): списание меняет
// статус растения и создаёт движения, поэтому доступ уже, чем у создания сессии (WRITE_ROLES).
router.post(
  '/:id/apply',
  requireRole(...STRUCTURE_ROLES),
  validate(applyInventorySchema),
  inventorySessionController.apply
);

// PDF-акт (Э4) — просмотр/печать, а не изменение данных, поэтому БЕЗ requireRole: доступен
// ЛЮБОЙ роли питомника (включая observer). requireAuth + requireNurseryAccess уже на router.use.
router.get('/:id/act', inventorySessionController.act);

export default router;
