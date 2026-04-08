import { Router } from 'express';

import * as authController from '@/controllers/auth.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { validate } from '@/middlewares/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from '@/utils/validators/auth.validators.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
