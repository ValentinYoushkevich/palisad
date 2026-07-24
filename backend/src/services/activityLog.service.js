import * as activityRepo from '@/repositories/activityLog.repository.js';
import { parsePagination } from '@/utils/validators/pagination.validators.js';

export async function getLogs(nurseryId, query) {
  const { userId, eventType, dateFrom, dateTo } = query;
  const filters = { userId, eventType, dateFrom, dateTo };
  // Валидируем/зажимаем пагинацию: perPage ограничен 100, кривые значения → дефолты (B21).
  const pagination = parsePagination(query);

  const [logs, total] = await Promise.all([
    activityRepo.findByNursery(nurseryId, filters, pagination),
    activityRepo.countByNursery(nurseryId, filters),
  ]);

  return { data: logs, total, page: pagination.page, perPage: pagination.perPage };
}
