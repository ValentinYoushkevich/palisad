import db from '@/config/knex.js';

export async function create({ nurseryId, userId, type, payload }) {
  const [row] = await db('notifications')
    .insert({
      nursery_id: nurseryId,
      user_id: userId,
      type,
      payload: payload ?? null,
    })
    .returning('*');
  return row;
}

export function findByUser(nurseryId, userId, filters = {}, pagination = {}) {
  const { page = 1, perPage = 20 } = pagination;
  const offset = (page - 1) * perPage;

  const query = db('notifications')
    .where({ nursery_id: nurseryId, user_id: userId })
    .orderBy('created_at', 'desc');

  if (filters.unread) {
    query.where({ is_read: false });
  }

  return query.limit(perPage).offset(offset);
}

export function countByUser(nurseryId, userId, filters = {}) {
  const query = db('notifications').where({ nursery_id: nurseryId, user_id: userId });

  if (filters.unread) {
    query.where({ is_read: false });
  }

  return query.count('id as count').then((rows) => Number(rows[0].count));
}

export function countUnread(nurseryId, userId) {
  return db('notifications')
    .where({ nursery_id: nurseryId, user_id: userId, is_read: false })
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

export function markRead(nurseryId, userId, id) {
  return db('notifications')
    .where({ id, nursery_id: nurseryId, user_id: userId })
    .update({ is_read: true });
}

export function markAllRead(nurseryId, userId) {
  return db('notifications')
    .where({ nursery_id: nurseryId, user_id: userId, is_read: false })
    .update({ is_read: true });
}
