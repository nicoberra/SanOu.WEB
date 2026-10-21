import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { testRuntime, fakeItem, fetched } from './helpers.js';
import { createServer } from '../src/server/app.js';
import { importCatalog } from '../src/connectors/sanou/importer.js';
import { signBody } from '../src/server/agency-auth.js';

async function withServer(fn) {
  const ctx = await testRuntime();
  const server = createServer(ctx.rt);
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn({ ...ctx, base }); } finally { server.close(); }
}
const auth = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };

test('API: autenticación obligatoria y cabeceras de seguridad', async () => withServer(async ({ base }) => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/orgs/sanou/dashboard`)).status, 401);
  assert.equal((await fetch(`${base}/api/orgs/sanou/dashboard`, { headers: { Authorization: 'Bearer malo' } })).status, 401);
  const r = await fetch(`${base}/api/orgs/sanou/dashboard`, { headers: auth });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/api/orgs/no-existe/dashboard`, { headers: auth })).status, 404);
  const s = await (await fetch(`${base}/api/orgs/sanou/settings`, { headers: auth })).json();
  assert.equal(JSON.stringify(s).includes('app-secret-test'), false);     // nunca se exponen secretos
}));

test('API: catálogo, movimiento de stock y publicaciones', async () => withServer(async ({ base, rt, db, inventory }) => {
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem()]) });
  const { products } = await (await fetch(`${base}/api/orgs/sanou/products?q=prueba`, { headers: auth })).json();
  assert.equal(products.length, 1);
  const mv = await fetch(`${base}/api/orgs/sanou/products/${products[0].id}/inventory`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'restock', qty: 8 }) });
  assert.equal((await mv.json()).inventory.on_hand, 8);
  const bad = await fetch(`${base}/api/orgs/sanou/products/${products[0].id}/inventory`, { method: 'POST', headers: auth, body: JSON.stringify({ type: 'source_sync', qty: 1 }) });
  assert.equal(bad.status, 400);
  const l = await (await fetch(`${base}/api/orgs/sanou/listings`, { method: 'POST', headers: auth, body: JSON.stringify({ product_id: products[0].id }) })).json();
  const t = await fetch(`${base}/api/orgs/sanou/listings/${l.id}/transition`, { method: 'POST', headers: auth, body: JSON.stringify({ to: 'publicado', confirmed: true }) });
  assert.equal(t.status, 400);                                          // borrador → publicado no está permitido
}));

test('API agencia: tareas firmadas, idempotentes y consultables', async () => withServer(async ({ base }) => {
  const body = JSON.stringify({ organization: 'sanou', agent: 'FacebookDirectorAgent', type: 'director.plan', idempotency_key: 'agencia-1', input: { instruction: 'Promocionar dobladoras' } });
  const ts = String(Math.floor(Date.now() / 1000));
  const post = () => fetch(`${base}/api/v1/agency/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agency-Timestamp': ts, 'X-Agency-Signature': signBody('agency-secret-test', ts, body) }, body });
  const r1 = await (await post()).json();
  assert.equal(r1.task.contract, 'agent-task/v1'); assert.equal(r1.duplicate, false);
  assert.equal((await (await post()).json()).duplicate, true);
  const unsigned = await fetch(`${base}/api/v1/agency/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(unsigned.status, 401);
  const pathQ = `/api/v1/agency/tasks/${r1.task.id}?organization=sanou`;
  const g = await fetch(base + pathQ, { headers: { 'X-Agency-Timestamp': ts, 'X-Agency-Signature': signBody('agency-secret-test', ts, pathQ) } });
  assert.equal((await g.json()).id, r1.task.id);
}));

test('feed de catálogo: requiere clave y refleja el inventario maestro', async () => withServer(async ({ base, rt, db, inventory, org }) => {
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem()]) });
  assert.equal((await fetch(`${base}/feeds/sanou/meta-catalog.csv?key=mala`)).status, 404);
  const key = (await rt.store.get('organizations', org.id)).settings.feed_key;
  let csv = await (await fetch(`${base}/feeds/sanou/meta-catalog.csv?key=${key}`)).text();
  assert.match(csv, /sanou-T1,Producto de prueba,.*,in stock,new,100000\.00 ARS/);
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem({ stock: { inStock: false, units: null } })]) });
  csv = await (await fetch(`${base}/feeds/sanou/meta-catalog.csv?key=${key}`)).text();
  assert.match(csv, /,out of stock,/);
}));

test('webhook de Meta: verificación y firma', async () => withServer(async ({ base }) => {
  assert.equal(await (await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=42`)).text(), '42');
  assert.equal((await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42`)).status, 403);
  const body = JSON.stringify({ object: 'page', entry: [] });
  assert.equal((await fetch(`${base}/webhooks/meta`, { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=00' } })).status, 401);
  const sig = 'sha256=' + crypto.createHmac('sha256', 'app-secret-test').update(body).digest('hex');
  assert.equal((await fetch(`${base}/webhooks/meta`, { method: 'POST', body, headers: { 'X-Hub-Signature-256': sig } })).status, 200);
}));

test('estáticos: sirve el panel y bloquea path traversal', async () => withServer(async ({ base }) => {
  assert.match(await (await fetch(`${base}/`)).text(), /Meta Commerce AI/);
  assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/../src/config.js`)).status, 404);
}));
