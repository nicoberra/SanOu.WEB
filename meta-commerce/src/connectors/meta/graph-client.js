// Cliente mínimo de la Graph API OFICIAL de Meta (graph.facebook.com/<versión>).
// Seguridad:
//  - Escrituras bloqueadas salvo META_WRITE_ENABLED=true (por defecto false).
//  - El token nunca se registra en logs; se manda en el header Authorization.
//  - appsecret_proof (HMAC del token con el app secret) cuando hay app secret.
//  - Respeta límites: ante códigos de rate limit (4, 17, 32, 613, 80000-80014) se lanza un error reintentable.
import crypto from 'node:crypto';
import { DomainError } from '../../core/util.js';

const RATE_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

export class MetaGraphClient {
  constructor(meta, { fetchImpl = fetch } = {}) { this.meta = meta; this.fetch = fetchImpl; }

  async call(method, path, { token, params = {}, body, write = method !== 'GET' } = {}) {
    if (write && !this.meta.writeEnabled) throw new DomainError('escritura_deshabilitada', 'Escrituras a Meta deshabilitadas (META_WRITE_ENABLED=false). No se ejecutó ninguna acción externa.', 412);
    if (!token) throw new DomainError('sin_credenciales', 'Falta el token de Meta para esta operación', 412);
    const url = new URL(`https://graph.facebook.com/${this.meta.graphVersion}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (this.meta.appSecret) url.searchParams.set('appsecret_proof', crypto.createHmac('sha256', this.meta.appSecret).update(token).digest('hex'));
    const res = await this.fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const code = data.error?.code;
      const err = new DomainError(RATE_CODES.has(code) ? 'meta_rate_limit' : 'meta_error', `Meta: ${data.error?.message || res.status} (código ${code ?? '-'})`, 502);
      err.retryable = RATE_CODES.has(code) || res.status >= 500;
      throw err;
    }
    return data;
  }
}

// Verificación de firma de webhooks de Meta (X-Hub-Signature-256 = sha256=HMAC(app_secret, body crudo)).
export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
