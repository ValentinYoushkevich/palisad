import winston from 'winston';

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// B29: уровень по умолчанию info и в проде тоже (бизнес-события не теряются),
// переопределяется через LOG_LEVEL. В production пишем только в stdout —
// файлы logs/* внутри контейнера не персистентны и не ротируются, сбор логов
// делает платформа (docker logs / агрегатор). Файловые транспорты — только для dev.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  silent: isTest,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: isProduction
    ? [new winston.transports.Console()]
    : [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

export default logger;
