// Máquina de estados de las publicaciones (Marketplace y catálogos).
// Regla de oro: "publicado" y "desactivado" solo se registran con CONFIRMACIÓN
// (de la API oficial o del operador que lo hizo a mano). Nunca se asume.
import { DomainError } from './util.js';

export const S = Object.freeze({
  BORRADOR: 'borrador',
  PENDIENTE_APROBACION: 'pendiente_aprobacion',
  LISTO_PARA_PUBLICAR: 'listo_para_publicar',
  PUBLICADO: 'publicado',
  PENDIENTE_ACTUALIZACION: 'pendiente_actualizacion',
  PENDIENTE_DESACTIVACION: 'pendiente_desactivacion',
  DESACTIVADO: 'desactivado',
  ERROR: 'error',
});

export const LABELS = {
  borrador: 'Borrador', pendiente_aprobacion: 'Pendiente de aprobación', listo_para_publicar: 'Listo para publicar',
  publicado: 'Publicado', pendiente_actualizacion: 'Pendiente de actualización',
  pendiente_desactivacion: 'Pendiente de desactivación', desactivado: 'Desactivado', error: 'Error',
};

const T = {
  borrador: ['pendiente_aprobacion', 'error'],
  pendiente_aprobacion: ['listo_para_publicar', 'borrador', 'error'],
  listo_para_publicar: ['publicado', 'borrador', 'pendiente_aprobacion', 'error'],
  publicado: ['pendiente_actualizacion', 'pendiente_desactivacion', 'error'],
  pendiente_actualizacion: ['publicado', 'pendiente_desactivacion', 'error'],
  pendiente_desactivacion: ['desactivado', 'publicado', 'error'],
  desactivado: ['pendiente_aprobacion'],   // reactivar = volver a revisar y aprobar (nunca automático)
  error: ['borrador'],
};

// Transiciones que exigen confirmación explícita del resultado externo.
export const NEEDS_CONFIRMATION = new Set(['publicado', 'desactivado']);
// Estados "vivos" (cuentan para la regla de una publicación por variante y cuenta).
export const LIVE = new Set(Object.values(S).filter(s => s !== 'desactivado' && s !== 'error'));
// Estados en los que la publicación está (o puede estar) visible para compradores.
export const VISIBLE = new Set(['publicado', 'pendiente_actualizacion', 'pendiente_desactivacion']);

export function canTransition(from, to) { return (T[from] || []).includes(to); }

export function assertTransition(listing, to, { confirmed = false, inventory } = {}) {
  if (!canTransition(listing.status, to))
    throw new DomainError('transicion_invalida', `No se puede pasar de "${LABELS[listing.status]}" a "${LABELS[to]}"`);
  if (NEEDS_CONFIRMATION.has(to) && !confirmed)
    throw new DomainError('requiere_confirmacion', `"${LABELS[to]}" solo se registra con confirmación de la plataforma o del operador`);
  if ((to === 'listo_para_publicar' || to === 'publicado') && inventory && inventory.availability === 'out_of_stock')
    throw new DomainError('sin_stock', 'El producto está agotado: no se puede ofrecer a la venta');
  if (to === 'publicado' && listing.blocked_reason)
    throw new DomainError('bloqueada', `Publicación bloqueada: ${listing.blocked_reason}`);
}
