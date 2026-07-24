import { Router } from 'express';
import multer from 'multer';

import { WRITE_ROLES } from '@/constants/roles.constants.js';
import * as operationController from '@/controllers/operation.controller.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { AppError } from '@/utils/AppError.js';
import {
  createOperationSchema,
  updateOperationSchema,
} from '@/utils/validators/operation.validators.js';

// Фото операций: мелкие изображения принимаем в память (memoryStorage) и кладём
// в БД как байты. Хард-лимит 512 КБ и фильтр по mime закрывают B18 (валидация входа).
const MAX_PHOTO_BYTES = 512 * 1024;
const ALLOWED_PHOTO_MIME = /^image\/(webp|jpeg|png)$/;

const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter(req, file, cb) {
    if (ALLOWED_PHOTO_MIME.test(file.mimetype)) {
      return cb(null, true);
    }

    return cb(new AppError('Недопустимый тип файла: только изображения (webp, jpeg, png)', 415));
  },
}).single('file');

// Оборачиваем multer, чтобы его ошибки шли через общий errorHandler осмысленными
// статусами: превышение лимита → 413, прочие ошибки multer → 400, ошибка fileFilter
// (AppError, 415) пробрасывается как есть.
function handlePhotoUpload(req, res, next) {
  uploadPhoto(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Файл слишком большой (максимум 512 КБ)'
          : 'Некорректная загрузка файла';
      return next(new AppError(message, status));
    }

    return next(err);
  });
}

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', operationController.getOperations);
router.post(
  '/',
  requireRole(...WRITE_ROLES),
  validate(createOperationSchema),
  operationController.createOperation
);
router.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  validate(updateOperationSchema),
  operationController.updateOperation
);
router.delete('/:id', requireRole(...WRITE_ROLES), operationController.softDelete);
router.post(
  '/:id/photos',
  requireRole(...WRITE_ROLES),
  handlePhotoUpload,
  operationController.attachPhoto
);
router.get('/:id/photos/:photoId/content', operationController.getPhotoContent);
router.delete(
  '/:id/photos/:photoId',
  requireRole(...WRITE_ROLES),
  operationController.deletePhoto
);

export default router;
