// Vistas de lectura para el panel (agregan producto + inventario + fotos + publicaciones).
import { availableUnits } from '../core/inventory-math.js';
import { CHANNEL_CAPABILITIES } from '../connectors/meta/capabilities.js';
import { AGENT_DEFINITIONS, STAGE_NOTE } from '../agents/definitions.js';
import { LIVE, VISIBLE } from '../core/listing-states.js';

export async function catalogView(db, q = {}) {
  const [products, variants, inv, media, listings] = await Promise.all([
    db.find('products', q.status ? { status: q.status } : {}), db.find('product_variants', { is_default: true }),
    db.find('inventory'), db.find('product_media'), db.find('marketplace_listings', { status: { in: [...LIVE] } })]);
  const vByP = new Map(variants.map(v => [v.product_id, v])), iByV = new Map(inv.map(i => [i.variant_id, i]));
  const mByP = new Map(); for (const m of media.sort((a, b) => a.position - b.position)) (mByP.get(m.product_id) || mByP.set(m.product_id, []).get(m.product_id)).push(m.url);
  const lByP = new Map(); for (const l of listings) lByP.set(l.product_id, (lByP.get(l.product_id) || 0) + 1);
  let rows = products.map(p => {
    const v = vByP.get(p.id), i = v ? iByV.get(v.id) : null;
    return { id: p.id, external_id: p.external_id, sku: p.sku, name: p.name, category: p.category, categories: p.categories,
      price: p.price, compare_at_price: p.compare_at_price, currency: p.currency, status: p.status, source_url: p.source_url,
      image: (mByP.get(p.id) || [])[0] || null, images: mByP.get(p.id)?.length || 0, specs_count: p.specs?.length || 0,
      featured: !!p.source_payload?.featured, variant_id: v?.id,
      availability: i?.availability || 'unknown', tracking_mode: i?.tracking_mode, on_hand: i?.on_hand ?? null, reserved: i?.reserved ?? 0,
      available_units: i ? availableUnits(i) : null, live_listings: lByP.get(p.id) || 0, last_synced_at: p.last_synced_at };
  });
  if (q.category) rows = rows.filter(r => r.categories?.includes(q.category) || r.category === q.category);
  if (q.availability) rows = rows.filter(r => r.availability === q.availability);
  if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter(r => r.name.toLowerCase().includes(s) || (r.sku || '').toLowerCase().includes(s)); }
  if (q.min) rows = rows.filter(r => r.price >= Number(q.min));
  if (q.max) rows = rows.filter(r => r.price != null && r.price <= Number(q.max));
  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function productDetail(db, id) {
  const p = await db.get('products', id);
  if (!p) return null;
  const v = await db.findOne('product_variants', { product_id: id, is_default: true });
  const [inv, media, movements, listings, alerts] = await Promise.all([
    db.get('inventory', v.id), db.find('product_media', { product_id: id }, { order: 'position.asc' }),
    db.find('inventory_movements', { variant_id: v.id }, { order: 'created_at.desc', limit: 30 }),
    db.find('marketplace_listings', { product_id: id }), db.find('alerts', { product_id: id }, { order: 'created_at.desc', limit: 20 })]);
  return { ...p, variant_id: v.id, inventory: { ...inv, available_units: availableUnits(inv) }, media: media.map(m => m.url), movements, listings, alerts };
}

export async function dashboardView(db) {
  const [products, inv, listings, alerts, tasks, approvals, runs, campaigns, convs] = await Promise.all([
    db.find('products'), db.find('inventory'), db.find('marketplace_listings'), db.find('alerts', { status: 'abierta' }, { order: 'created_at.desc' }),
    db.find('agent_tasks', {}, { order: 'created_at.desc', limit: 200 }), db.find('approvals', { status: 'pendiente' }),
    db.find('sync_runs', {}, { order: 'started_at.desc', limit: 1 }), db.find('ad_campaigns', { status: 'activa' }), db.find('conversations', { status: 'abierta' })]);
  const active = products.filter(p => p.status === 'active');
  const by = k => inv.filter(i => i.availability === k).length;
  const pendingActions = listings.reduce((n, l) => n + (l.pending_actions || []).filter(a => !a.done).length, 0);
  return {
    products: { imported: active.length, missing_in_source: products.length - active.length, without_price: active.filter(p => !(p.price > 0)).length },
    stock: { in_stock: by('in_stock'), low_stock: by('low_stock'), out_of_stock: by('out_of_stock'), unknown: by('unknown') },
    listings: { visible_known: listings.filter(l => VISIBLE.has(l.status)).length, pending: listings.filter(l => ['borrador', 'pendiente_aprobacion', 'listo_para_publicar', 'pendiente_actualizacion', 'pendiente_desactivacion'].includes(l.status)).length, pending_actions: pendingActions },
    alerts: { open: alerts.length, critical: alerts.filter(a => a.severity === 'critical').length, latest: alerts.slice(0, 8) },
    ads: { active_campaigns: campaigns.length, note: 'Etapa 4' },
    messages: { open_conversations: convs.length, note: 'Etapa 3' },
    tasks: { pending: tasks.filter(t => ['pendiente', 'en_progreso', 'esperando_aprobacion'].includes(t.status)).length, failed: tasks.filter(t => t.status === 'fallida').length },
    approvals: { pending: approvals.length },
    last_sync: runs[0] || null,
  };
}

export function agentsView(defs, tasks) {
  return AGENT_DEFINITIONS.map(a => {
    const mine = tasks.filter(t => t.agent === a.name);
    const def = defs.find(d => d.name === a.name) || {};
    return { ...a, enabled: def.enabled ?? true, stage_note: STAGE_NOTE[a.stage],
      tasks: { total: mine.length, pending: mine.filter(t => ['pendiente', 'en_progreso'].includes(t.status)).length,
        waiting_approval: mine.filter(t => t.status === 'esperando_aprobacion').length, failed: mine.filter(t => t.status === 'fallida').length },
      recent: mine.slice(0, 5).map(t => ({ id: t.id, type: t.type, status: t.status, created_at: t.created_at, error: t.last_error })) };
  });
}

export const channelsView = channels => channels.map(c => ({ ...c, ...CHANNEL_CAPABILITIES[c.kind] }));
