// Cálculo de inventario (espejo exacto de apply_inventory_movement() en SQL).
// Un solo inventario por variante; las publicaciones solo LEEN este estado.
import { DomainError } from './util.js';

export const MOVEMENT_TYPES = ['source_sync', 'adjustment', 'reservation', 'reservation_release', 'sale', 'return', 'restock'];

export function availabilityOf(inv) {
  if (inv.source_in_stock === false) return 'out_of_stock';           // la web manda
  if (inv.tracking_mode === 'units') {
    const avail = inv.on_hand - inv.reserved;
    if (avail <= 0) return 'out_of_stock';
    return avail <= inv.low_stock_threshold ? 'low_stock' : 'in_stock';
  }
  if (inv.source_in_stock === true) return 'in_stock';
  return 'unknown';
}

export function availableUnits(inv) {
  return inv.tracking_mode === 'units' ? Math.max(inv.on_hand - inv.reserved, 0) : null;
}

// Devuelve el nuevo estado (no muta). Lanza DomainError si el movimiento es inválido.
// source_sync: { source_in_stock, units } — units = unidades informadas por la fuente (null si solo informa sí/no).
export function applyMovement(inv, { type, qty = 0, source_in_stock = null, units = null }) {
  if (!MOVEMENT_TYPES.includes(type)) throw new DomainError('movimiento_invalido', `Tipo de movimiento desconocido: ${type}`);
  if (!Number.isInteger(qty ?? 0)) throw new DomainError('movimiento_invalido', 'La cantidad debe ser un entero');
  const n = { ...inv };
  const q = Math.abs(qty || 0);
  switch (type) {
    case 'source_sync':
      n.source_in_stock = source_in_stock;
      if (Number.isInteger(units) && units >= 0) { n.tracking_mode = 'units'; n.on_hand = units; n.reserved = Math.min(n.reserved, units); }
      break;
    case 'adjustment': case 'restock':
      n.tracking_mode = 'units'; n.on_hand = (n.on_hand ?? 0) + (qty || 0); break;
    case 'return':
      n.tracking_mode = 'units'; n.on_hand = (n.on_hand ?? 0) + q; n.sold_total = Math.max(n.sold_total - q, 0); break;
    case 'reservation':
      if (n.tracking_mode !== 'units') throw new DomainError('requiere_unidades', 'Para reservar hay que cargar el stock en unidades');
      n.reserved += q; break;
    case 'reservation_release':
      n.reserved = Math.max(n.reserved - q, 0); break;
    case 'sale':
      if (n.tracking_mode !== 'units') throw new DomainError('requiere_unidades', 'Para registrar ventas hay que cargar el stock en unidades');
      n.on_hand -= q; n.reserved = Math.max(n.reserved - q, 0); n.sold_total += q; break;
  }
  if (n.on_hand !== null && n.on_hand !== undefined && n.on_hand < 0) throw new DomainError('stock_insuficiente', 'Stock insuficiente');
  if (n.on_hand !== null && n.on_hand !== undefined && n.reserved > n.on_hand) throw new DomainError('reserva_excedida', 'Las reservas superan el stock disponible');
  n.availability = availabilityOf(n);
  n.version = (n.version || 0) + 1;
  return n;
}
