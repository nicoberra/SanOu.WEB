// Sincronización manual única: `npm run sync` (útil para cron externo o diagnóstico).
import { createRuntime, bootstrapOrganization } from '../src/runtime.js';
import { importCatalog } from '../src/connectors/sanou/importer.js';

const rt = createRuntime();
const org = await bootstrapOrganization(rt, { slug: 'sanou', name: 'San Ou', websiteUrl: rt.cfg.sanou.siteUrl });
const { db, inventory } = rt.forOrg(org.id);
const r = await importCatalog({ db, inventory, cfg: rt.cfg, actor: 'system:cli', log: m => console.log('·', m) });
rt.store.flush?.();
console.log(JSON.stringify({ status: r.status, ...r.stats, errors: r.stats.errors.length }, null, 2));
if (!r.pricesLoaded) console.log(`\nAviso: precios/stock no se pudieron leer (${r.pricesError || 'modo offline'}). Los productos quedan con stock "desconocido" y sin precio hasta la próxima sincronización con red.`);
