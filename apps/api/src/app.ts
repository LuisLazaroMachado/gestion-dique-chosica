import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { structureRoutes } from './routes/structures.js';
import { assignmentRoutes } from './routes/assignments.js';
import { inspectionRoutes } from './routes/inspections.js';
import { evidenceRoutes } from './routes/evidence.js';
import { priorityRoutes } from './routes/priorities.js';
import { operationsRoutes } from './routes/operations.js';
import { adminRoutes } from './routes/admin.js';
import { overviewRoutes } from './routes/overview.js';
import { sql } from './db.js';

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 2 * 1024 * 1024, trustProxy: true });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Apps nativas no envían Origin; la web debe estar en la lista permitida.
      if (!origin || config.corsOrigin.includes('*') || config.corsOrigin.includes(origin)) cb(null, true);
      else cb(new Error('Origen no permitido'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.message, details: err.details });
    }
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505') return reply.code(409).send({ error: 'Registro duplicado' });
    if (pgCode === '23514' || pgCode === '22P02' || pgCode === '23503') {
      return reply.code(400).send({ error: 'Datos no válidos para la base de datos', details: err.message });
    }
    if ((err as FastifyError).statusCode && (err as FastifyError).statusCode! < 500) {
      return reply.code((err as FastifyError).statusCode!).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'Error interno del servidor' });
  });

  app.get('/health', async () => {
    await sql`SELECT 1`;
    return { ok: true, service: 'priori-dique-chosica-api', time: new Date().toISOString() };
  });

  await app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(structureRoutes);
    await api.register(assignmentRoutes);
    await api.register(inspectionRoutes);
    await api.register(evidenceRoutes);
    await api.register(priorityRoutes);
    await api.register(operationsRoutes);
    await api.register(adminRoutes);
    await api.register(overviewRoutes);
  }, { prefix: '/api/v1' });

  return app;
}
