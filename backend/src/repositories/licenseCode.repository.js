import db from '@/config/knex.js';

export function create(data, executor = db) {
  return executor('license_codes')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function findByCode(code, executor = db) {
  return executor('license_codes').where({ code }).first();
}

export function findById(id, executor = db) {
  return executor('license_codes').where({ id }).first();
}

// Атомарная активация: issued → activated одним UPDATE ... WHERE status = 'issued'.
// Возвращает undefined, если затронуто 0 строк (код не найден / уже активирован / отозван).
// Это ядро защиты от гонки двойной активации (используется на Э2).
export function activateByCode({ code, accountId }, executor = db) {
  return executor('license_codes')
    .where({ code, status: 'issued' })
    .update({
      status: 'activated',
      activated_by_account_id: accountId,
      activated_at: executor.fn.now(),
      updated_at: executor.fn.now(),
    })
    .returning('*')
    .then((rows) => rows[0]);
}

export function listByStatus({ status, limit, offset }, executor = db) {
  const query = executor('license_codes').orderBy('created_at', 'desc');
  if (status) {
    query.where({ status });
  }
  if (limit !== undefined) {
    query.limit(limit);
  }
  if (offset !== undefined) {
    query.offset(offset);
  }
  return query;
}

export function countByStatus({ status }, executor = db) {
  const query = executor('license_codes');
  if (status) {
    query.where({ status });
  }
  return query.count('id as count').then((rows) => Number(rows[0].count));
}

// Э3 (админ-список): как listByStatus, но с email аккаунта, активировавшего код
// (leftJoin — для issued/revoked activated_by_account_id NULL → email NULL).
export function listDetailedByStatus({ status, limit, offset }, executor = db) {
  const query = executor('license_codes')
    .leftJoin('accounts as activator', 'license_codes.activated_by_account_id', 'activator.id')
    .select('license_codes.*', 'activator.email as activated_by_email')
    .orderBy('license_codes.created_at', 'desc');
  if (status) {
    query.where('license_codes.status', status);
  }
  if (limit !== undefined) {
    query.limit(limit);
  }
  if (offset !== undefined) {
    query.offset(offset);
  }
  return query;
}

// Отзыв возможен только из issued (activated/revoked не трогаем). undefined — если 0 строк.
export function revokeById(id, executor = db) {
  return executor('license_codes')
    .where({ id, status: 'issued' })
    .update({ status: 'revoked', updated_at: executor.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
