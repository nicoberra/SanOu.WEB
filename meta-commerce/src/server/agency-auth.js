// Autenticación máquina-a-máquina con el orquestador de la agencia.
// Firma: HMAC-SHA256(secret, `${timestamp}.${body}`) en X-Agency-Signature (hex), X-Agency-Timestamp en segundos.
// Ventana anti-replay de 5 minutos.
import crypto from 'node:crypto';
import { timingSafeEqualStr } from '../core/util.js';

export const signBody = (secret, ts, body) => crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

export function verifyAgencyRequest(secret, headers, rawBody, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret) return { ok: false, error: 'Integración con la agencia no configurada (AGENCY_SHARED_SECRET)' };
  const ts = headers['x-agency-timestamp'], sig = headers['x-agency-signature'];
  if (!ts || !sig) return { ok: false, error: 'Faltan cabeceras de firma' };
  if (Math.abs(nowSec - Number(ts)) > 300) return { ok: false, error: 'Firma vencida' };
  return timingSafeEqualStr(sig, signBody(secret, ts, rawBody)) ? { ok: true } : { ok: false, error: 'Firma inválida' };
}
