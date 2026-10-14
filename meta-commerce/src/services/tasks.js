// Cola de tareas de agentes. Contrato agent-task/v1 (src/core/task-contract.js).
// Idempotencia por (organization_id, idempotency_key). Reintentos con backoff exponencial.
import { now, DomainError } from '../core/util.js';
import { validateTaskInput } from '../core/task-contract.js';
import { audit } from './audit.js';

export async function enqueueTask(db, raw) {
  const t = validateTaskInput(raw);
  if (t.idempotency_key) {
    const existing = await db.findOne('agent_tasks', { idempotency_key: t.idempotency_key });
    if (existing) return { task: existing, duplicate: true };
  }
  const task = await db.insert('agent_tasks', { ...t, status: 'pendiente', result: null, requires_approval: false,
    attempts: 0, max_attempts: raw.max_attempts ?? 3, run_after: raw.run_after ?? now(), locked_until: null, last_error: null, updated_at: now(), completed_at: null });
  await audit(db, t.requested_by, 'task.enqueue', 'agent_tasks', task.id, { agent: t.agent, type: t.type });
  return { task, duplicate: false };
}

// Toma la próxima tarea lista. updateWhere garantiza que dos workers no tomen la misma.
export async function claimNextTask(store) {
  const ready = (await store.find('agent_tasks', { status: 'pendiente', run_after: { lte: now() } }, { order: 'priority.asc', limit: 10 }));
  for (const t of ready) {
    const lockedUntil = new Date(Date.now() + 5 * 60e3).toISOString();
    const got = await store.updateWhere('agent_tasks', { id: t.id, status: 'pendiente' }, { status: 'en_progreso', locked_until: lockedUntil, attempts: t.attempts + 1 });
    if (got.length) return got[0];
  }
  return null;
}

// Tareas que quedaron "en progreso" porque un worker se cayó: vuelven a la cola.
export async function releaseStaleTasks(store) {
  const stale = await store.find('agent_tasks', { status: 'en_progreso', locked_until: { lte: now() } });
  for (const t of stale) await store.updateWhere('agent_tasks', { id: t.id, status: 'en_progreso' }, { status: 'pendiente', locked_until: null });
  return stale.length;
}

export async function finishTask(db, task, { status, result = null, error = null, log = [], aiProvider = null, aiCostUsd = 0, startedAt }) {
  await db.insert('agent_executions', { task_id: task.id, attempt: task.attempts, status: status === 'fallida' || error ? 'error' : 'ok', log, ai_provider: aiProvider, ai_cost_usd: aiCostUsd, started_at: startedAt, finished_at: now() });
  if (error && task.attempts < task.max_attempts && status !== 'no_disponible') {
    const backoffMs = Math.min(2 ** task.attempts * 30e3, 30 * 60e3);   // 1 min, 2 min, 4 min… máx 30
    return db.update('agent_tasks', task.id, { status: 'pendiente', last_error: error, locked_until: null, run_after: new Date(Date.now() + backoffMs).toISOString() });
  }
  const final = error ? 'fallida' : status;
  const r = await db.update('agent_tasks', task.id, { status: final, result, last_error: error, locked_until: null, completed_at: ['completada', 'fallida', 'cancelada', 'no_disponible'].includes(final) ? now() : null });
  if (final === 'fallida') await db.insert('alerts', { kind: 'tarea_fallida', severity: 'warning', status: 'abierta', title: `Falló la tarea ${task.type} (${task.agent})`, details: { task_id: task.id, error } });
  return r;
}

export async function cancelTask(db, id, actor) {
  const t = await db.get('agent_tasks', id);
  if (!t) throw new DomainError('no_encontrado', 'Tarea inexistente', 404);
  if (!['pendiente', 'esperando_aprobacion'].includes(t.status)) throw new DomainError('no_cancelable', `No se puede cancelar una tarea ${t.status}`, 409);
  await audit(db, actor, 'task.cancel', 'agent_tasks', id, {});
  return db.update('agent_tasks', id, { status: 'cancelada', completed_at: now() });
}
