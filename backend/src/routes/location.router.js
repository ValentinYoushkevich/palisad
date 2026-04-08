import { Router } from 'express';

import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as locationController from '@/controllers/location.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import {
  createLocationSchema,
  updateLocationSchema,
} from '@/utils/validators/location.validators.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireNurseryAccess);
router.get('/', locationController.getLocations);
router.get('/tree', locationController.getLocationsTree);
router.post(
  '/',
  requireRole(...STRUCTURE_ROLES),
  validate(createLocationSchema),
  locationController.createLocation
);
router.patch(
  '/:id',
  requireRole(...STRUCTURE_ROLES),
  validate(updateLocationSchema),
  locationController.updateLocation
);
router.delete(
  '/:id',
  requireRole(...STRUCTURE_ROLES),
  locationController.deleteLocation
);

export default router;
