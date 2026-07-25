import { z } from 'zod';

export const changePlanSchema = z.object({
  planId: z.string().uuid(),
});

// Э2: активация кода. Нормализацию (регистр, дефисы, мусор) делает сервис —
// валидатор лишь гарантирует непустую строку разумной длины.
export const activateCodeSchema = z.object({
  code: z.string().min(1).max(64),
});
