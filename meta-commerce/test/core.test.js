import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMovement, availabilityOf } from '../src/core/inventory-math.js';
import { assertTransition, canTransition } from '../src/core/listing-states.js';
import { parsePriceSheet, parseProductDefinitions, normalizeProduct, siteSlug } from '../src/connectors/sanou/source.js';
import { validateGrounded } from '../src/ai/grounding.js';
import { parseInstruction } from '../src/agents/director.js';
import { buildFeedRows, toCsv, itemsBatchAvailability } from '../src/connectors/meta/catalog.js';
import { verifyAgencyRequest, signBody } from '../src/server/agency-auth.js';
import { validateTaskInput } from '../src/core/task-contract.js';

const inv0 = { tracking_mode: 'flag', source_in_stock: null, on_hand: null, reserved: 0, sold_total: 0, low_stock_threshold: 2, availability: 'unknown', version: 0 };

test('inventario: modo "hay/no hay" sigue a la web', () => {
  assert.equal(applyMovement(inv0, { type: 'source_sync', source_in_stock: true }).availability, 'in_stock');
  assert.equal(applyMovement(inv0, { type: 'source_sync', source_in_stock: false }).availability, 'out_of_stock');
});

test('inventario: unidades, reservas y ventas (8 → 3 → 0)', () => {
  let i = applyMovement({ ...inv0, source_in_stock: true }, { type: 'restock', qty: 8 });
  assert.equal(i.on_hand, 8); assert.equal(i.availability, 'in_stock');
  i = applyMovement(i, { type: 'reservation', qty: 2 });
  assert.equal(i.on_hand - i.reserved, 6);
  i = applyMovement(i, { type: 'sale', qty: 2 });          // la venta consume la reserva
  assert.deepEqual([i.on_hand, i.reserved, i.sold_total], [6, 0, 2]);
  i = applyMovement(i, { type: 'sale', qty: 3 });
  assert.equal(i.on_hand, 3); assert.equal(i.availability, 'in_stock');
  i = applyMovement(i, { type: 'reservation', qty: 1 });
  assert.equal(i.availability, 'low_stock');                // 2 disponibles ≤ umbral
  i = applyMovement(i, { type: 'sale', qty: 3 });
  assert.equal(i.availability, 'out_of_stock');
  assert.throws(() => applyMovement(i, { type: 'sale', qty: 1 }), /insuficiente/);
  assert.throws(() => applyMovement(i, { type: 'reservation', qty: 1 }), /superan/);
});

test('inventario: si la web dice "sin stock", manda aunque haya unidades', () => {
  const i = applyMovement({ ...inv0, tracking_mode: 'units', on_hand: 5 }, { type: 'source_sync', source_in_stock: false });
  assert.equal(availabilityOf(i), 'out_of_stock');
});

test('inventario: reservar o vender exige stock en unidades', () => {
  assert.throws(() => applyMovement(inv0, { type: 'reservation', qty: 1 }), /unidades/);
});

test('publicaciones: transiciones y confirmaciones', () => {
  assert.ok(canTransition('borrador', 'pendiente_aprobacion'));
  assert.ok(!canTransition('borrador', 'publicado'));
  assert.ok(!canTransition('desactivado', 'publicado'));     // reactivar = volver a aprobar
  assert.throws(() => assertTransition({ status: 'listo_para_publicar' }, 'publicado'), /confirmación/);
  assert.throws(() => assertTransition({ status: 'listo_para_publicar' }, 'publicado', { confirmed: true, inventory: { availability: 'out_of_stock' } }), /agotado/);
  assertTransition({ status: 'listo_para_publicar' }, 'publicado', { confirmed: true, inventory: { availability: 'in_stock' } });
});

test('planilla de precios: columnas por encabezado y por posición', () => {
  const m = parsePriceSheet('Nombre,Precios,Stock,Precio mercado libre,DESTACADO\n"Pinza Hidráulica HHY-300A","$ 250.000",TRUE,"$300.000",si\nOtro,,FALSE,,\n');
  assert.deepEqual(m.get('pinza hidraulica hhy-300a'), { name: 'Pinza Hidráulica HHY-300A', price: 250000, oldPrice: 300000, inStock: true, featured: true, units: null });
  assert.equal(m.get('otro').inStock, false); assert.equal(m.get('otro').price, null);
  const u = parsePriceSheet('Nombre,Precios,Stock,Precio anterior,DESTACADO,Stock unidades\nX,1000,TRUE,,,7\n');
  assert.equal(u.get('x').units, 7);
});

