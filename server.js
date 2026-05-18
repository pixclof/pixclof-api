import 'dotenv/config';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import agentsRoutes from './routes/agents.js';
import heartbeatRoutes from './routes/heartbeat.js';
import { jwtAuthMiddleware } from './lib/auth.js';

const VERSION = '0.1.0';
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// --- CORS ---------------------------------------------------------------
await app.register(cors, {
  origin: (origin, cb) => {
    // Allow non-browser clients (curl, server-to-server) with no Origin header.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
});

// --- Rate limiting ------------------------------------------------------
// Global: 60 req/min per IP. Per-route overrides (e.g. heartbeat) are set
// in the individual route files via the `config.rateLimit` option.
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
});

// --- Global error handler -----------------------------------------------
// Normalizes every thrown/uncaught error into the API's { ok: false, ... }
// shape. 500s deliberately return a generic message — no stack-trace leak.
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, url: request.url }, 'Request error');

  const statusCode = error.statusCode || 500;

  // Fastify schema validation failures.
  if (error.validation) {
    return reply.status(400).send({
      ok: false,
      error: error.message || 'Validation failed',
      details: error.validation,
    });
  }

  reply.status(statusCode).send({
    ok: false,
    error: statusCode === 500 ? 'Internal server error' : error.message,
    statusCode,
  });
});

// --- Auth decorator -----------------------------------------------------
// Protected routes opt in via `{ preHandler: app.verifyJWT }` in their config
// (used by dashboard.js & agents.js).
app.decorate('verifyJWT', jwtAuthMiddleware);

// --- Routes -------------------------------------------------------------
await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(dashboardRoutes);
await app.register(agentsRoutes);
await app.register(heartbeatRoutes);

// --- Graceful shutdown --------------------------------------------------
const shutdown = async (signal) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- Start --------------------------------------------------------------
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 Pixclof API v${VERSION} listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
