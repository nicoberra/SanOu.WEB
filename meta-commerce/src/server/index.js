// `npm start`: servidor del panel + API. En modo local también corre el worker en el mismo proceso.
import crypto from 'node:crypto';
import { createRuntime, bootstrapOrganization } from '../runtime.js';
import { createServer } from './app.js';
import { startWorker } from '../worker/runner.js';

const rt = createRuntime();
if (rt.cfg.store !== 'supabase' && !rt.cfg.adminToken) {
  rt.cfg.adminToken = crypto.randomBytes(18).toString('hex');
  console.log(`\n  ADMIN_TOKEN no estaba definido. Token temporal para esta sesión:\n  ${rt.cfg.adminToken}\n  (definilo en .env para que sea fijo)\n`);
}
await bootstrapOrganization(rt, { slug: 'sanou', name: 'San Ou', websiteUrl: rt.cfg.sanou.siteUrl });
const server = createServer(rt);
server.listen(rt.cfg.port, () => console.log(`Meta Commerce AI · panel en http://localhost:${rt.cfg.port} · store=${rt.cfg.store} · escrituras a Meta: ${rt.cfg.meta.writeEnabled ? 'HABILITADAS' : 'deshabilitadas'}`));
const stop = process.env.WORKER_IN_PROCESS === 'false' ? () => {} : startWorker(rt);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop(); rt.store.flush?.(); server.close(); process.exit(0); });
