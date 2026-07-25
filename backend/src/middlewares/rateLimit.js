import rateLimit from 'express-rate-limit';

import { AppError } from '@/utils/AppError.js';

// Rate limiting (B14): раньше брутфорс по POST /api/auth/login ничем не ограничивался.
// Общий лимитер прикрывает весь /api, строгий authLimiter — эндпоинты аутентификации.
const isTest = process.env.NODE_ENV === 'test';

// Позволяем переопределить лимиты через env (нужно тестам, чтобы дёшево воспроизвести
// 429). В тестовой среде дефолты подняты «в потолок», иначе множественные логины из
// фикстур сами упирались бы в лимит и делали набор флаки.
function intFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const WINDOW_MS = intFromEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const GENERAL_MAX = intFromEnv('RATE_LIMIT_MAX', isTest ? 1_000_000 : 300);
const AUTH_MAX = intFromEnv('RATE_LIMIT_AUTH_MAX', isTest ? 1_000_000 : 10);
// Э2: активация лицензионного кода — чувствительный к брутфорсу путь (перебор кодов),
// поэтому строгий лимит по образцу authLimiter. В test потолок поднят, чтобы фикстуры
// не упирались в лимит; в проде ~10 попыток на окно.
const ACTIVATE_MAX = intFromEnv('RATE_LIMIT_ACTIVATE_MAX', isTest ? 1_000_000 : 10);
// Э3: платформенный админ-API (/api/admin/*). Строгий лимит: узкий, чувствительный
// контур (выпуск/отзыв кодов, обработка заявок). В test потолок поднят, чтобы фикстуры
// не упирались в лимит; в проде ~100 запросов на окно.
const ADMIN_MAX = intFromEnv('RATE_LIMIT_ADMIN_MAX', isTest ? 1_000_000 : 100);

// express-rate-limit v7 отдаёт управление в handler при превышении лимита. Пробрасываем
// AppError в общий errorHandler, чтобы тело ответа было в формате проекта ({ error }).
function makeHandler(message) {
  return (req, res, next) => next(new AppError(message, 429, 'rate_limited'));
}

// Общий лимитер: защита от «шумных» клиентов на весь /api. Express 5 совместим с v7.
export const generalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Слишком много запросов, попробуйте позже'),
});

// Строгий лимитер для аутентификации: узкое окно попыток входа/обновления токена.
export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Слишком много попыток входа, попробуйте позже'),
});

// Строгий лимитер активации лицензионного кода (Э2): прикрывает перебор кодов.
export const activateCodeLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: ACTIVATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Слишком много попыток активации, попробуйте позже'),
});

// Строгий лимитер платформенного админ-API (Э3): весь /api/admin/* за requireAuth +
// requirePlatformAdmin. Ограничивает частоту выпуска/отзыва кодов и обработки заявок.
export const adminLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: ADMIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Слишком много запросов, попробуйте позже'),
});
