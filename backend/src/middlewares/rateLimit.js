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
