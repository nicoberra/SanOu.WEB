// Publicaciones vinculadas al producto maestro. Precio y stock NUNCA se copian: se leen del maestro.
import { uuid, now, DomainError } from '../core/util.js';
import { assertTransition, LIVE, VISIBLE, LABELS } from '../core/listing-states.js';
import { capabilitiesFor } from '../connectors/meta/capabilities.js';
import { retailerId } from '../connectors/meta/catalog.js';
import { audit } from './audit.js';

export async function channelOfAccount(db, accountId) {
  const acc = await db.get('channel_accounts', accountId);
  if (!acc) throw new DomainError('no_encontrado', 'Cuenta de canal inexistente', 404);
  const ch = await db.get('sales_channels', acc.channel_id);
  return { account: acc, channel: ch, cap: capabilitiesFor(ch.kind) };
}

export async function accountForKind(db, kind) {
  const ch = await db.findOne('sales_channels', { kind });
  if (!ch) throw new DomainError('no_encontrado', `Canal ${kind} no configurado`, 404);
  const acc = await db.findOne('channel_accounts', { channel_id: ch.id, status: 'active' });
  if (!acc) throw new DomainError('no_encontrado', `Sin cuenta activa para ${kind}`, 404);
  return acc;
}

// Crea un BORRADOR. Política anti-duplicados: una sola publicación viva por variante y cuenta.
export async function createListing(db, { productId, accountId, actor, creativeId = null }) {
  const product = await db.get('products', productId);
  if (!product) throw new DomainError('no_encontrado', 'Producto inexistente', 404);
  if (product.status !== 'active') throw new DomainError('producto_inactivo', 'El producto no está activo en el sitio');
  const variant = await db.findOne('product_variants', { product_id: productId, is_default: true });
  const live = await db.find('marketplace_listings', { channel_account_id: accountId, variant_id: variant.id, status: { in: [...LIVE] } });
  if (live.length) throw new DomainError('duplicado', 'Ya existe una publicación viva de este producto en esta cuenta. Para probar otros enfoques usá variantes creativas, no copias del mismo artículo.', 409);
  const inv = await db.get('inventory', variant.id);
  const { channel } = await channelOfAccount(db, accountId);
  const org = await db.get('organizations', db.orgId);
  const l = await db.insert('marketplace_listings', {
    channel_account_id: accountId, product_id: productId, variant_id: variant.id, active_creative_id: creativeId,
    status: 'borrador', blocked_reason: inv?.availability === 'out_of_stock' ? 'sin_stock' : null,
    // En el catálogo de Meta el id del ítem lo definimos nosotros (mismo que en el feed).
    external_id: channel.kind === 'meta_catalog' ? retailerId(org.slug, product) : null, external_url: null, inquiries_count: 0, pending_actions: [], last_reviewed_at: null,
    published_at: null, created_by: actor, updated_at: now(),
  });
  await db.insert('listing_status_history', { listing_id: l.id, from_status: null, to_status: 'borrador', reason: 'creada', actor, confirmed: true });
  await audit(db, actor, 'listing.create', 'marketplace_listings', l.id, { product: product.name });
  return l;
}

export async function transitionListing(db, listingId, to, { actor, reason = null, confirmed = false, externalUrl, externalId }) {
  const l = await db.get('marketplace_listings', listingId);
  if (!l) throw new DomainError('no_encontrado', 'Publicación inexistente', 404);
  const inv = await db.get('inventory', l.variant_id);
  assertTransition(l, to, { confirmed, inventory: inv });
  const patch = { status: to, last_reviewed_at: now() };
  if (to === 'publicado') {
    if (externalUrl !== undefined) {
      if (externalUrl && !/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(externalUrl)) throw new DomainError('url_invalida', 'La URL debe ser de facebook.com');
      patch.external_url = externalUrl || null;
    }
    if (externalId !== undefined) patch.external_id = externalId;
    patch.published_at = l.published_at || now();
  }
  const r = await db.update('marketplace_listings', listingId, patch);
  await db.insert('listing_status_history', { listing_id: listingId, from_status: l.status, to_status: to, reason, actor, confirmed });
  await audit(db, actor, 'listing.transition', 'marketplace_listings', listingId, { from: l.status, to, reason, confirmed });
  return r;
}

export async function addPendingAction(db, listing, action) {
  const actions = (listing.pending_actions || []).filter(a => !(a.type === action.type && !a.done));
  actions.push({ id: uuid(), done: false, created_at: now(), ...action });
  return db.update('marketplace_listings', listing.id, { pending_actions: actions });
}

export async function completePendingAction(db, listingId, actionId, actor) {
  const l = await db.get('marketplace_listings', listingId);
  if (!l) throw new DomainError('no_encontrado', 'Publicación inexistente', 404);
  const actions = (l.pending_actions || []).map(a => a.id === actionId ? { ...a, done: true, done_at: now(), done_by: actor } : a);
  await audit(db, actor, 'listing.action_done', 'marketplace_listings', listingId, { actionId });
  return db.update('marketplace_listings', listingId, { pending_actions: actions });
}

// Lista enriquecida para el panel: precio/stock vienen del producto e inventario maestros.
export async function listingOverview(db, filter = {}) {
  const rows = await db.find('marketplace_listings', filter, { order: 'created_at.desc' });
  const out = [];
  for (const l of rows) {
    const [p, inv, { channel }] = await Promise.all([db.get('products', l.product_id), db.get('inventory', l.variant_id), channelOfAccount(db, l.channel_account_id)]);
    const creative = l.active_creative_id ? await db.get('listing_creatives', l.active_creative_id) : null;
    out.push({ ...l, status_label: LABELS[l.status], product_name: p?.name, sku: p?.sku, price: p?.price, currency: p?.currency,
      availability: inv?.availability, available_units: inv?.tracking_mode === 'units' ? inv.on_hand - inv.reserved : null,
      channel_kind: channel.kind, channel_name: channel.name, creative_angle: creative?.angle || null,
      visible: VISIBLE.has(l.status) });
  }
  return out;
}