test('fichas: se leen en un contexto aislado y se normalizan sin inventar', () => {
  const code = "window.SANOU_PRODUCTOS=[{id:9,name:'Bomba X-1',category:'bombas',imgs:2,folder:'X 1',catFolder:'bombas',ext:'webp',desc:'d',specs:[{l:'Modelo',v:'X-1'}]}];window.SANOU_CAT_NAMES={bombas:'Bombas'};";
  const d = parseProductDefinitions(code);
  const p = normalizeProduct(d.products[0], { catNames: d.catNames, siteUrl: 'https://sanou.com.ar', priceRow: undefined });
  assert.equal(p.sku, 'X-1'); assert.equal(p.price, null); assert.equal(p.stock, null);
  assert.deepEqual(p.media, ['https://sanou.com.ar/productos/bombas/X%201/1.webp', 'https://sanou.com.ar/productos/bombas/X%201/2.webp']);
  assert.equal(p.source_url, 'https://sanou.com.ar/producto/bomba-x-1-9.html');
  assert.throws(() => parseProductDefinitions('require("fs")'), /require is not defined/);
  assert.throws(() => parseProductDefinitions('while(true){}'), /timed out/);
  assert.equal(siteSlug('Pinza Hidráulica HHY-300A'), 'pinza-hidraulica-hhy-300a');
});

test('IA: el validador detecta datos y promesas no verificadas', () => {
  const product = { name: 'Pinza Hidráulica HHY-300A', sku: 'HHY-300A', price: 250000, specs: [{ label: 'Rango de crimpado', value: '16–300 mm²' }, { label: 'Fuerza', value: '9 Ton' }] };
  assert.ok(validateGrounded('Crimpadora HHY-300A de 9 Ton para terminales de 16 a 300 mm²', product).ok);
  const bad = validateGrounded('Crimpadora de 12 toneladas con envío gratis y garantía de 2 años', product);
  assert.ok(!bad.ok);
  assert.deepEqual(bad.issues.map(i => i.type).sort(), ['dato_no_verificado', 'promesa_no_verificada', 'promesa_no_verificada'].sort());
});

test('Director: interpreta instrucciones', () => {
  const a = parseInstruction('Prepará una campaña para las crimpadoras San Ou');
  assert.deepEqual(a.categories, ['pinzas']); assert.ok(a.wantsAds && a.wantsMarketplace && a.wantsSales);
  const b = parseInstruction('Quiero promocionar la HHY-300A con un presupuesto de $100.000');
  assert.deepEqual(b.models, ['HHY-300A']); assert.equal(b.budget, 100000);
});

test('feed de Meta: excluye lo que no se puede publicar sin inventar', () => {
  const base = { status: 'active', external_id: '1', name: 'A', price: 1000, currency: 'ARS', source_url: 'https://sanou.com.ar/producto/a-1.html', specs: [], brand: 'San Ou' };
  const { rows, excluded } = buildFeedRows([
    { product: base, inventory: { availability: 'out_of_stock' }, media: ['https://x/1.jpg'] },
    { product: { ...base, external_id: '2', price: null }, inventory: { availability: 'in_stock' }, media: ['https://x/1.jpg'] },
    { product: { ...base, external_id: '3' }, inventory: { availability: 'unknown' }, media: ['https://x/1.jpg'] },
  ], { idPrefix: 'sanou' });
  assert.equal(rows.length, 1); assert.equal(rows[0].availability, 'out of stock'); assert.equal(rows[0].price, '1000.00 ARS'); assert.equal(rows[0].id, 'sanou-1');
  assert.deepEqual(excluded.map(e => e.reason), ['sin precio publicado en el sitio', 'stock desconocido']);
  assert.match(toCsv(rows), /^id,title,description,availability/);
  assert.deepEqual(itemsBatchAvailability([{ retailerId: 'sanou-1', availability: 'out of stock' }]), { item_type: 'PRODUCT_ITEM', requests: [{ method: 'UPDATE', data: { id: 'sanou-1', availability: 'out of stock' } }] });
});

test('agencia: firma HMAC con ventana anti-replay', () => {
  const ts = '1760000000', body = '{"a":1}';
  const headers = { 'x-agency-timestamp': ts, 'x-agency-signature': signBody('s3cret', ts, body) };
  assert.ok(verifyAgencyRequest('s3cret', headers, body, 1760000010).ok);
  assert.ok(!verifyAgencyRequest('s3cret', headers, body + ' ', 1760000010).ok);
  assert.ok(!verifyAgencyRequest('s3cret', headers, body, 1760001000).ok);
  assert.ok(!verifyAgencyRequest('', headers, body, 1760000010).ok);
});

test('contrato de tareas: validación', () => {
  assert.throws(() => validateTaskInput({ agent: 'Otro', type: 'a.b' }), /desconocido/);
  assert.throws(() => validateTaskInput({ agent: 'MarketplaceAgent', type: 'malo' }), /dominio/);
  assert.throws(() => validateTaskInput({ agent: 'MarketplaceAgent', type: 'a.b', callback_url: 'http://x' }), /https/);
  assert.equal(validateTaskInput({ agent: 'MarketplaceAgent', type: 'catalog.sync' }).priority, 3);
});
