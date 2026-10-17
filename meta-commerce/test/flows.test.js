import test from 'node:test';
import assert from 'node:assert/strict';
import { testRuntime, fakeItem, fetched } from './helpers.js';
import { importCatalog } from '../src/connectors/sanou/importer.js';
import { createListing, transitionListing, accountForKind } from '../src/services/listings.js';
import { requestApproval, decideApproval, consumeApproval } from '../src/services/approvals.js';
import { scoped } from '../src/store/scoped.js';
import { runOneTask } from '../src/worker/runner.js';
import { enqueueTask } from '../src/services/tasks.js';

async function publishedListing(db, productId, kind, actor = 'user:test') {
  const acc = await accountForKind(db, kind);
  const l = await createListing(db, { productId, accountId: acc.id, actor });
  await transitionListing(db, l.id, 'pendiente_aprobacion', { actor });
  await transitionListing(db, l.id, 'listo_para_publicar', { actor });
  return transitionListing(db, l.id, 'publicado', { actor, confirmed: true, externalUrl: 'https://www.facebook.com/marketplace/item/1' });
}

test('importación real: 47 productos de sanou.com.ar, idempotente', async () => {
  const { rt, db, inventory } = await testRuntime();
  const r1 = await importCatalog({ db, inventory, cfg: rt.cfg });
  assert.equal(r1.stats.total, 47); assert.equal(r1.stats.created, 47);
  const r2 = await importCatalog({ db, inventory, cfg: rt.cfg });
  assert.equal(r2.stats.unchanged, 47); assert.equal(r2.stats.created, 0);
  assert.equal(await db.count('products'), 47); assert.equal(await db.count('inventory'), 47);
  const hhy = await db.findOne('products', { sku: 'HHY-300A' });
  assert.equal(hhy.name, 'Pinza Hidráulica HHY-300A'); assert.equal(hhy.price, null);   // sin red: no se inventa precio
});

test('cascada de agotado: todas las vistas, API vs manual, sin falsas confirmaciones; reposición sin reactivar', async () => {
  const { rt, db, inventory } = await testRuntime();
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem()]) });
  const p = await db.findOne('products', { external_id: 'T1' });
  const mp = await publishedListing(db, p.id, 'marketplace_personal');
  const cat = await publishedListing(db, p.id, 'meta_catalog');
  const draftAcc = await accountForKind(db, 'messenger_page');   // una cuenta más para un borrador
  const draft = await createListing(db, { productId: p.id, accountId: draftAcc.id, actor: 'user:test' });

  // La web pasa a "sin stock".
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem({ stock: { inStock: false, units: null } })]) });
  const after = Object.fromEntries((await db.find('marketplace_listings')).map(l => [l.id, l]));
  assert.equal(after[mp.id].status, 'pendiente_desactivacion');
  assert.equal(after[cat.id].status, 'pendiente_desactivacion');            // NO "desactivado": falta confirmación
  assert.equal(after[mp.id].pending_actions.filter(a => a.type === 'desactivar_manual' && !a.done).length, 1);
  assert.equal(after[draft.id].blocked_reason, 'sin_stock');
  const tasks = await db.find('agent_tasks', { type: 'channel.set_availability' });
  assert.equal(tasks.length, 1); assert.equal(tasks[0].input.listing_id, cat.id);
  const alert = await db.findOne('alerts', { kind: 'agotado' });
  assert.equal(alert.severity, 'critical'); assert.equal(alert.details.publicaciones_afectadas, 3);

  // Con escrituras a Meta deshabilitadas, el worker no actúa afuera y la publicación sigue pendiente.
  const done = await runOneTask(rt);
  assert.equal(done.status, 'no_disponible');
  assert.equal((await db.get('marketplace_listings', cat.id)).status, 'pendiente_desactivacion');

  // No se puede ofrecer a la venta un producto agotado.
  await assert.rejects(transitionListing(db, draft.id, 'pendiente_aprobacion', { actor: 'u' }).then(() => transitionListing(db, draft.id, 'listo_para_publicar', { actor: 'u' })), /agotado/);

  // El operador confirma que bajó la de Marketplace.
  await transitionListing(db, mp.id, 'desactivado', { actor: 'user:test', confirmed: true });

  // Reposición: nada se reactiva solo; se piden revisiones.
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem({ stock: { inStock: true, units: null } })]) });
  const mpNow = await db.get('marketplace_listings', mp.id);
  assert.equal(mpNow.status, 'desactivado');
  assert.ok(mpNow.pending_actions.some(a => a.type === 'revisar_reactivacion' && !a.done));
  assert.equal((await db.get('marketplace_listings', draft.id)).blocked_reason, null);
  assert.ok(await db.findOne('alerts', { kind: 'repuesto' }));
});

