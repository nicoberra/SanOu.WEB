import crypto from 'node:crypto';

export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

// JSON canónico (claves ordenadas): mismo contenido → mismo hash, sin importar el orden.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
export const hash = v => crypto.createHash('sha256').update(typeof v === 'string' ? v : canonical(v)).digest('hex');

export const slugify = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export class DomainError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
