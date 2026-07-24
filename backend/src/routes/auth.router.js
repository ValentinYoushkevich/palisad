import { Router } from 'express';

import * as authController from '@/controllers/auth.controller.js';
import { authLimiter } from '@/middlewares/rateLimit.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { validate } from '@/middlewares/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from '@/utils/validators/auth.validators.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
// Строгий лимитер против брутфорса на входе и обновлении токена (B14).
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authLimiter, authController.refresh);
router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
