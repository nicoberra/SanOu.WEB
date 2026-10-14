// Worker independiente: `npm run worker`. En producción corre como servicio (Railway, Render, Fly, VPS…).
import { createRuntime, bootstrapOrganization } from '../runtime.js';
import { startWorker } from './runner.js';

const rt = createRuntime();
await bootstrapOrganization(rt, { slug: 'sanou', name: 'San Ou', websiteUrl: rt.cfg.sanou.siteUrl });
console.log(`[worker] activo · store=${rt.cfg.store} · sync cada ${rt.cfg.sync.catalogEveryMin} min · escrituras a Meta: ${rt.cfg.meta.writeEnabled ? 'HABILITADAS' : 'deshabilitadas'}`);
const stop = startWorker(rt);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); rt.store.flush?.(); process.exit(0); });
