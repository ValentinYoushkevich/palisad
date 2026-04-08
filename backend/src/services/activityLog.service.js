import * as activityRepo from '@/repositories/activityLog.repository.js';

export async function getLogs(nurseryId, query) {
  const { page = 1, perPage = 30, userId, eventType, dateFrom, dateTo } = query;
  const filters = { userId, eventType, dateFrom, dateTo };
  const pagination = { page: Number(page), perPage: Number(perPage) };

  const [logs, total] = await Promise.all([
    activityRepo.findByNursery(nurseryId, filters, pagination),
    activityRepo.countByNursery(nurseryId, filters),
  ]);

  return { data: logs, total, page: pagination.page, perPage: pagination.perPage };
}
