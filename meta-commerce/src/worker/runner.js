// Worker: procesa la cola de tareas y programa sincronizaciones. Corre como servicio propio
// (no necesita Claude Code abierto). Varios workers pueden convivir: la toma de tareas es atómica.
import { claimNextTask, finishTask, releaseStaleTasks, enqueueTask } from '../services/tasks.js';
import { resolveHandler } from '../agents/handlers.js';
import { now } from '../core/util.js';

export async function runOneTask(rt) {
  await releaseStaleTasks(rt.store);
  const task = await claimNextTask(rt.store);
  if (!task) return null;
  const { db, inventory } = rt.forOrg(task.organization_id);
  const startedAt = now(), log = [];
  try {
    const h = resolveHandler(rt.handlers, task);
    const out = await h({ db, inventory, task, log, rt });
    const fin = await finishTask(db, task, { ...out, log, startedAt, error: out.error || null });
    await notifyCallback(rt, fin);
    return fin;
  } catch (e) {
    log.push(`Error: ${e.message}`);
    const fin = await finishTask(db, task, { status: 'fallida', error: e.message, log, startedAt });
    if (fin.status !== 'pendiente') await notifyCallback(rt, fin);
    return fin;
  }
}

// Programa la sincronización periódica de catálogo de cada empresa (idempotente por franja horaria).
export async function scheduleSyncs(rt) {
  const orgs = await rt.store.find('organizations');
  for (const org of orgs) {
    const every = org.settings?.sync?.catalog_every_min || rt.cfg.sync.catalogEveryMin;
    const bucket = Math.floor(Date.now() / (every * 60e3));
    await enqueueTask(rt.forOrg(org.id).db, { agent: 'MarketplaceAgent', type: 'catalog.sync', priority: 2, requested_by: 'system:scheduler', source_system: 'scheduler', idempotency_key: `catalog.sync:${bucket}` });
  }
}

// Avisa al orquestador de la agencia cuando termina una tarea suya (firma HMAC).
async function notifyCallback(rt, task) {
  if (!task?.callback_url || !rt.cfg.agency.sharedSecret) return;
  try {
    const { signBody } = await import('../server/agency-auth.js');
    const { toEnvelope } = await import('../core/task-contract.js');
    const body = JSON.stringify(toEnvelope(task));
    const ts = String(Math.floor(Date.now() / 1000));
    await fetch(task.callback_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agency-Timestamp': ts, 'X-Agency-Signature': signBody(rt.cfg.agency.sharedSecret, ts, body) }, body, signal: AbortSignal.timeout(10000) });
  } catch (e) { console.warn('callback de agencia falló:', e.message); }
}

export function startWorker(rt, { pollMs = 3000, onError = e => console.error('[worker]', e) } = {}) {
  let stopped = false, lastSchedule = 0;
  const loop = async () => {
    while (!stopped) {
      try {
        if (Date.now() - lastSchedule > 60e3) { await scheduleSyncs(rt); lastSchedule = Date.now(); }
        let n = 0; while (n++ < 20 && await runOneTask(rt)) { /* procesa en tanda */ }
      } catch (e) { onError(e); }
      await new Promise(r => setTimeout(r, pollMs));
    }
  };
  loop();
  return () => { stopped = true; };
}
