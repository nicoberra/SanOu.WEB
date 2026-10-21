// Autenticación del panel.
//  - Modo local (STORE=file): un token de administrador (ADMIN_TOKEN) → rol owner en todas las empresas.
//  - Producción (STORE=supabase): JWT de Supabase Auth (HS256, SUPABASE_JWT_SECRET) + organization_users.
import crypto from 'node:crypto';
import { timingSafeEqualStr, DomainError } from '../core/util.js';

const b64url = s => Buffer.from(s, 'base64url');

export function verifyHs256(token, secret) {
  const [h, p, sig] = String(token).split('.');
  if (!h || !p || !sig) return null;
  const header = JSON.parse(b64url(h).toString());
  if (header.alg !== 'HS256') return null;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  if (!timingSafeEqualStr(sig, expected)) return null;
  const payload = JSON.parse(b64url(p).toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

const ROLE_RANK = { viewer: 1, operator: 2, admin: 3, owner: 4 };

export function createAuth(rt) {
  return async function authenticate(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!m) throw new DomainError('no_autenticado', 'Falta iniciar sesión', 401);
    const token = m[1];
    if (rt.cfg.store !== 'supabase') {
      if (!rt.cfg.adminToken || !timingSafeEqualStr(token, rt.cfg.adminToken)) throw new DomainError('no_autenticado', 'Token inválido', 401);
      return { id: 'admin-local', label: 'Administrador', roleIn: async () => 'owner' };
    }
    const claims = rt.cfg.supabase.jwtSecret && verifyHs256(token, rt.cfg.supabase.jwtSecret);
    if (!claims?.sub) throw new DomainError('no_autenticado', 'Sesión inválida o vencida', 401);
    return { id: claims.sub, label: claims.email || claims.sub,
      roleIn: async orgId => (await rt.store.findOne('organization_users', { organization_id: orgId, user_id: claims.sub }))?.role || null };
  };
}

export async function requireRole(user, orgId, min) {
  const role = await user.roleIn(orgId);
  if (!role) throw new DomainError('sin_acceso', 'No pertenecés a esta empresa', 403);
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw new DomainError('sin_permiso', `Requiere rol ${min}`, 403);
  return role;
}
