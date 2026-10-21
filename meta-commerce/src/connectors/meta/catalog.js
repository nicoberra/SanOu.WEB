// Catálogo de Meta (Commerce Manager) por vías OFICIALES:
//  A) Feed programado: Meta descarga periódicamente un CSV desde una URL nuestra. Es la opción más
//     simple y segura: la disponibilidad sale del inventario maestro, así un agotado se refleja solo.
//  B) Catalog Batch API: POST /{catalog_id}/items_batch (item_type=PRODUCT_ITEM) para cambios puntuales
//     (ej. marcar "out of stock" apenas se agota, sin esperar al próximo feed).
// Campos requeridos para anuncios de catálogo: id, title, description, availability, condition, price,
// link, image_link, brand. (Ver docs/META-APIS.md.)

const AVAIL = { in_stock: 'in stock', low_stock: 'in stock', out_of_stock: 'out of stock' };
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

export const FEED_COLUMNS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'additional_image_link', 'brand', 'mpn', 'product_type'];

// ID estable del ítem en el catálogo de Meta (prefijo = empresa, evita choques entre organizaciones).
export const retailerId = (prefix, product) => `${prefix}-${product.external_id}`;

// Devuelve { rows, excluded } — excluye (y explica) lo que no puede publicarse sin inventar datos.
export function buildFeedRows(items, { idPrefix }) {
  const rows = [], excluded = [];
  for (const { product: p, inventory: inv, media } of items) {
    if (p.status !== 'active') { excluded.push({ id: p.external_id, name: p.name, reason: 'no está activo en el sitio' }); continue; }
    if (!(p.price > 0)) { excluded.push({ id: p.external_id, name: p.name, reason: 'sin precio publicado en el sitio' }); continue; }
    if (!media.length) { excluded.push({ id: p.external_id, name: p.name, reason: 'sin fotos' }); continue; }
    const availability = AVAIL[inv?.availability];
    if (!availability) { excluded.push({ id: p.external_id, name: p.name, reason: 'stock desconocido' }); continue; }
    const specs = (p.specs || []).slice(0, 8).map(s => `${s.label}: ${s.value}`).join(' · ');
    const hasSale = p.compare_at_price > p.price;
    rows.push({
      id: retailerId(idPrefix, p), title: clip(p.name, 150),
      description: clip([p.description, specs].filter(Boolean).join(' — '), 5000),
      availability, condition: 'new',
      price: `${(hasSale ? p.compare_at_price : p.price).toFixed(2)} ${p.currency}`,
      sale_price: hasSale ? `${p.price.toFixed(2)} ${p.currency}` : '',
      link: p.source_url, image_link: media[0], additional_image_link: media.slice(1, 10).join(','),
      brand: p.brand || 'San Ou', mpn: p.sku || '', product_type: p.category || '',
    });
  }
  return { rows, excluded };
}

export function toCsv(rows) {
  return [FEED_COLUMNS.join(','), ...rows.map(r => FEED_COLUMNS.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
}

// Cuerpo para POST /{catalog_id}/items_batch (actualización de disponibilidad).
export function itemsBatchAvailability(updates) {
  return { item_type: 'PRODUCT_ITEM', requests: updates.map(u => ({ method: 'UPDATE', data: { id: u.retailerId, availability: u.availability } })) };
}
