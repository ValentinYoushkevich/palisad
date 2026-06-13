import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import * as subscriptionController from '@/controllers/subscription.controller.js';
import errorHandler from '@/middlewares/errorHandler.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import activityLogRouter from '@/routes/activityLog.router.js';
import authRouter from '@/routes/auth.router.js';
import dictionaryRouter from '@/routes/dictionary.router.js';
import healthRouter from '@/routes/health.router.js';
import labelsRouter from '@/routes/labels.router.js';
import locationRouter from '@/routes/location.router.js';
import movementRouter from '@/routes/movement.router.js';
import nurseryRouter from '@/routes/nursery.router.js';
import operationRouter from '@/routes/operation.router.js';
import plantRouter from '@/routes/plant.router.js';
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
  app.use(morgan('dev'));
}
app.use(express.json());
app.use(cookieParser());

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/nurseries', nurseryRouter);
app.use('/api/nurseries/:nurseryId/users', staffRouter);
app.use('/api/nurseries/:nurseryId/locations', locationRouter);
app.use('/api/nurseries/:nurseryId/plants', plantRouter);
app.use('/api/nurseries/:nurseryId/plants', labelsRouter);
app.use('/api/nurseries/:nurseryId/plants/:plantId/operations', operationRouter);
app.use('/api/nurseries/:nurseryId/plants/:plantId/movements', movementRouter);
app.use('/api/nurseries/:nurseryId/activity', activityLogRouter);
app.use('/api/nurseries/:nurseryId', dictionaryRouter);
app.use('/api/subscriptions', subscriptionRouter);
app.get('/api/plans', requireAuth, subscriptionController.getPlans);

app.use(errorHandler);

export default app;
