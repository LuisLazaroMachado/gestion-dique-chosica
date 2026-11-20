import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import type { Role } from '@dique/shared';
import { config } from './config.js';
import { sql, type Db } from './db.js';
import { forbidden, unauthorized } from './errors.js';

const secret = new TextEncoder().encode(config.jwtSecret);

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  canInspect: boolean;
  canViewAll: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const hashPassword = (pw: string) => hash(pw);
export const verifyPassword = (h: string, pw: string) => verify(h, pw);

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(config.tokenTtl)
    .sign(secret);
}

/** Token corto de un solo propósito (p. ej. subir una foto concreta). */
export async function signPurposeToken(purpose: string, subject: string, ttl = '15m'): Promise<string> {
  return new SignJWT({ typ: purpose }).setProtectedHeader({ alg: 'HS256' }).setSubject(subject)
    .setIssuedAt().setExpirationTime(ttl).sign(secret);
}

export async function verifyPurposeToken(token: string, purpose: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.typ !== purpose || !payload.sub) throw new Error();
    return payload.sub;
  } catch {
    throw unauthorized('Enlace de carga inválido o expirado');
  }
}

/** Valida el token y recarga el usuario desde la base: un usuario desactivado pierde acceso de inmediato. */
export async function authenticate(req: FastifyRequest): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let sub: string;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret);
    if (payload.typ !== 'access' || !payload.sub) throw new Error();
    sub = payload.sub;
  } catch {
    throw unauthorized();
  }
  const [u] = await sql`
    SELECT id, email, display_name, role, can_inspect, can_view_all, active FROM users WHERE id = ${sub}`;
  if (!u || !u.active) throw unauthorized('Usuario inexistente o desactivado');
  const user: AuthUser = {
    id: u.id, email: u.email, displayName: u.display_name, role: u.role,
    canInspect: u.can_inspect, canViewAll: u.can_view_all,
  };
  req.user = user;
  return user;
}

export function requireRole(user: AuthUser, ...roles: Role[]): void {
  if (!roles.includes(user.role)) throw forbidden();
}

/** ¿Puede el usuario ver/inspeccionar esta estructura? (inspector: solo asignadas o con excepción registrada) */
export async function canAccessStructure(db: Db, user: AuthUser, structureId: string): Promise<boolean> {
  if (user.role !== 'inspector' || user.canViewAll) return true;
  const [row] = await db`
    SELECT 1 FROM assignments
     WHERE structure_id = ${structureId} AND inspector_id = ${user.id} AND status IN ('asignada','en_curso')
    UNION ALL
    SELECT 1 FROM access_exceptions
     WHERE structure_id = ${structureId} AND user_id = ${user.id} AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1`;
  return Boolean(row);
}

export function canRegisterInspection(user: AuthUser): boolean {
  return user.role === 'inspector' || user.canInspect;
}
