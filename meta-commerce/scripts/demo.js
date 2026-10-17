// Demo en memoria con el catálogo REAL de San Ou (no toca la red ni Meta, no guarda nada):
// importa las 47 fichas, carga 8 unidades de la HHY-300A, prepara una publicación de Marketplace
// y muestra cómo el control de stock bloquea la venta cuando llega a cero.
import { createRuntime, bootstrapOrganization } from '../src/runtime.js';
import { loadConfig } from '../src/config.js';
import { importCatalog } from '../src/connectors/sanou/importer.js';
import { createListing, transitionListing, accountForKind, listingOverview } from '../src/services/listings.js';

const base = loadConfig();
const rt = createRuntime({ store: 'memory', sanou: { ...base.sanou, localRepo: base.sanou.localRepo || new URL('../..', import.meta.url).pathname, pricesMode: 'offline' } });
const org = await bootstrapOrganization(rt, { slug: 'sanou', name: 'San Ou', websiteUrl: rt.cfg.sanou.siteUrl });
const { db, inventory } = rt.forOrg(org.id);
const say = (...a) => console.log('›', ...a);

const r = await importCatalog({ db, inventory, cfg: rt.cfg, actor: 'demo' });
say(`Catálogo importado: ${r.stats.total} productos reales de sanou.com.ar (precios: ${r.pricesLoaded ? 'leídos' : 'sin red → no se inventan'})`);
const p = await db.findOne('products', { sku: 'HHY-300A' });
const v = await db.findOne('product_variants', { product_id: p.id });
say(`Producto: ${p.name} · ${p.specs.map(s => `${s.label}: ${s.value}`).slice(1, 4).join(' · ')}`);

await inventory.move({ variantId: v.id, type: 'restock', qty: 8, actor: 'demo', reason: 'Conteo inicial' });
const acc = await accountForKind(db, 'marketplace_personal');
const l = await createListing(db, { productId: p.id, accountId: acc.id, actor: 'demo' });
await transitionListing(db, l.id, 'pendiente_aprobacion', { actor: 'demo' });
await transitionListing(db, l.id, 'listo_para_publicar', { actor: 'demo' });
const show = async () => { const o = (await listingOverview(db)).find(x => x.id === l.id); say(`Publicación Marketplace: ${o.status_label} · stock ${o.availability} (${o.available_units} u.)${o.blocked_reason ? ' · bloqueada: ' + o.blocked_reason : ''}`); };
await show();
await inventory.move({ variantId: v.id, type: 'sale', qty: 5, actor: 'demo', reason: 'Venta' });
await show();
await inventory.move({ variantId: v.id, type: 'sale', qty: 3, actor: 'demo', reason: 'Venta' });
await show();
try { await transitionListing(db, l.id, 'publicado', { actor: 'demo', confirmed: true }); } catch (e) { say(`Intento de publicar: rechazado → ${e.message}`); }
for (const a of await db.find('alerts', {}, { order: 'created_at.asc' })) say(`Alerta [${a.severity}] ${a.title}`);
