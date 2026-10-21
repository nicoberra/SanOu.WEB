const crypto = require('crypto');
// Pruebas del backend real (apps-script-crm.gs) contra planillas SIMULADAS en memoria.
// No toca Google, ni la planilla real, ni Telegram, ni GitHub: todos los servicios están falsificados.
// Uso: node tests/test-gs.js
// El .gs no está en el repo (está en .gitignore): si no existe (por ejemplo en GitHub Actions), se saltea.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GS = process.env.GS_PATH || path.join(__dirname, '..', 'apps-script-crm.gs');
if (!fs.existsSync(GS)) { console.log('SKIP test-gs: apps-script-crm.gs no está (normal en CI: el .gs no se versiona).'); process.exit(0); }

// ── Simulación de Google Sheets ──
class Rango {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const fila = this.sh.rows[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) { const v = fila[this.c - 1 + j]; o.push(v === undefined ? '' : v); } out.push(o); } return out; }
  getDisplayValues() { return this.getValues().map(f => f.map(v => v === true ? 'TRUE' : v === false ? 'FALSE' : String(v))); }
  getValue() { return this.getValues()[0][0]; }
  setValue(v) { const i = this.r - 1; while (this.sh.rows.length <= i) this.sh.rows.push([]); this.sh.rows[i][this.c - 1] = v; return this; }
  setValues(m) { m.forEach((f, i) => f.forEach((v, j) => new Rango(this.sh, this.r + i, this.c + j, 1, 1).setValue(v))); return this; }
  setFontWeight() { return this; }
}
class Hoja {
  constructor(nombre, rows, id) { this.nombre = nombre; this.rows = rows || []; this.id = id || 0; }
  getName() { return this.nombre; }
  getSheetId() { return this.id; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((m, f) => Math.max(m, f.length), 0); }
  getDataRange() { return new Rango(this, 1, 1, this.getLastRow(), Math.max(this.getLastColumn(), 1)); }
  getRange(r, c, nr, nc) { return new Rango(this, r, c, nr || 1, nc || 1); }
  appendRow(f) { this.rows.push(f.slice()); return this; }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  setFrozenRows() {}
}
class Planilla {
  constructor(hojas) { this.hojas = hojas; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  getSheets() { return this.hojas; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return h; }
}

function entorno() {
  const cache = new Map();
  const props = { PANEL_PASS_HASH: 'hashdeprueba', TG_TOKEN: '', TG_CHAT: '', GH_TOKEN: '', MP_ACCESS_TOKEN: '' };
  const fetches = [];
  const planillas = {};
  const drive = { archivos: {} };
  drive.carpeta = { getId: () => 'carpeta1', createFile: blob => { const id = 'archivo' + Object.keys(drive.archivos).length + 'xxxxxx';
    const f = { getId: () => id, getName: () => blob.nombre, getParents: () => { let d = false; return { hasNext: () => !d, next: () => { d = true; return drive.carpeta; } }; }, getBlob: () => ({ getContentType: () => blob.mime, getBytes: () => blob.bytes || [] }) };
    drive.archivos[id] = f; return f; } };
  const ctx = {
    console,
    SpreadsheetApp: { openById: id => planillas[id] || (planillas[id] = new Planilla([])) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: t => ({ texto: t, setMimeType(m) { this.mime = m; return this; } }) },
    Utilities: {
      formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 16).replace('T', ' '),
      base64Encode: s => Buffer.from(String(s)).toString('base64'),
      base64Decode: s => Buffer.from(String(s), 'base64'),
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      computeDigest: (alg, texto) => [...crypto.createHash('sha256').update(String(texto), 'utf8').digest()].map(x => (x > 127 ? x - 256 : x)),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      newBlob: (b, mime, nombre) => ({ getDataAsString: () => Buffer.from(b).toString('utf8'), getBytes: () => [...Buffer.from(b)].map(x => (x > 127 ? x - 256 : x)), mime, nombre }),
    },
    DriveApp: {
      getFolderById: id => drive.carpeta,
      createFolder: () => drive.carpeta,
      getFileById: id => drive.archivos[id],
    },
    UrlFetchApp: { fetch: (url, opt) => { fetches.push(url); return { getResponseCode: () => 200, getContentText: () => '{}' }; } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://exec.test' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(GS, 'utf8'), ctx, { filename: 'apps-script-crm.gs' });
  // Planillas de prueba con los mismos IDs que usa el código (no se conecta a nada real).
  planillas[ctx.CRM_ID] = new Planilla([]);
  planillas[ctx.PRECIOS_ID] = new Planilla([new Hoja('Precios', [
    ['Nombre', 'Precios', 'Stock', 'Precio mercado libre', 'DESTACADO', 'Costo USD'],
    ['Pinza Prueba A', '$80.000', true, '$89.999', false, 41.5],
    ['Pinza "B", con coma', '$10.000', false, '', true, 7],
  ])]);
  planillas[ctx.MAYORISTA_ID] = new Planilla([new Hoja('Mayorista', [
    ['Producto', 'Mínimo', 'Mayorista', 'Unitario', 'Nota'], ['PINZAS'], ['Pinza Prueba A', '6', 70000, 80000, ''],
  ], ctx.MAYORISTA_GID)]);
  const llamar = (params, body) => {
    const out = ctx.manejar({ parameter: params, postData: body ? { contents: JSON.stringify(body) } : undefined });
    const t = out.texto; const m = t.match(/^[\w.$]+\(([\s\S]*)\);$/);
    return { raw: t, json: JSON.parse(m ? m[1] : t) };
  };
  return { ctx, planillas, cache, fetches, llamar, props, drive, AUTH: props.PANEL_PASS_HASH };
}

// ── Mini framework ──
let ok = 0, fallas = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fallas++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function igual(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)}`); }
function verdad(v, msg) { if (!v) throw new Error(msg || 'esperaba verdadero'); }
const filasDe = (env, tab) => (env.planillas[env.ctx.CRM_ID].getSheetByName(tab) || { rows: [] }).rows.length - 1;

console.log('test-gs: backend real contra planillas simuladas');

test('version responde la marca de la entrega', () => {
  const { llamar } = entorno();
  verdad(/^v\d+/.test(llamar({ action: 'version' }).json.version));
});

test('acción privada sin clave → No autorizado; con la clave → ok', () => {
  const { llamar, AUTH } = entorno();
  igual(llamar({ action: 'list', tab: 'Clientes' }).json.error, 'No autorizado');
  igual(llamar({ action: 'list', tab: 'Clientes', auth: AUTH }).json.ok, true);
});

test('pestaña inválida se rechaza', () => {
  const { llamar, AUTH } = entorno();
  verdad(/inválida/i.test(llamar({ action: 'list', tab: 'Hackeo', auth: AUTH }).json.error));
});

test('alta pública de cotización guarda una fila', () => {
  const env = entorno();
  igual(env.llamar({ action: 'add', tab: 'Cotizaciones', cliente: 'Ana', telefono: '1155550000', detalle: '1x Pinza', monto: '80000' }).json.ok, true);
  igual(filasDe(env, 'Cotizaciones'), 1);
});

test('doble clic / reintento con el mismo cid NO duplica', () => {
  const env = entorno();
  const p = { action: 'add', tab: 'Cotizaciones', cid: 'cabc123xyz', cliente: 'Ana', telefono: '1155550000', detalle: '1x Pinza', monto: '80000' };
  const a = env.llamar(p).json, b = env.llamar(p).json;
  igual(a.id, 'cabc123xyz'); igual(b.id, 'cabc123xyz'); igual(filasDe(env, 'Cotizaciones'), 1);
});

test('honeypot completo → responde ok pero no guarda nada', () => {
  const env = entorno();
  igual(env.llamar({ action: 'add', tab: 'Clientes', nombre: 'Bot', email: 'bot@x.com', web: 'http://spam' }).json.ok, true);
  igual(filasDe(env, 'Clientes'), -1);
});

test('límite por persona: la alta 16 del mismo teléfono en 10 min se frena con mensaje amable', () => {
  const env = entorno();
  let ultimo;
  for (let i = 0; i < 16; i++) ultimo = env.llamar({ action: 'add', tab: 'Cotizaciones', cliente: 'Ana', telefono: '1155550000', detalle: 'item ' + i, monto: '1' }).json;
  igual(ultimo.ok, false); verdad(/Esperá un momento/.test(ultimo.error), 'mensaje amable');
  igual(filasDe(env, 'Cotizaciones'), 15);
});

test('el CRM (con clave) no tiene límite', () => {
  const env = entorno();
  let r;
  for (let i = 0; i < 40; i++) r = env.llamar({ action: 'add', tab: 'Seguimientos', auth: env.AUTH, cliente: 'X', telefono: '1', motivo: 'm' + i }).json;
  igual(r.ok, true); igual(filasDe(env, 'Seguimientos'), 40);
});

test('fuerza bruta del panel: el intento 31 en 10 min se frena', () => {
  const env = entorno();
  let r;
  for (let i = 0; i < 31; i++) r = env.llamar({ action: 'panel_login', h: 'mal' + i }).json;
  igual(r.ok, false); verdad(/Demasiadas/.test(r.error));
});

test('borrar / actualizar con id vacío NO toca ninguna fila', () => {
  const env = entorno();
  const sh = env.planillas[env.ctx.CRM_ID].insertSheet('Clientes');
  sh.appendRow(env.ctx.TABS.Clientes.map(c => c.h));
  sh.appendRow(['', '', 'Fila sin id cargada a mano']);
  igual(env.llamar({ action: 'delete', tab: 'Clientes', id: '', auth: env.AUTH }).json.deleted, false);
  igual(env.llamar({ action: 'update', tab: 'Clientes', id: '', nombre: 'Pisado', auth: env.AUTH }).json.updated, false);
  igual(sh.rows.length, 2); igual(sh.rows[1][2], 'Fila sin id cargada a mano');
});

test('borrar por id borra la fila correcta', () => {
  const env = entorno();
  const a = env.llamar({ action: 'add', tab: 'Pedidos', auth: env.AUTH, cliente: 'A' }).json.id;
  env.llamar({ action: 'add', tab: 'Pedidos', auth: env.AUTH, cliente: 'B' });
  igual(env.llamar({ action: 'delete', tab: 'Pedidos', id: a, auth: env.AUTH }).json.deleted, true);
  const sh = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos');
  igual(sh.rows.length, 2); igual(sh.rows[1][2], 'B');
});

test('listar Clientes nunca expone la columna clave', () => {
  const env = entorno();
  env.llamar({ action: 'registrar', tab: 'Clientes', nombre: 'Ana', email: 'ana@x.com', clave: 'HASHSECRETO' });
  const rows = env.llamar({ action: 'list', tab: 'Clientes', auth: env.AUTH }).json.rows;
  igual(rows.length, 1); verdad(!('clave' in rows[0]), 'no debe venir clave'); verdad(!JSON.stringify(rows).includes('HASHSECRETO'));
});

test('catálogo público: 5 columnas, SIN Costo USD, CSV bien escapado', () => {
  const { llamar } = entorno();
  const j = llamar({ action: 'catalogo', tab: 'Clientes' }).json;
  igual(j.ok, true);
  const l = j.csv.split('\n');
  igual(l[0], 'Nombre,Precios,Stock,Precio mercado libre,DESTACADO');
  verdad(!/costo|41\.5/i.test(j.csv), 'no debe filtrar el costo');
  igual(l[1], 'Pinza Prueba A,$80.000,TRUE,$89.999,FALSE');
  igual(l[2], '"Pinza ""B"", con coma",$10.000,FALSE,,TRUE');
});

test('catálogo: la caché se invalida al guardar un producto desde el CRM', () => {
  const env = entorno();
  env.llamar({ action: 'catalogo', tab: 'Clientes' });
  verdad(env.cache.has('catalogo_csv'));
  env.llamar({ action: 'productos_save', tab: 'Clientes', auth: env.AUTH, nombre: 'Pinza Prueba A', precio: '85000' });
  verdad(!env.cache.has('catalogo_csv'), 'caché vieja');
  verdad(env.llamar({ action: 'catalogo', tab: 'Clientes' }).json.csv.includes('$85.000'));
});

test('lista mayorista pública con caché que se borra al guardar', () => {
  const env = entorno();
  igual(env.llamar({ action: 'mayorista_list' }).json.rows.length, 2);
  verdad(env.cache.has('may_list'));
  env.llamar({ action: 'mayorista_save', tab: 'Clientes', auth: env.AUTH, row: '3', producto: 'Pinza Prueba A', mayorista: '71000' });
  verdad(!env.cache.has('may_list'));
});

test('JSONP: un callback con código inyectado se ignora (devuelve JSON plano)', () => {
  const { llamar } = entorno();
  const r = llamar({ action: 'version', callback: 'alert(1);//' });
  verdad(r.raw.startsWith('{'), 'no debe envolver con el callback');
  const ok2 = llamar({ action: 'version', callback: 'cb_123' });
  verdad(ok2.raw.startsWith('cb_123('));
});

test('campos larguísimos se recortan (no llenan la planilla de basura)', () => {
  const env = entorno();
  env.llamar({ action: 'add', tab: 'Clientes', nombre: 'x'.repeat(5000), email: 'a@b.com' });
  igual(env.planillas[env.ctx.CRM_ID].getSheetByName('Clientes').rows[1][2].length, 500);
});

test('Mercado Pago apagado (sin token) responde un mensaje claro', () => {
  const { llamar } = entorno();
  const r = llamar({ action: 'mp_preferencia', tab: 'Clientes', items: '[]' }).json;
  igual(r.ok, false); verdad(/no están habilitados/.test(r.error));
});

// ── Checkout (v26): pedido por transferencia y datos obligatorios del envío ──
const PEDIDO = { action: 'pedido_transferencia', tab: 'Clientes', items: JSON.stringify([{ nombre: 'Pinza HHY-70A', qty: 2 }]),
  nombre: 'Ana Pérez', email: 'ana@ejemplo.com', telefono: '1155550000', cid: 'abc123' };
function conProductos() { const env = entorno(); env.ctx.productosPorNombre = () => ({ 'pinza hhy-70a': { precio: 80000, stock: true } }); return env; }

test('transferencia con retiro: guarda el pedido al precio de la planilla, sin pedir DNI', () => {
  const env = conProductos();
  const r = env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro' })).json;
  igual(r.ok, true); igual(r.total, 160000); igual(filasDe(env, 'Pedidos'), 1);
});

test('transferencia con envío: sin DNI o sin dirección se rechaza y no guarda', () => {
  const env = conProductos();
  const sinDni = env.llamar(Object.assign({}, PEDIDO, { zona: 'gba1', direccion: 'Calle 123', localidad: 'Morón', cp: '1708' })).json;
  igual(sinDni.ok, false); verdad(/DNI/.test(sinDni.error));
  const sinDir = env.llamar(Object.assign({}, PEDIDO, { zona: 'gba1', dni: '30111222', cp: '1708' })).json;
  igual(sinDir.ok, false); verdad(/dirección/i.test(sinDir.error));
  verdad(filasDe(env, 'Pedidos') <= 0);   // no se guardó nada
});

test('transferencia con envío completo: suma el envío de la zona y guarda dirección y DNI', () => {
  const env = conProductos();
  const r = env.llamar(Object.assign({}, PEDIDO, { zona: 'gba1', dni: '30.111.222', direccion: 'Calle 123', localidad: 'Morón', cp: '1708' })).json;
  igual(r.ok, true); igual(r.total, 167000);
  const sh = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos'), h = sh.rows[0], f = sh.rows[1];
  const col = t => f[h.indexOf(t)];
  igual(col('DNI'), '30111222'); igual(col('Dirección de envío'), 'Calle 123, Morón (CP 1708)');
  igual(col('Origen'), 'web'); igual(col('Medio de pago'), 'Transferencia'); igual(col('Estado del pago'), 'Esperando transferencia');
  igual(col('Estado'), 'Pendiente'); igual(col('Envío'), 'Sí'); igual(col('Monto envío'), 7000);
  igual(col('Monto'), '160000', 'Monto = productos (el envío va aparte, como en el CRM)');
  igual(JSON.parse(col('Productos (JSON)'))[0].u, 80000);
});

test('transferencia: doble clic con el mismo cid NO duplica el pedido', () => {
  const env = conProductos();
  const p = Object.assign({}, PEDIDO, { zona: 'retiro' });
  env.llamar(p); const b = env.llamar(p).json;
  igual(b.ok, true); igual(filasDe(env, 'Pedidos'), 1);
});

// ── v27: comprobantes, detalle del pago de MP y notificaciones push ──
test('retiro: queda como "Retiro en el depósito" y sin envío', () => {
  const env = conProductos();
  env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro' }));
  const sh = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos'), h = sh.rows[0], f = sh.rows[1];
  igual(f[h.indexOf('Entrega')], 'Retiro en el depósito'); igual(f[h.indexOf('Envío')], 'No');
});

test('comprobante: se guarda en Drive, queda en el pedido y el CRM lo puede ver con la clave', () => {
  const env = conProductos();
  const r = env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro' })).json;
  const foto = 'data:image/jpeg;base64,' + Buffer.from('jpegfalso').toString('base64');
  verdad(/^[0-9a-f]{32}$/.test(r.ut), 'el pedido devuelve su clave secreta');
  igual(env.llamar({}, { action: 'subir_comprobante', pedido: r.pedido, data: foto }).json.ok, false, 'sin la clave del pedido no se acepta');
  igual(env.llamar({}, { action: 'subir_comprobante', pedido: r.pedido, ut: 'f'.repeat(32), data: foto }).json.ok, false, 'clave equivocada');
  const up = env.llamar({}, { action: 'subir_comprobante', pedido: r.pedido, ut: r.ut, data: foto }).json;
  igual(up.ok, true);
  verdad(/Ya recibimos/.test(env.llamar({}, { action: 'subir_comprobante', pedido: r.pedido, ut: r.ut, data: foto }).json.error), 'no pisa un comprobante ya subido');
  const sh = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos'), h = sh.rows[0], f = sh.rows[1];
  igual(f[h.indexOf('Estado del pago')], 'Comprobante recibido');
  const idArch = f[h.indexOf('Comprobante')]; verdad(!!idArch);
  igual(env.llamar({ action: 'comprobante_ver', tab: 'Pedidos', id: idArch }).json.error, 'No autorizado');
  igual(env.llamar({ action: 'comprobante_ver', tab: 'Pedidos', id: idArch, auth: env.AUTH }).json.mime, 'image/jpeg');
});

test('comprobante: pedido inexistente o archivo que no es foto/PDF se rechaza', () => {
  const env = conProductos();
  const r = env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro' })).json;
  igual(env.llamar({}, { action: 'subir_comprobante', pedido: 'ctrnoexiste1', data: 'data:image/jpeg;base64,AAAA' }).json.ok, false);
  igual(env.llamar({}, { action: 'subir_comprobante', pedido: r.pedido, ut: r.ut, data: 'data:text/html;base64,AAAA' }).json.ok, false);
});

test('detalle del pago de Mercado Pago: tarjeta, cuotas y lo que te queda', () => {
  const env = entorno();
  igual(env.ctx.detallePagoMP({ payment_type_id: 'credit_card', payment_method_id: 'visa', card: { last_four_digits: '4242' }, installments: 3, transaction_details: { net_received_amount: 95000.4 } }),
    'Tarjeta de crédito Visa · ···· 4242 · 3 cuotas · te queda $95.000');
  igual(env.ctx.detallePagoMP({ payment_type_id: 'account_money', payment_method_id: 'account_money', installments: 1 }), 'Dinero en cuenta de Mercado Pago');
});

test('push: la firma ES256 del aviso es válida (verificada con la criptografía de Node)', () => {
  const env = entorno();
  const v = env.ctx.vapidClaves();
  const jwt = env.ctx.vapidJwt('https://fcm.googleapis.com', v);
  const [hd, cl, sig] = jwt.split('.');
  const pub = Buffer.from(v.pub, 'base64url');
  igual(pub.length, 65);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  verdad(crypto.verify('sha256', Buffer.from(hd + '.' + cl), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'firma inválida');
  igual(JSON.parse(Buffer.from(cl, 'base64url')).aud, 'https://fcm.googleapis.com');
  igual(env.ctx.vapidClaves().pub, v.pub, 'la clave se genera una sola vez');
});

test('push: solo se aceptan servicios de notificación reales y solo con la clave del CRM', () => {
  const env = entorno();
  igual(env.llamar({ action: 'push_suscribir', tab: 'Pedidos', endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }).json.error, 'No autorizado');
  igual(env.llamar({ action: 'push_suscribir', tab: 'Pedidos', endpoint: 'https://malo.com/x', auth: env.AUTH }).json.ok, false);
  igual(env.llamar({ action: 'push_suscribir', tab: 'Pedidos', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', auth: env.AUTH }).json.ok, true);
});

test('push: una compra web avisa a los dispositivos suscriptos', () => {
  const env = conProductos();
  env.llamar({ action: 'push_suscribir', tab: 'Pedidos', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', auth: env.AUTH });
  let enviados = [];
  env.ctx.UrlFetchApp.fetchAll = reqs => { enviados = reqs; return reqs.map(() => ({ getResponseCode: () => 201, getContentText: () => '' })); };
  env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro' }));
  igual(enviados.length, 1); verdad(/^vapid t=.+, k=/.test(enviados[0].headers.Authorization));
  const av = env.llamar({ action: 'push_ultimos', tab: 'Pedidos', auth: env.AUTH }).json.avisos;
  verdad(/transferencia/i.test(av[0].t));
  // El permiso de avisos (lo que guarda la app) solo lee avisos: no abre el resto del CRM.
  const EP = 'https://fcm.googleapis.com/fcm/send/abc';
  const pt = env.llamar({ action: 'push_token', tab: 'Pedidos', auth: env.AUTH, endpoint: EP }).json.pt;
  verdad(/^[0-9a-f]{64}$/.test(pt), 'permiso por dispositivo');
  igual(env.llamar({ action: 'push_ultimos', tab: 'Pedidos', pt }).json.ok, true);
  igual(env.llamar({ action: 'push_ultimos', tab: 'Pedidos', pt: 'otro' }).json.error, 'No autorizado');
  igual(env.llamar({ action: 'list', tab: 'Pedidos', pt }).json.error, 'No autorizado');
  igual(env.llamar({ action: 'push_token', tab: 'Pedidos', endpoint: EP }).json.error, 'No autorizado');
  // Al desactivar el dispositivo, su permiso queda revocado.
  env.llamar({ action: 'push_baja', tab: 'Pedidos', auth: env.AUTH, endpoint: EP });
  igual(env.llamar({ action: 'push_ultimos', tab: 'Pedidos', pt }).json.error, 'No autorizado');
});

test('factura A: CUIT inválido se rechaza; con datos válidos queda en el pedido', () => {
  const env = conProductos();
  const malo = env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro', fa: '1', razon: 'Talleres SRL', cuit: '30710771820', condiva: 'Responsable Inscripto', domfiscal: 'Calle 1, CABA' })).json;
  igual(malo.ok, false); verdad(/factura A/.test(malo.error));
  const ok2 = env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro', cid: 'fact1', fa: '1', razon: 'Talleres SRL', cuit: '30-71077182-7', condiva: 'Responsable Inscripto', domfiscal: 'Calle 1, CABA' })).json;
  igual(ok2.ok, true);
  const sh = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos'), h = sh.rows[0], f = sh.rows[1];
  igual(f[h.indexOf('Facturación')], 'Factura A · Talleres SRL · CUIT 30-71077182-7 · Responsable Inscripto · Calle 1, CABA');
});

test('compra web: el comprador queda en Usuarios, vinculado al pedido, sin duplicarse', () => {
  const env = conProductos();
  env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro', cid: 'uno1' }));
  env.llamar(Object.assign({}, PEDIDO, { zona: 'retiro', cid: 'dos2', fa: '1', razon: 'Ana Pérez SRL', cuit: '30-71077182-7', condiva: 'Responsable Inscripto', domfiscal: 'Calle 1, CABA' }));
  const cli = env.planillas[env.ctx.CRM_ID].getSheetByName('Clientes'), hc = cli.rows[0];
  igual(cli.rows.length - 1, 1, 'un solo usuario aunque compre dos veces');
  const fila = cli.rows[1];
  igual(fila[hc.indexOf('Email')], 'ana@ejemplo.com'); igual(fila[hc.indexOf('CUIT')], '30-71077182-7'); igual(fila[hc.indexOf('Origen')], 'web');
  const ped = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos'), hp = ped.rows[0];
  igual(String(ped.rows[1][hp.indexOf('ClienteID')]), String(fila[0]));
  igual(String(ped.rows[2][hp.indexOf('ClienteID')]), String(fila[0]));
});

// ── v30: categorías y productos nuevos desde el CRM ──
function conRepo() {
  const env = entorno(); const repo = {};
  env.ctx.GH_TOKEN = 'token-de-prueba';
  env.ctx.Utilities.newBlob = (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8'), getBytes: () => [...Buffer.from(b)] });
  env.ctx.Utilities.base64Encode = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  env.ctx.ghApi = (method, path, payload) => {
    const ruta = path.replace(/^contents\//, '').replace(/\?.*$/, '');
    if (method === 'get') return repo[ruta] ? { code: 200, json: { content: repo[ruta].b64, sha: 'sha' + repo[ruta].v } } : { code: 404, json: null };
    repo[ruta] = { b64: payload.content, v: (repo[ruta] ? repo[ruta].v : 0) + 1, msg: payload.message }; return { code: 200, json: {} };
  };
  env.repo = repo; return env;
}
const textoRepo = (env, r) => Buffer.from(env.repo[r].b64, 'base64').toString('utf8');

test('catálogo: nueva categoría y nuevo producto quedan en la web y en la planilla', () => {
  const env = conRepo();
  igual(env.llamar({ action: 'cat_agregar', tab: 'Clientes', nombre: 'Llaves de impacto' }).json.error, 'No autorizado');
  const c = env.llamar({ action: 'cat_agregar', tab: 'Clientes', auth: env.AUTH, nombre: 'Llaves de impacto', existentes: 'pinzas,otros' }).json;
  igual(c.ok, true); igual(c.key, 'llaves-de-impacto');
  const p = env.llamar({ action: 'prod_agregar', tab: 'Clientes', auth: env.AUTH, nombre: 'Llave de Impacto LI-500', categoria: c.key, precio: '$150.000', stock: 'true',
    desc: 'Llave neumática', specs: JSON.stringify([{ l: 'Torque', v: '500 Nm' }, { l: '', v: 'vacío' }]), idmax: '50' }).json;
  igual(p.ok, true); igual(p.producto.id, 51); igual(p.producto.specs.length, 1);
  // la fila nueva en la planilla de precios
  const filas = env.planillas[env.ctx.PRECIOS_ID].getSheetByName('Precios').rows;
  const fila = filas[filas.length - 1]; igual(fila[0], 'Llave de Impacto LI-500'); igual(fila[1], 150000); igual(fila[2], true);
  // el archivo generado suma la categoría (antes de "Otros") y el producto a la web
  const w = { SANOU_CAT_NAMES: { pinzas: 'Crimpadoras', otros: 'Otros' }, SANOU_PRODUCTOS: [{ id: 1, name: 'Pinza' }] };
  vm.runInNewContext(textoRepo(env, 'catalogo-extra.js'), { window: w });
  igual(Object.keys(w.SANOU_CAT_NAMES).join(','), 'pinzas,llaves-de-impacto,otros');
  igual(w.SANOU_PRODUCTOS.length, 2); igual(w.SANOU_PRODUCTOS[1].name, 'Llave de Impacto LI-500'); igual(w.SANOU_PRODUCTOS[1].price, 0);
  // no se repiten nombres
  verdad(/Ya hay un producto/.test(env.llamar({ action: 'prod_agregar', tab: 'Clientes', auth: env.AUTH, nombre: 'Llave de Impacto LI-500', categoria: c.key }).json.error));
  verdad(/Ya existe/.test(env.llamar({ action: 'cat_agregar', tab: 'Clientes', auth: env.AUTH, nombre: 'llaves de impacto' }).json.error));
});

test('catálogo: editar y borrar solo productos agregados desde el CRM', () => {
  const env = conRepo();
  const p = env.llamar({ action: 'prod_agregar', tab: 'Clientes', auth: env.AUTH, nombre: 'Producto Nuevo X1', categoria: 'otros', precio: '1000', idmax: '50' }).json.producto;
  igual(env.llamar({ action: 'prod_editar', tab: 'Clientes', auth: env.AUTH, id: p.id, desc: 'Nueva descripción', badge: 'Nuevo' }).json.producto.desc, 'Nueva descripción');
  // los productos de siempre también se editan (quedan en "ediciones")
  igual(env.llamar({ action: 'prod_editar', tab: 'Clientes', auth: env.AUTH, id: 3, desc: 'Ficha nueva', specs: JSON.stringify([{ l: 'A', v: '1' }, { l: 'B', v: '2' }, { l: 'C', v: '3' }, { l: 'D', v: '4' }]) }).json.ok, true);
  igual(env.llamar({ action: 'prod_borrar', tab: 'Clientes', auth: env.AUTH, id: p.id }).json.ok, true);
  const filas = env.planillas[env.ctx.PRECIOS_ID].getSheetByName('Precios').rows;
  verdad(!filas.some(f => f[0] === 'Producto Nuevo X1'), 'se borró la fila de la planilla');
  verdad(!/Producto Nuevo X1/.test(textoRepo(env, 'catalogo-extra.js')), 'se sacó del catálogo');
});

test('catálogo: producto de siempre → editar ficha, sacar de la web y volver a publicar', () => {
  const env = conRepo();
  env.llamar({ action: 'prod_editar', tab: 'Clientes', auth: env.AUTH, id: 2, desc: 'Nueva "ficha"', badge: 'Oferta', categoria: 'pinzas',
    specs: JSON.stringify([{ l: 'A', v: '1' }, { l: 'B', v: '2' }, { l: 'C', v: '3' }, { l: 'D', v: '4' }]) });
  igual(env.llamar({ action: 'prod_borrar', tab: 'Clientes', auth: env.AUTH, id: 3 }).json.oculto, true);
  const filas = () => env.planillas[env.ctx.PRECIOS_ID].getSheetByName('Precios').rows.length;
  const antes = filas();
  const w = () => { const x = { SANOU_CAT_NAMES: { pinzas: 'P', otros: 'O' }, SANOU_PRODUCTOS: [{ id: 2, name: 'Dos', category: 'pinzas', desc: 'vieja', specs: [] }, { id: 3, name: 'Tres', category: 'pinzas' }] };
    vm.runInNewContext(textoRepo(env, 'catalogo-extra.js'), { window: x }); return x; };
  let x = w();
  igual(x.SANOU_PRODUCTOS.length, 1, 'el 3 sale de la web');
  igual(x.SANOU_BORRADOS[0].id, 3);
  igual(x.SANOU_PRODUCTOS[0].desc, 'Nueva ″ficha″'); igual(x.SANOU_PRODUCTOS[0].badge, 'Oferta');
  igual(x.SANOU_PRODUCTOS[0].allSpecs.length, 4); igual(x.SANOU_PRODUCTOS[0].specs.length, 3, 'la tarjeta muestra las 3 primeras');
  igual(filas(), antes, 'la fila de la planilla queda');
  igual(env.llamar({ action: 'prod_restaurar', tab: 'Clientes', auth: env.AUTH, id: 3 }).json.ok, true);
  x = w(); igual(x.SANOU_PRODUCTOS.length, 2, 'vuelve a la web');
});

test('recorte 3D: solo PNG, con la clave, y se guarda en recortes/<carpeta>.png', () => {
  const env = conRepo();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
  igual(env.llamar({ action: 'recorte_subir', tab: 'Clientes', folder: 'HHY-70A', data: png }).json.error, 'No autorizado');
  verdad(/PNG/.test(env.llamar({ action: 'recorte_subir', tab: 'Clientes', auth: env.AUTH, folder: 'HHY-70A', data: Buffer.from('jpg').toString('base64') }).json.error));
  verdad(/inválido/.test(env.llamar({ action: 'recorte_subir', tab: 'Clientes', auth: env.AUTH, folder: '../x', data: png }).json.error));
  igual(env.llamar({ action: 'recorte_subir', tab: 'Clientes', auth: env.AUTH, folder: 'HHY-70A', data: png }).json.recorte, 'HHY-70A.png');
  verdad(!!env.repo['recortes/HHY-70A.png'], 'quedó en el repo');
});

console.log(`\n${ok} OK, ${fallas} con error`);
process.exit(fallas ? 1 : 0);
