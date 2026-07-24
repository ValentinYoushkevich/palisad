import { z } from 'zod';

// Пагинация уведомлений/журнала раньше шла через голый Number(page)/Number(perPage)
// без валидации: perPage=1000000 выгружал всю таблицу, page=abc → NaN → offset NaN → 500.
// Схема мягкая (clamp/дефолт), чтобы кривые query-параметры не роняли ответ (B21):
//   page    — целое >= 1, дефолт 1; мусор/недопустимое → 1;
//   perPage — целое, зажимается в диапазон 1..100, дефолт 20; мусор → 20.
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .catch(20)
    .transform((value) => Math.min(Math.max(value, 1), 100))
    .default(20),
});

export function parsePagination(query = {}) {
  return paginationSchema.parse({ page: query.page, perPage: query.perPage });
}
