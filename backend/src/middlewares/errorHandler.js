import logger from '@/config/logger.js';

export default function errorHandler(err, req, res, _next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({ error: message });
}
