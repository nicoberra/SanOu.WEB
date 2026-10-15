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
  const ctx = {
    console,
    SpreadsheetApp: { openById: id => planillas[id] || (planillas[id] = new Planilla([])) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null) }) },
    ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: t => ({ texto: t, setMimeType(m) { this.mime = m; return this; } }) },
    Utilities: {
      formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 16).replace('T', ' '),
      base64Encode: s => Buffer.from(String(s)).toString('base64'),
      base64Decode: s => Buffer.from(String(s), 'base64'),
      newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
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
  return { ctx, planillas, cache, fetches, llamar, props, AUTH: props.PANEL_PASS_HASH };
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
  const fila = env.planillas[env.ctx.CRM_ID].getSheetByName('Pedidos').rows[1].join(' | ');
  verdad(/Calle 123/.test(fila) && /DNI 30111222/.test(fila) && /CP 1708/.test(fila));
});

test('transferencia: doble clic con el mismo cid NO duplica el pedido', () => {
  const env = conProductos();
  const p = Object.assign({}, PEDIDO, { zona: 'retiro' });
  env.llamar(p); const b = env.llamar(p).json;
  igual(b.ok, true); igual(filasDe(env, 'Pedidos'), 1);
});

console.log(`\n${ok} OK, ${fallas} con error`);
process.exit(fallas ? 1 : 0);