test('stock por unidades: 8 → 3 → 0 se refleja en todas las publicaciones del mismo producto maestro', async () => {
  const { rt, db, inventory } = await testRuntime();
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem()]) });
  const p = await db.findOne('products', { external_id: 'T1' });
  const v = await db.findOne('product_variants', { product_id: p.id });
  const l = await publishedListing(db, p.id, 'marketplace_personal');
  await inventory.move({ variantId: v.id, type: 'restock', qty: 8, actor: 'user:test' });
  await inventory.move({ variantId: v.id, type: 'sale', qty: 5, actor: 'user:test', idempotencyKey: 'venta-1' });
  const dup = await inventory.move({ variantId: v.id, type: 'sale', qty: 5, actor: 'user:test', idempotencyKey: 'venta-1' });
  assert.equal(dup.duplicate, true);                       // reintento idempotente: no descuenta dos veces
  const { listingOverview } = await import('../src/services/listings.js');
  let ov = (await listingOverview(db)).find(x => x.id === l.id);
  assert.equal(ov.available_units, 3); assert.equal(ov.price, 100000);
  await inventory.move({ variantId: v.id, type: 'sale', qty: 3, actor: 'user:test' });
  ov = (await listingOverview(db)).find(x => x.id === l.id);
  assert.equal(ov.availability, 'out_of_stock'); assert.equal(ov.status, 'pendiente_desactivacion');
  const movements = await db.find('inventory_movements', { variant_id: v.id });
  assert.equal(movements.filter(m => m.type === 'sale').length, 2);
});

test('anti-duplicados: una sola publicación viva por producto y cuenta', async () => {
  const { rt, db, inventory } = await testRuntime();
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem()]) });
  const p = await db.findOne('products', { external_id: 'T1' });
  const acc = await accountForKind(db, 'marketplace_personal');
  await createListing(db, { productId: p.id, accountId: acc.id, actor: 'u' });
  await assert.rejects(createListing(db, { productId: p.id, accountId: acc.id, actor: 'u' }), /variantes creativas/);
});

test('multiempresa: una empresa no puede leer ni modificar datos de otra', async () => {
  const { rt, db, inventory } = await testRuntime();
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem()]) });
  const p = await db.findOne('products', { external_id: 'T1' });
  const other = await rt.store.insert('organizations', { slug: 'otra', name: 'Otra', settings: {} });
  const odb = scoped(rt.store, other.id);
  assert.equal((await odb.find('products')).length, 0);
  await assert.rejects(odb.get('products', p.id), /otra organización/);
  await assert.rejects(odb.update('products', p.id, { name: 'hackeado' }), /otra organización/);
  const ins = await odb.insert('alerts', { kind: 'x', title: 'y', organization_id: rt.store.db.organizations[0].id });
  assert.equal(ins.organization_id, other.id);             // no se puede forzar otra empresa
});

test('aprobaciones: se aprueba un contenido exacto y se usa una vez', async () => {
  const { db } = await testRuntime();
  const payload = { campaign: 'HHY-300A', budget: 100000 };
  const a = await requestApproval(db, { action: 'ads.activate', payload, requestedBy: 'agent:MetaAdsAgent' });
  await assert.rejects(consumeApproval(db, { approvalId: a.id, action: 'ads.activate', payload, actor: 'w' }), /pendiente/);
  await decideApproval(db, a.id, { approve: true, user: 'user:admin' });
  await assert.rejects(consumeApproval(db, { approvalId: a.id, action: 'ads.activate', payload: { ...payload, budget: 900000 }, actor: 'w' }), /cambió/);
  await consumeApproval(db, { approvalId: a.id, action: 'ads.activate', payload, actor: 'w' });
  await assert.rejects(consumeApproval(db, { approvalId: a.id, action: 'ads.activate', payload, actor: 'w' }), /usada/);
});

test('worker + Director: plan con productos reales y subtareas trazables (sin simular etapas futuras)', async () => {
  const { rt, db, inventory } = await testRuntime();
  await importCatalog({ db, inventory, cfg: rt.cfg, fetched: fetched([fakeItem(), fakeItem({ external_id: 'T2', sku: 'TEST-2', name: 'Otra pinza', stock: { inStock: false, units: null } })]) });
  const { task } = await enqueueTask(db, { agent: 'FacebookDirectorAgent', type: 'director.plan', requested_by: 'user:test', input: { instruction: 'Prepará una campaña para las crimpadoras San Ou con $100.000' } });
  const done = await runOneTask(rt);
  assert.equal(done.id, task.id); assert.equal(done.status, 'completada');
  assert.deepEqual(done.result.ok.map(p => p.sku), ['TEST-1']);
  assert.deepEqual(done.result.excluded.map(p => p.reason), ['agotado']);
  assert.equal(done.result.children.length, 3);
  for (let i = 0; i < 3; i++) await runOneTask(rt);
  const children = await db.find('agent_tasks', { parent_task_id: task.id });
  assert.ok(children.every(c => c.status === 'no_disponible' && /Etapa/.test(c.result.reason)));
});

test('worker: reintentos con backoff y fallo final registrado', async () => {
  const { rt, db } = await testRuntime();
  rt.handlers['MarketplaceAgent:inventory.review'] = async () => { throw new Error('caída simulada'); };
  const { task } = await enqueueTask(db, { agent: 'MarketplaceAgent', type: 'inventory.review', requested_by: 't', max_attempts: 2 });
  let t = await runOneTask(rt);
  assert.equal(t.status, 'pendiente'); assert.ok(new Date(t.run_after) > new Date());
  await rt.store.update('agent_tasks', task.id, { run_after: new Date(0).toISOString() });
  t = await runOneTask(rt);
  assert.equal(t.status, 'fallida');
  assert.equal((await db.find('agent_executions', { task_id: task.id })).length, 2);
  assert.ok(await db.findOne('alerts', { kind: 'tarea_fallida' }));
});
