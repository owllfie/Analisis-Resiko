import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { pool, waitForDatabase } from './config/db.js';
import { runMigrations } from './db/migrate.js';
import { seed, bootstrapAdmin } from './db/seed.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import activityRoutes from './routes/activity.js';
import riskModelRoutes from './routes/riskModel.js';
import trashRoutes from './routes/trash.js';
import historyRoutes from './routes/history.js';
import permissionRoutes from './routes/permissions.js';
import { refreshPermissions } from './services/permissions.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/risk-model', riskModelRoutes);
  app.use('/api/trash', trashRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/permissions', permissionRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function start() {
  await waitForDatabase();
  await runMigrations();
  if (config.seedDemo) {
    await seed();
  } else {
    await bootstrapAdmin();
  }

  const app = createApp();
  await refreshPermissions();
  app.listen(config.port, () => {
    console.log(`[server] berjalan di port ${config.port} (env: ${config.nodeEnv})`);
  });
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  start().catch((err) => {
    console.error('[server] gagal start:', err.message);
    process.exit(1);
  });
}

export { start, pool };
