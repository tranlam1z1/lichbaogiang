import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { loadUser } from './middleware/auth.js';
import { errorHandler, notFound, requireJsonForWrites } from './middleware/errors.js';
import { adminRouter } from './routes/admin/index.js';
import { authRouter } from './routes/auth.js';
import { exportsRouter } from './routes/exports.js';
import { settingsRouter } from './routes/settings.js';
import { topupsRouter } from './routes/topups.js';
import { webhooksRouter } from './routes/webhooks.js';

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'https://img.vietqr.io'],
          // Chỉ ép HTTPS khi thật sự chạy HTTPS, nếu không bản chạy thử qua http sẽ không tải được JS/CSS.
          'upgrade-insecure-requests': config.cookie.secure ? [] : null,
        },
      },
    }),
  );
  if (config.clientOrigins.length) {
    app.use('/api', cors({ origin: config.clientOrigins, credentials: true }));
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireJsonForWrites);
  api.use(loadUser);
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter);
  api.use('/settings', settingsRouter);
  api.use('/exports', exportsRouter);
  api.use('/topups', topupsRouter);
  api.use('/admin', adminRouter);
  api.use('/webhooks', webhooksRouter);
  api.use(notFound);
  app.use('/api', api);

  // Tùy chọn: phục vụ luôn bản build frontend để triển khai một cổng duy nhất.
  if (config.serveClient) {
    app.use(express.static(CLIENT_DIST, { index: false }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
