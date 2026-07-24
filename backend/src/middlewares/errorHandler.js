import logger from '@/config/logger.js';

export default function errorHandler(err, req, res, _next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  const dbMapped = mapDbError(err);
  const status = dbMapped?.status || err.status || 500;
  const errorCode = dbMapped?.errorCode || err.errorCode || null;

  // Наружу отдаём текст ошибки только для «ожидаемых» ответов (status < 500): это
  // AppError с осмысленным сообщением или замапленная ошибка БД. Для 5xx клиент получает
  // нейтральный текст — иначе утекали бы SQL-сообщения, имена таблиц и констрейнтов (B8).
  // Реальная причина всегда есть в логе выше.
  const safeMessage = dbMapped?.message || err.message || 'Internal Server Error';
  const message = status >= 500 ? 'Внутренняя ошибка сервера' : safeMessage;

  res.status(status).json({
    error: message,
    ...(errorCode ? { error_code: errorCode } : {})
  });
}

function mapDbError(err) {
  if (err?.code !== '23505') {
    return null;
  }

  const constraint = String(err?.constraint || '');
  const table = String(err?.table || '');

  if (constraint.includes('movement_types') && constraint.includes('slug')) {
    return {
      status: 409,
      errorCode: 'movement_type_slug_exists',
      message: 'Тип движения с таким slug уже существует в этом питомнике.'
    };
  }

  if (constraint.includes('species') && constraint.includes('gbif')) {
    return {
      status: 409,
      errorCode: 'species_gbif_exists',
      message: 'Вид с таким GBIF уже существует в этом питомнике.'
    };
  }

  if (constraint.includes('container_types') && constraint.includes('code')) {
    return {
      status: 409,
      errorCode: 'container_type_code_exists',
      message: 'Тип контейнера с таким кодом уже существует в этом питомнике.'
    };
  }

  if (table === 'tags') {
    return {
      status: 409,
      errorCode: 'tag_exists',
      message: 'Такой тег уже существует.'
    };
  }

  return {
    status: 409,
    errorCode: 'duplicate_value',
    message: 'Запись с таким значением уже существует.'
  };
}
