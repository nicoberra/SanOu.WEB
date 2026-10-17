// Aprobaciones humanas. Se aprueba un payload EXACTO (hash): si el agente lo cambia después, la
// aprobación no sirve. Cada aprobación se consume una sola vez.
import { hash, now, DomainError } from '../core/util.js';
import { audit } from './audit.js';

export async function requestApproval(db, { action, payload, requestedBy, taskId = null, ttlDays = 7 }) {
  const payload_hash = hash(payload);
  const existing = await db.findOne('approvals', { action, payload_hash, status: 'pendiente' });
  if (existing) return existing;
  const a = await db.insert('approvals', { action, payload, payload_hash, requested_by: requestedBy, task_id: taskId,
    status: 'pendiente', expires_at: new Date(Date.now() + ttlDays * 864e5).toISOString() });
  await audit(db, requestedBy, 'approval.request', 'approvals', a.id, { action });
  return a;
}

export async function decideApproval(db, id, { approve, user, note = '' }) {
  const a = await db.get('approvals', id);
  if (!a) throw new DomainError('no_encontrado', 'Aprobación inexistente', 404);
  if (a.status !== 'pendiente') throw new DomainError('ya_decidida', `La aprobación ya está ${a.status}`, 409);
  if (new Date(a.expires_at) < new Date()) { await db.update('approvals', id, { status: 'vencida' }); throw new DomainError('vencida', 'La aprobación venció', 409); }
  const r = await db.update('approvals', id, { status: approve ? 'aprobada' : 'rechazada', decided_by: user, decided_at: now(), decision_note: note });
  await audit(db, user, approve ? 'approval.approve' : 'approval.reject', 'approvals', id, { action: a.action, note });
  return r;
}

// Verifica y consume una aprobación para ejecutar `action` con `payload`. Lanza si no corresponde.
export async function consumeApproval(db, { approvalId, action, payload, actor }) {
  const a = await db.get('approvals', approvalId);
  if (!a || a.action !== action) throw new DomainError('sin_aprobacion', 'No hay aprobación para esta acción', 403);
  if (a.status !== 'aprobada') throw new DomainError('sin_aprobacion', `Aprobación en estado ${a.status}`, 403);
  if (a.payload_hash !== hash(payload)) throw new DomainError('aprobacion_no_coincide', 'El contenido cambió después de aprobarse: hay que aprobar de nuevo', 403);
  if (new Date(a.expires_at) < new Date()) throw new DomainError('vencida', 'La aprobación venció', 403);
  await db.update('approvals', approvalId, { status: 'usada' });
  await audit(db, actor, 'approval.consume', 'approvals', approvalId, { action });
  return a;
}
