// Control inteligente de stock. UN inventario por variante; todas las publicaciones leen de acá.
// Cuando el producto se agota:
//   1) se detecta (movimiento), 2) se marca agotado, 3) se bloquean propuestas de venta nuevas,
//   4) se identifican TODAS las publicaciones relacionadas, 5) en canales con API oficial se encola
//   la desactivación (se ejecuta solo con escritura habilitada y se confirma con la respuesta),
//   6) en Marketplace personal se crea una tarea manual, 7) se alerta al administrador.
// Nunca se marca "desactivado" sin confirmación. Al reponer, NO se reactiva nada solo: se pide revisión.
import { now, DomainError } from '../core/util.js';
import { LIVE, VISIBLE } from '../core/listing-states.js';
import { capabilitiesFor } from '../connectors/meta/capabilities.js';
import { transitionListing, addPendingAction, channelOfAccount } from './listings.js';
import { audit } from './audit.js';

const SELLABLE = new Set(['in_stock', 'low_stock']);

export class InventoryService {
  constructor(db, { enqueueTask } = {}) { this.db = db; this.enqueueTask = enqueueTask; }

  // Lectura desde la fuente (el sitio). Idempotente: si nada cambió, no registra movimiento.
  async syncFromSource({ variantId, productId, inStock, units = null, actor = 'system:sync' }) {
    const inv = await this.db.get('inventory', variantId);
    if (!inv) throw new DomainError('no_encontrado', 'Inventario inexistente', 404);
    const sameFlag = inv.source_in_stock === (inStock ?? null);
    const sameUnits = units === null || (inv.tracking_mode === 'units' && inv.on_hand === units);
    if (sameFlag && sameUnits) return null;
    return this.move({ variantId, productId, type: 'source_sync', sourceInStock: inStock ?? null, units, actor, reason: 'Sincronización con sanou.com.ar' });
  }

  async move({ variantId, productId, type, qty = 0, sourceInStock = null, units = null, reason = null, reference = null, idempotencyKey = null, actor }) {
    const res = await this.db.applyInventoryMovement({ variant_id: variantId, type, qty, source_in_stock: sourceInStock, units, reason, reference, idempotency_key: idempotencyKey, actor });
    if (res.duplicate) return res;
    if (!productId) productId = (await this.db.get('product_variants', variantId)).product_id;
    await this.onChange({ productId, variantId, before: res.before, after: res.state, actor });
    return res;
  }

  async onChange({ productId, variantId, before, after, actor }) {
    const product = await this.db.get('products', productId);
    const wasSellable = SELLABLE.has(before.availability);
    if (after.availability === 'out_of_stock' && before.availability !== 'out_of_stock') await this.onStockOut({ product, variantId, wasSellable, actor });
    else if (before.availability === 'out_of_stock' && SELLABLE.has(after.availability)) await this.onRestock({ product, variantId, actor });
    else if (after.availability === 'low_stock' && before.availability !== 'low_stock')
      await this.db.insert('alerts', { kind: 'stock_bajo', severity: 'warning', product_id: product.id, status: 'abierta',
        title: `Quedan pocas unidades de ${product.name}`, details: { disponibles: after.on_hand - after.reserved } });
  }

  async onStockOut({ product, variantId, wasSellable, actor }) {
    const listings = await this.db.find('marketplace_listings', { variant_id: variantId, status: { in: [...LIVE] } });
    const summary = { bajas_por_api: 0, tareas_manuales: 0, borradores_bloqueados: 0 };
    for (const l of listings) {
      const { cap, channel } = await channelOfAccount(this.db, l.channel_account_id);
      if (VISIBLE.has(l.status)) {
        let cur = l;
        if (l.status !== 'pendiente_desactivacion') cur = await transitionListing(this.db, l.id, 'pendiente_desactivacion', { actor, reason: 'sin_stock' });
        if (cap.deactivate === 'api' && this.enqueueTask) {
          await this.enqueueTask({ agent: 'MarketplaceAgent', type: 'channel.set_availability', priority: 1, requested_by: actor,
            idempotency_key: `set_availability:${l.id}:out_of_stock:${now().slice(0, 13)}`,
            input: { listing_id: l.id, availability: 'out of stock', channel_kind: channel.kind } });
          summary.bajas_por_api++;
        } else {
          await addPendingAction(this.db, cur, { type: 'desactivar_manual', title: `Desactivar en ${cap.label || channel.name}: ${product.name} está agotado`,
            instructions: 'Marcá la publicación como vendida/agotada o pausala desde Facebook y luego confirmá acá la desactivación.' });
          summary.tareas_manuales++;
        }
      } else {
        await this.db.update('marketplace_listings', l.id, { blocked_reason: 'sin_stock' });
        summary.borradores_bloqueados++;
      }
    }
    if (wasSellable || listings.length) {
      await this.db.insert('alerts', { kind: 'agotado', severity: listings.length ? 'critical' : 'warning', product_id: product.id, status: 'abierta',
        title: `${product.name} se agotó`, details: { publicaciones_afectadas: listings.length, ...summary } });
    }
    await audit(this.db, actor, 'inventory.stock_out', 'products', product.id, summary);
  }

  async onRestock({ product, variantId, actor }) {
    const listings = await this.db.find('marketplace_listings', { variant_id: variantId });
    let review = 0;
    for (const l of listings) {
      if (l.blocked_reason === 'sin_stock') await this.db.update('marketplace_listings', l.id, { blocked_reason: null });
      if (l.status === 'desactivado' || l.status === 'pendiente_desactivacion') {
        await addPendingAction(this.db, l, { type: 'revisar_reactivacion', title: `${product.name} volvió a tener stock: revisar si se reactiva`,
          instructions: 'La reactivación no es automática. Revisá precio y contenido y pasala a aprobación si corresponde.' });
        review++;
      }
    }
    await this.db.insert('alerts', { kind: 'repuesto', severity: 'info', product_id: product.id, status: 'abierta',
      title: `${product.name} volvió a tener stock`, details: { publicaciones_para_revisar: review } });
    await audit(this.db, actor, 'inventory.restock', 'products', product.id, { review });
  }
}
