import { Router } from 'express';

import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as dictionaryController from '@/controllers/dictionary.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import {
  createContainerTypeSchema,
  createMovementTypeSchema,
  createSpeciesSchema,
  createTagSchema,
  updateContainerTypeSchema,
  updateMovementTypeSchema,
  updateSpeciesSchema,
  updateTagSchema,
} from '@/utils/validators/dictionary.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/species', dictionaryController.getSpecies);
router.get('/species/search', dictionaryController.searchSpecies);
router.post(
  '/species',
  requireRole(...STRUCTURE_ROLES),
  validate(createSpeciesSchema),
  dictionaryController.createSpecies
);
router.patch(
  '/species/:id',
  requireRole(...STRUCTURE_ROLES),
  validate(updateSpeciesSchema),
  dictionaryController.updateSpecies
);
router.delete(
  '/species/:id',
  requireRole(...STRUCTURE_ROLES),
  dictionaryController.deleteSpecies
);

router.get('/tags', dictionaryController.getTags);
router.post(
  '/tags',
  requireRole(...STRUCTURE_ROLES),
  validate(createTagSchema),
  dictionaryController.createTag
);
router.patch(
  '/tags/:id',
  requireRole(...STRUCTURE_ROLES),
  validate(updateTagSchema),
  dictionaryController.updateTag
);
router.delete('/tags/:id', requireRole(...STRUCTURE_ROLES), dictionaryController.deleteTag);

router.get('/movement-types', dictionaryController.getMovementTypes);
router.post(
  '/movement-types',
  requireRole(...STRUCTURE_ROLES),
  validate(createMovementTypeSchema),
  dictionaryController.createMovementType
);
router.patch(
  '/movement-types/:id',
  requireRole(...STRUCTURE_ROLES),
  validate(updateMovementTypeSchema),
  dictionaryController.updateMovementType
);
router.delete(
  '/movement-types/:id',
  requireRole(...STRUCTURE_ROLES),
  dictionaryController.deleteMovementType
);

router.get('/container-types', dictionaryController.getContainerTypes);
router.post(
  '/container-types',
  requireRole(...STRUCTURE_ROLES),
  validate(createContainerTypeSchema),
  dictionaryController.createContainerType
);
router.patch(
  '/container-types/:id',
  requireRole(...STRUCTURE_ROLES),
  validate(updateContainerTypeSchema),
  dictionaryController.updateContainerType
);
router.delete(
  '/container-types/:id',
  requireRole(...STRUCTURE_ROLES),
  dictionaryController.deleteContainerType
);

export default router;
