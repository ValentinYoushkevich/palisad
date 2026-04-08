import db from '@/config/knex.js';
import logger from '@/config/logger.js';

export async function logActivity({
  nurseryId,
  userId,
  eventType,
  entityType,
  entityId,
  details,
}) {
  try {
    await db('activity_logs').insert({
      nursery_id: nurseryId,
      user_id: userId ?? null,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
  } catch (err) {
    logger.error('logActivity failed', { error: err.message, eventType, entityType });
  }
}
