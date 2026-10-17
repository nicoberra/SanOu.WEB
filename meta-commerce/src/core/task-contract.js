// Contrato de tareas entre agentes (interno y con el orquestador de la agencia).
// Versión 1. Esquema JSON publicado en contracts/agent-task.v1.schema.json.
import { DomainError, uuid } from './util.js';

export const TASK_STATUS = ['pendiente', 'en_progreso', 'esperando_aprobacion', 'completada', 'fallida', 'cancelada', 'no_disponible'];
export const AGENTS = ['FacebookDirectorAgent', 'MarketplaceAgent', 'MetaAdsAgent', 'FacebookSalesAgent'];

export function validateTaskInput(t) {
  const err = m => { throw new DomainError('tarea_invalida', m); };
  if (!t || typeof t !== 'object') err('La tarea debe ser un objeto');
  if (!AGENTS.includes(t.agent)) err(`Agente desconocido: ${t.agent}`);
  if (typeof t.type !== 'string' || !/^[a-z_]+\.[a-z_]+$/.test(t.type)) err('type debe tener la forma "dominio.accion"');
  if (t.priority !== undefined && !(Number.isInteger(t.priority) && t.priority >= 1 && t.priority <= 5)) err('priority debe ser 1..5');
  if (t.input !== undefined && (typeof t.input !== 'object' || Array.isArray(t.input))) err('input debe ser un objeto');
  if (t.idempotency_key !== undefined && (typeof t.idempotency_key !== 'string' || t.idempotency_key.length > 200)) err('idempotency_key inválida');
  if (t.callback_url !== undefined && !/^https:\/\//.test(t.callback_url)) err('callback_url debe ser https');
  return {
    agent: t.agent, type: t.type, priority: t.priority ?? 3, input: t.input ?? {},
    idempotency_key: t.idempotency_key ?? null, parent_task_id: t.parent_task_id ?? null,
    correlation_id: t.correlation_id ?? uuid(), callback_url: t.callback_url ?? null,
    source_system: t.source_system ?? 'meta-commerce', requested_by: t.requested_by ?? 'system',
  };
}

// Representación pública de una tarea (lo que recibe la agencia).
export function toEnvelope(task, executions = []) {
  return {
    contract: 'agent-task/v1',
    id: task.id, organization_id: task.organization_id, correlation_id: task.correlation_id,
    parent_task_id: task.parent_task_id, idempotency_key: task.idempotency_key,
    agent: task.agent, type: task.type, priority: task.priority, input: task.input,
    status: task.status, result: task.result ?? null, requires_approval: task.requires_approval,
    created_at: task.created_at, updated_at: task.updated_at, completed_at: task.completed_at ?? null,
    error: task.last_error ?? null,
    execution_log: executions.map(e => ({ attempt: e.attempt, status: e.status, started_at: e.started_at, finished_at: e.finished_at, log: e.log })),
  };
}
