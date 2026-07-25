import db from '@/config/knex.js';
import * as planRequestRepo from '@/repositories/planRequest.repository.js';
import { AppError } from '@/utils/AppError.js';
import { parsePagination } from '@/utils/validators/pagination.validators.js';

// Э3: постраничный список заявок на смену тарифа (для платформенного админа) с email
// аккаунта и инфо запрошенного плана. total — по тому же фильтру статуса.
// (Э4 до-расширит модуль owner-функциями создания/просмотра своих заявок.)
export async function listRequests({ status, page, perPage }) {
  const { page: p, perPage: pp } = parsePagination({ page, perPage });
  const [data, total] = await Promise.all([
    planRequestRepo.listDetailedByStatus({ status, limit: pp, offset: (p - 1) * pp }),
    planRequestRepo.countByStatus({ status }),
  ]);
  return { data, total, page: p, perPage: pp };
}

// Э3: обработка заявки. markProcessed атомарно переводит new → processed (UPDATE ...
// WHERE status='new'); undefined = 0 строк (не найдена / уже processed) → 409.
export async function processRequest(id) {
  const row = await planRequestRepo.markProcessed(id);
  if (!row) {
    throw new AppError('Заявку нельзя обработать (не найдена или уже обработана)', 409);
  }
  return row;
}

// Э4 (owner): создать заявку «хочу план». План должен существовать; дуп-гард не даёт
// двух ОТКРЫТЫХ (status='new') заявок аккаунта на один план (после обработки — можно снова).
export async function createRequest({ accountId, planId, comment }) {
  const plan = await db('plans').where({ id: planId }).first();
  if (!plan) {
    throw new AppError('План не найден', 404);
  }

  const open = await planRequestRepo.findOpenByAccountAndPlan({ accountId, planId });
  if (open) {
    throw new AppError('У вас уже есть открытая заявка на этот план', 409);
  }

  return planRequestRepo.create({
    account_id: accountId,
    plan_id: planId,
    comment: comment ?? null,
  });
}

// Э4 (owner): свои заявки со статусами и именем плана.
export function myRequests(accountId) {
  return planRequestRepo.findByAccountDetailed(accountId);
}
