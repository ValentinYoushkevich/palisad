import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import errorHandler from '@/middlewares/errorHandler.js';
import { generalLimiter } from '@/middlewares/rateLimit.js';
import activityLogRouter from '@/routes/activityLog.router.js';
import adminRouter from '@/routes/admin.router.js';
import authRouter from '@/routes/auth.router.js';
import dictionaryRouter from '@/routes/dictionary.router.js';
import healthRouter from '@/routes/health.router.js';
import labelsRouter from '@/routes/labels.router.js';
import locationRouter from '@/routes/location.router.js';
import movementRouter from '@/routes/movement.router.js';
import notificationRouter from '@/routes/notification.router.js';
import nurseryRouter from '@/routes/nursery.router.js';
import operationRouter from '@/routes/operation.router.js';
import planRequestRouter from '@/routes/planRequest.router.js';
import plansRouter from '@/routes/plans.router.js';
import plantRouter from '@/routes/plant.router.js';
import reportRouter from '@/routes/report.router.js';
import staffRouter from '@/routes/staff.router.js';
import subscriptionRouter from '@/routes/subscription.router.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
if (process.env.NODE_ENV !== 'test') {
  // B29: в проде — стандартный combined (парсится агрегаторами), в dev — цветной dev.
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
app.use(express.json());
app.use(cookieParser());

// Общий rate limiting на весь /api (B14). Строгий authLimiter — в auth.router.js.
app.use('/api', generalLimiter);

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/nurseries', nurseryRouter);
app.use('/api/nurseries/:nurseryId/users', staffRouter);
app.use('/api/nurseries/:nurseryId/locations', locationRouter);
app.use('/api/nurseries/:nurseryId/plants', plantRouter);
app.use('/api/nurseries/:nurseryId/plants', labelsRouter);
app.use('/api/nurseries/:nurseryId/plants/:plantId/operations', operationRouter);
app.use('/api/nurseries/:nurseryId/plants/:plantId/movements', movementRouter);
app.use('/api/nurseries/:nurseryId/reports', reportRouter);
app.use('/api/nurseries/:nurseryId/activity', activityLogRouter);
app.use('/api/nurseries/:nurseryId/notifications', notificationRouter);
app.use('/api/nurseries/:nurseryId', dictionaryRouter);
app.use('/api/subscriptions', subscriptionRouter);
// Э4: owner-ручки лидов «хочу план» (создать заявку / мои заявки). Отдельный префикс,
// не пересекается с admin-роутером (/api/admin/plan-requests).
app.use('/api/plan-requests', planRequestRouter);
// Э3: платформенный админ-API (лицензии/заявки). Смонтирован ВНЕ nursery-скоупа —
// собственный requireAuth + requirePlatformAdmin + adminLimiter внутри роутера.
app.use('/api/admin', adminRouter);
// B33: алиас GET /api/plans вынесен из app.js в собственный роутер (был инлайн мимо роутеров).
app.use('/api/plans', plansRouter);

app.use(errorHandler);

export default app;
