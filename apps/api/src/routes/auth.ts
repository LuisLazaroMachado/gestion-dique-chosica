import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.js';
import { authenticate, signToken, verifyPassword } from '../auth.js';
import { audit } from '../audit.js';
import { unauthorized } from '../errors.js';
import { parse } from '../util.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const [u] = await sql`SELECT id, password_hash, active, display_name, role FROM users WHERE lower(email) = lower(${body.email})`;
    // Mensaje genérico: no revelar si el correo existe.
    if (!u || !u.active || !(await verifyPassword(u.password_hash, body.password))) {
      throw unauthorized('Correo o contraseña incorrectos');
    }
    await audit(sql, { actorId: u.id, action: 'iniciar_sesion', entityType: 'user', entityId: u.id });
    return { token: await signToken(u.id) };
  });

  app.get('/me', async (req) => {
    const user = await authenticate(req);
    return { user };
  });
}
