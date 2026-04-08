import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .regex(/[A-Z]/, 'Нужна заглавная буква')
  .regex(/[a-z]/, 'Нужна строчная буква')
  .regex(/[0-9]/, 'Нужна цифра')
  .regex(/[^A-Za-z0-9]/, 'Нужен спецсимвол');

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
