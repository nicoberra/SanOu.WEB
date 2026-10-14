// Importación / sincronización incremental e idempotente del catálogo San Ou.
// - Clave estable: (organization_id, source, external_id). Re-ejecutar no duplica nada.
// - content_hash: si la ficha no cambió, no se escribe (evita escrituras y ruido).
// - Productos que desaparecen del sitio → status 'missing_in_source' (no se borran: hay historial).
// - El stock entra por InventoryService (movimiento 'source_sync'), que dispara alertas y la cascada.
import fs from 'node:fs';
import path from 'node:path';
import { hash, now } from '../../core/util.js';
import { loadProductDefinitions, loadPriceSheet, normalizeProduct } from './source.js';

export const SOURCE = 'sanou_web';

export async function fetchSanouCatalog(cfg, { log = () => {} } = {}) {
  const defs = await loadProductDefinitions(cfg.sanou);
  log(`Fichas: ${defs.products.length} productos (${defs.origin})`);
  let prices = null, pricesError = null;
  if (cfg.sanou.pricesMode !== 'offline') {
    try { prices = await loadPriceSheet(cfg.sanou); log(`Precios/stock: ${prices.size} filas desde el backend`); }
    catch (e) { pricesError = e.message; log(`Precios/stock NO disponibles: ${e.message}`); }
  } else log('Precios/stock: modo offline (no se consulta la red)');
  const items = defs.products.map(p => normalizeProduct(p, {
    catNames: defs.catNames, siteUrl: cfg.sanou.siteUrl,
    priceRow: prices?.get(String(p.sheetName || p.name).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()),
  }));
  // Con el repo local a mano se verifica que cada foto exista (el sitio a veces referencia archivos que no están).
  const mediaMissing = [];
  if (cfg.sanou.localRepo) for (const it of items) {
    it.media = it.media.filter(url => {
      const rel = decodeURIComponent(url.slice(cfg.sanou.siteUrl.length + 1));
      const ok = fs.existsSync(path.join(cfg.sanou.localRepo, rel));
      if (!ok) mediaMissing.push({ product: it.name, file: rel });
      return ok;
    });
  }
  if (mediaMissing.length) log(`Fotos referenciadas por el sitio que no existen: ${mediaMissing.length}`);
  return { items, pricesLoaded: !!prices, pricesError, origin: defs.origin, mediaMissing };
}

export async function importCatalog({ db, inventory, cfg, fetched, actor = 'system:sync', log = () => {} }) {
  const run = await db.insert('sync_runs', { source: SOURCE, status: 'running', stats: {}, started_at: now() });
  const stats = { total: 0, created: 0, updated: 0, unchanged: 0, missing: 0, price_changes: 0, stock_events: 0, errors: [] };
  try {
    const data = fetched || await fetchSanouCatalog(cfg, { log });
    const seen = new Set();
    for (const item of data.items) {
      stats.total++;
      seen.add(item.external_id);
      try {
        const { media, stock, featured, low_stock_hint, badge, sheet_name, ...fields } = item;
        // Si no se pudieron leer precios, se conserva el último precio conocido (no se borra ni inventa).
        const existing = await db.findOne('products', { source: SOURCE, external_id: item.external_id });
        if (!data.pricesLoaded && existing) { fields.price = existing.price; fields.compare_at_price = existing.compare_at_price; }
        const payload = { badge, featured, low_stock_hint, sheet_name };
        const contentHash = hash({ fields, media, payload });
        let product;
        if (existing && existing.content_hash === contentHash && existing.status === 'active') {
          stats.unchanged++; product = existing;
          await db.update('products', existing.id, { last_synced_at: now() });
        } else {
          if (existing && existing.price !== fields.price && existing.price != null) {
            stats.price_changes++;
            await db.insert('alerts', { kind: 'precio_cambiado', severity: 'info', product_id: existing.id, status: 'abierta',
              title: `Cambió el precio de ${fields.name}`, details: { antes: existing.price, ahora: fields.price } });
          }
          const r = await db.upsert('products', { ...fields, source: SOURCE, currency: 'ARS', status: 'active',
            content_hash: contentHash, source_payload: payload, last_synced_at: now() }, ['source', 'external_id']);
          product = r.row; r.created ? stats.created++ : stats.updated++;
          // Fotos: se guardan URLs públicas originales (no se copian archivos → sin duplicados).
          const current = await db.find('product_media', { product_id: product.id });
          const keep = new Set(media);
          for (const m of current) if (!keep.has(m.url)) await db.remove('product_media', m.id);   // foto quitada del sitio
          for (const [i, url] of media.entries()) {
            const ex = current.find(m => m.url === url);
            if (ex) { if (ex.position !== i) await db.update('product_media', ex.id, { position: i }); }
            else await db.insert('product_media', { product_id: product.id, url, position: i, alt: `${fields.name} — foto ${i + 1}` });
          }
        }
        const variant = await ensureDefaultVariant(db, product);
        if (stock) {
          const ev = await inventory.syncFromSource({ variantId: variant.id, productId: product.id, inStock: stock.inStock, units: stock.units, actor });
          if (ev) stats.stock_events++;
        }
      } catch (e) { stats.errors.push({ external_id: item.external_id, error: e.message }); }
    }
    // Productos que ya no están en el sitio.
    for (const p of await db.find('products', { source: SOURCE, status: 'active' })) {
      if (!seen.has(p.external_id)) {
        stats.missing++;
        await db.update('products', p.id, { status: 'missing_in_source' });
        await db.insert('alerts', { kind: 'producto_retirado', severity: 'warning', product_id: p.id, status: 'abierta',
          title: `${p.name} ya no figura en sanou.com.ar`, details: {} });
      }
    }
    const status = stats.errors.length ? 'partial' : data.pricesLoaded ? 'ok' : 'partial';
    await db.update('sync_runs', run.id, { status, stats: { ...stats, prices_loaded: data.pricesLoaded, prices_error: data.pricesError, origin: data.origin, media_missing: data.mediaMissing || [] }, finished_at: now() });
    await db.insert('audit_logs', { actor, action: 'catalog.sync', entity: 'sync_runs', entity_id: run.id, details: stats });
    return { runId: run.id, status, stats, pricesLoaded: data.pricesLoaded, pricesError: data.pricesError };
  } catch (e) {
    await db.update('sync_runs', run.id, { status: 'error', error: e.message, finished_at: now(), stats });
    await db.insert('alerts', { kind: 'sync_error', severity: 'critical', status: 'abierta', title: 'Falló la sincronización del catálogo', details: { error: e.message } });
    throw e;
  }
}

async function ensureDefaultVariant(db, product) {
  let v = await db.findOne('product_variants', { product_id: product.id, is_default: true });
  if (!v) {
    v = await db.insert('product_variants', { product_id: product.id, sku: product.sku, name: 'Única', attributes: {}, is_default: true });
    await db.insert('inventory', { variant_id: v.id, tracking_mode: 'flag', source_in_stock: null, on_hand: null, reserved: 0,
      sold_total: 0, low_stock_threshold: 2, availability: 'unknown', version: 0, updated_at: now() });
  }
  return v;
}
