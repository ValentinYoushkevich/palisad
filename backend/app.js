import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import errorHandler from '@/middlewares/errorHandler.js';
import authRouter from '@/routes/auth.router.js';
import healthRouter from '@/routes/health.router.js';
import nurseryRouter from '@/routes/nursery.router.js';
import staffRouter from '@/routes/staff.router.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/nurseries', nurseryRouter);
app.use('/api/nurseries/:nurseryId/users', staffRouter);

app.use(errorHandler);

export default app;
