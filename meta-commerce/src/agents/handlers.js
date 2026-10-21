// Ejecutores de tareas por agente. Lo que corresponde a etapas futuras se marca "no_disponible"
// con explicación (nunca se simula un resultado).
import { definitionOf, STAGE_NOTE } from './definitions.js';
import { parseInstruction, selectProducts, buildPlan } from './director.js';
import { importCatalog } from '../connectors/sanou/importer.js';
import { MetaGraphClient } from '../connectors/meta/graph-client.js';
import { itemsBatchAvailability } from '../connectors/meta/catalog.js';
import { transitionListing, channelOfAccount } from '../services/listings.js';
import { enqueueTask } from '../services/tasks.js';
import { DomainError } from '../core/util.js';

export function createHandlers({ cfg }) {
  return {
    'MarketplaceAgent:catalog.sync': async ({ db, inventory, log }) => {
      const r = await importCatalog({ db, inventory, cfg, actor: 'agent:MarketplaceAgent', log: m => log.push(m) });
      return { status: 'completada', result: r };
    },

    'MarketplaceAgent:inventory.review': async ({ db }) => {
      const inv = await db.find('inventory');
      const count = k => inv.filter(i => i.availability === k).length;
      return { status: 'completada', result: { in_stock: count('in_stock'), low_stock: count('low_stock'), out_of_stock: count('out_of_stock'), unknown: count('unknown'), units_tracked: inv.filter(i => i.tracking_mode === 'units').length } };
    },

    // Desactivación/reactivación por API oficial (catálogo de Meta). Solo marca "desactivado" si Meta confirma.
    'MarketplaceAgent:channel.set_availability': async ({ db, task, log }) => {
      const { listing_id, availability } = task.input;
      const l = await db.get('marketplace_listings', listing_id);
      if (!l) throw new DomainError('no_encontrado', 'Publicación inexistente');
      const { channel, account } = await channelOfAccount(db, l.channel_account_id);
      if (channel.kind !== 'meta_catalog') return { status: 'no_disponible', result: { reason: `El canal ${channel.kind} no admite cambios por API` } };
      if (!cfg.meta.writeEnabled || !cfg.meta.systemUserToken || !account.external_id) {
        log.push('Escritura a Meta deshabilitada o sin credenciales: queda como tarea pendiente, sin acción externa.');
        return { status: 'no_disponible', result: { reason: 'Integración con el catálogo de Meta no habilitada (ver Configuración). La publicación sigue "pendiente de desactivación".' } };
      }
      const client = new MetaGraphClient(cfg.meta);
      const body = itemsBatchAvailability([{ retailerId: l.external_id, availability }]);
      const resp = await client.call('POST', `${account.external_id}/items_batch`, { token: cfg.meta.systemUserToken, body });
      log.push(`items_batch enviado, handle=${(resp.handles || []).join(',')}`);
      // items_batch es asíncrono: se confirma consultando check_batch_request_status antes de marcar "desactivado".
      const handle = (resp.handles || [])[0];
      if (!handle) return { status: 'fallida', error: 'Meta no devolvió handle del lote' };
      const st = await client.call('GET', `${account.external_id}/check_batch_request_status`, { token: cfg.meta.systemUserToken, params: { handle }, write: false });
      const done = (st.data || [])[0];
      if (done?.status === 'finished' && !(done.errors || []).length) {
        if (availability === 'out of stock' && l.status === 'pendiente_desactivacion')
          await transitionListing(db, l.id, 'desactivado', { actor: 'agent:MarketplaceAgent', reason: 'sin_stock (confirmado por Meta)', confirmed: true });
        return { status: 'completada', result: { handle, confirmed: true } };
      }
      throw Object.assign(new Error(`Lote aún no confirmado (${done?.status || 'desconocido'})`), { retryable: true });
    },

    'FacebookDirectorAgent:director.plan': async ({ db, task }) => {
      const instruction = String(task.input.instruction || '').slice(0, 2000);
      const parsed = parseInstruction(instruction);
      const [products, variants, inv] = await Promise.all([db.find('products', { status: 'active' }), db.find('product_variants', { is_default: true }), db.find('inventory')]);
      const sel = selectProducts(parsed, products, new Map(inv.map(i => [i.variant_id, i])), new Map(variants.map(v => [v.product_id, v.id])));
      const plan = buildPlan(instruction, parsed, sel);
      const children = [];
      for (const st of plan.subtasks) {
        const { task: child } = await enqueueTask(db, { ...st, parent_task_id: task.id, correlation_id: task.correlation_id, requested_by: 'agent:FacebookDirectorAgent', idempotency_key: `${task.id}:${st.agent}:${st.type}` });
        children.push({ id: child.id, agent: child.agent, type: child.type });
      }
      return { status: 'completada', result: { ...plan, children } };
    },

    'FacebookDirectorAgent:report.inventory': async ({ db }) => {
      const [products, inv, alerts, listings] = await Promise.all([db.find('products', { status: 'active' }), db.find('inventory'), db.find('alerts', { status: 'abierta' }), db.find('marketplace_listings')]);
      return { status: 'completada', result: { productos: products.length, agotados: inv.filter(i => i.availability === 'out_of_stock').length,
        alertas_abiertas: alerts.length, publicaciones_pendientes_de_baja: listings.filter(l => l.status === 'pendiente_desactivacion').length } };
    },
  };
}

export function resolveHandler(handlers, task) {
  const h = handlers[`${task.agent}:${task.type}`];
  if (h) return h;
  const def = definitionOf(task.agent);
  return async () => ({ status: 'no_disponible', result: { reason: `"${task.type}" se implementa en la ${STAGE_NOTE[def?.stage] || 'próxima etapa'}. La tarea quedó registrada para trazabilidad.` } });
}
