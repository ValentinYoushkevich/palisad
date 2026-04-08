import db from '@/config/knex.js';

export function findByNursery(nurseryId, filters = {}, pagination = {}) {
  const { page = 1, perPage = 30 } = pagination;
  const offset = (page - 1) * perPage;

  const query = db('activity_logs')
    .where('activity_logs.nursery_id', nurseryId)
    .leftJoin('users', 'activity_logs.user_id', 'users.id')
    .select('activity_logs.*', 'users.name as user_name', 'users.role as user_role')
    .orderBy('activity_logs.created_at', 'desc');

  if (filters.userId) {
    query.where('activity_logs.user_id', filters.userId);
  }
  if (filters.eventType) {
    query.where('activity_logs.event_type', filters.eventType);
  }
  if (filters.dateFrom) {
    query.where('activity_logs.created_at', '>=', filters.dateFrom);
  }
  if (filters.dateTo) {
    query.where('activity_logs.created_at', '<=', filters.dateTo);
  }

  return query.limit(perPage).offset(offset);
}

export function countByNursery(nurseryId, filters = {}) {
  const query = db('activity_logs').where({ nursery_id: nurseryId });

  if (filters.userId) {
    query.where({ user_id: filters.userId });
  }
  if (filters.eventType) {
    query.where({ event_type: filters.eventType });
  }
  if (filters.dateFrom) {
    query.where('created_at', '>=', filters.dateFrom);
  }
  if (filters.dateTo) {
    query.where('created_at', '<=', filters.dateTo);
  }

  return query.count('id as count').then((rows) => Number(rows[0].count));
}

export function deleteOlderThan(date) {
  return db('activity_logs').where('created_at', '<', date).delete();
}
