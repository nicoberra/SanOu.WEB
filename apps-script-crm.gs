/*  ============================================================
    SAN OU — CRM (backend en Google Sheets)  ·  v2
    ============================================================
    Lee y escribe en la planilla PRIVADA "SanOu CRM".
    Pestañas: Clientes, Cotizaciones, Pedidos, Seguimientos.

    Cada columna tiene una CLAVE simple (para la API, sin símbolos)
    y un TÍTULO lindo (el que se ve en la planilla).

    Se implementa como Aplicación Web (Ejecutar como: Yo / Acceso:
    Cualquier usuario). Las pestañas se crean solas.
    ============================================================ */

var CRM_ID = '12RjmHKOV3LvvN6kA04b9bf92k-dkvXS5C8qenNGHHKw';

// Planilla de precios de la web (Nombre | Precios | Stock | Precio ML | DESTACADO)
var PRECIOS_ID = '1Jzs6_Rp0h4yHm7u786mcqqHPWLpwjMcnj6gZRxuJ67w';

// Cada columna: k = clave para la API, h = título que se ve en la planilla.
var TABS = {
  'Clientes': [
    { k: 'id',        h: 'id' },
    { k: 'fecha',     h: 'Fecha' },
    { k: 'nombre',    h: 'Nombre' },
    { k: 'telefono',  h: 'Teléfono' },
    { k: 'email',     h: 'Email' },
    { k: 'empresa',   h: 'Empresa / Rubro' },
    { k: 'ciudad',    h: 'Ciudad' },
    { k: 'notas',     h: 'Notas' },
    { k: 'razon',     h: 'Razón social' },
    { k: 'cuit',      h: 'CUIT' },
    { k: 'direccion', h: 'Dirección' },
    { k: 'origen',    h: 'Origen' }
  ],
  'Cotizaciones': [
    { k: 'id',       h: 'id' },
    { k: 'fecha',    h: 'Fecha' },
    { k: 'cliente',  h: 'Cliente' },
    { k: 'telefono', h: 'Teléfono' },
    { k: 'detalle',  h: 'Detalle' },
    { k: 'monto',    h: 'Monto' },
    { k: 'estado',   h: 'Estado' },
    { k: 'notas',    h: 'Notas' }
  ],
  'Pedidos': [
    { k: 'id',           h: 'id' },
    { k: 'fecha',        h: 'Fecha' },
    { k: 'cliente',      h: 'Cliente' },
    { k: 'telefono',     h: 'Teléfono' },
    { k: 'detalle',      h: 'Detalle' },
    { k: 'monto',        h: 'Monto' },
    { k: 'estado',       h: 'Estado' },
    { k: 'notas',        h: 'Notas' },
    { k: 'envio',        h: 'Envío' },
    { k: 'enviocobrado', h: 'Envío cobrado' },
    { k: 'enviomonto',   h: 'Monto envío' }
  ],
  'Seguimientos': [
    { k: 'id',       h: 'id' },
    { k: 'fecha',    h: 'Fecha' },
    { k: 'cliente',  h: 'Cliente' },
    { k: 'telefono', h: 'Teléfono' },
    { k: 'motivo',   h: 'Motivo' },
    { k: 'objetivo', h: 'Fecha objetivo' },
    { k: 'estado',   h: 'Estado' },
    { k: 'notas',    h: 'Notas' }
  ]
};

function doGet(e)  { return manejar(e); }
function doPost(e) { return manejar(e); }

function manejar(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var out;
  try {
    var accion = p.action || 'list';
    var tab    = p.tab || 'Clientes';
    if (!TABS[tab]) throw 'Pestaña inválida: ' + tab;

    if      (accion === 'list')   out = { ok: true, rows: listar(tab) };
    else if (accion === 'add')    out = { ok: true, id: agregar(tab, p) };
    else if (accion === 'update') out = { ok: true, updated: actualizar(tab, p) };
    else if (accion === 'delete') out = { ok: true, deleted: borrar(tab, p.id) };
    else if (accion === 'productos_list') out = { ok: true, rows: productosListar() };
    else if (accion === 'productos_save') out = { ok: true, saved: productosGuardar(p) };
    else throw 'Acción desconocida: ' + accion;
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return responder(out, p.callback);
}

function responder(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function hoja(tab) {
  var ss = SpreadsheetApp.openById(CRM_ID);
  var sh = ss.getSheetByName(tab);
  var titulos = TABS[tab].map(function (c) { return c.h; });
  if (!sh) {
    sh = ss.insertSheet(tab);
    sh.appendRow(titulos);
    sh.getRange(1, 1, 1, titulos.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < titulos.length) {
    // Si agregamos columnas nuevas, completar la fila de títulos (sin tocar los datos).
    sh.getRange(1, 1, 1, titulos.length).setValues([titulos]);
    sh.getRange(1, 1, 1, titulos.length).setFontWeight('bold');
  }
  return sh;
}

// Devuelve array de objetos con las CLAVES simples: {id, fecha, nombre, ...}
function listar(tab) {
  var sh = hoja(tab);
  var cols = TABS[tab];
  var datos = sh.getDataRange().getValues();
  var filas = [];
  for (var i = 1; i < datos.length; i++) {
    if (!datos[i][0] && !datos[i][2]) continue;
    var o = {};
    for (var c = 0; c < cols.length; c++) {
      var v = datos[i][c];
      o[cols[c].k] = (v instanceof Date)
        ? Utilities.formatDate(v, 'GMT-3', 'yyyy-MM-dd HH:mm')
        : v;
    }
    filas.push(o);
  }
  return filas;
}

function agregar(tab, p) {
  var sh = hoja(tab);
  var cols = TABS[tab];

  // En Clientes: no duplicar. Busca coincidencia por email, si no por CUIT,
  // si no (cuando no hay email ni CUIT) por nombre. Si existe, actualiza esa fila.
  if (tab === 'Clientes') {
    var idx = {};
    for (var c = 0; c < cols.length; c++) idx[cols[c].k] = c;
    var datos = sh.getDataRange().getValues();
    var soloDig = function(x){ return String(x || '').replace(/\D/g, ''); };
    var match = -1;
    for (var i = 1; i < datos.length && match < 0; i++) {
      if (p.email && idx.email != null && String(datos[i][idx.email]).trim().toLowerCase() === String(p.email).trim().toLowerCase())
        match = i;
      else if (!p.email && p.cuit && idx.cuit != null && soloDig(datos[i][idx.cuit]) && soloDig(datos[i][idx.cuit]) === soloDig(p.cuit))
        match = i;
      else if (!p.email && !p.cuit && p.nombre && idx.nombre != null && String(datos[i][idx.nombre]).trim().toLowerCase() === String(p.nombre).trim().toLowerCase())
        match = i;
    }
    if (match >= 0) {
      for (var c2 = 0; c2 < cols.length; c2++) {
        var k = cols[c2].k;
        if (k !== 'id' && k !== 'fecha' && p[k]) sh.getRange(match + 1, c2 + 1).setValue(p[k]);
      }
      return String(datos[match][0]);
    }
  }

  var id = 'r' + Date.now() + Math.floor(Math.random() * 1000);
  var fila = cols.map(function (c) {
    if (c.k === 'id')    return id;
    if (c.k === 'fecha') return p.fecha || new Date();
    return p[c.k] || '';
  });
  sh.appendRow(fila);
  return id;
}

function actualizar(tab, p) {
  var sh = hoja(tab);
  var cols = TABS[tab];
  var datos = sh.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(p.id)) {
      for (var c = 0; c < cols.length; c++) {
        if (cols[c].k !== 'id' && p[cols[c].k] !== undefined) {
          sh.getRange(i + 1, c + 1).setValue(p[cols[c].k]);
        }
      }
      return true;
    }
  }
  return false;
}

function borrar(tab, id) {
  var sh = hoja(tab);
  var datos = sh.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ══════════ PRODUCTOS (planilla de precios de la web) ══════════
// Busca la pestaña cuyo encabezado empieza con "Nombre".
function hojaProductos() {
  var ss = SpreadsheetApp.openById(PRECIOS_ID);
  var hojas = ss.getSheets();
  var sh = hojas[0];
  for (var i = 0; i < hojas.length; i++) {
    if (String(hojas[i].getRange(1, 1).getValue()).trim().toLowerCase() === 'nombre') { sh = hojas[i]; break; }
  }
  // Asegurar el encabezado de la columna F (Costo USD) sin tocar los datos.
  if (!sh.getRange(1, 6).getValue()) sh.getRange(1, 6).setValue('Costo USD');
  return sh;
}

function esVerdadero(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE' || String(v).trim().toLowerCase() === 'si';
}

// Devuelve todos los productos: nombre, precio, stock, ml, destacado
function productosListar() {
  var sh = hojaProductos();
  var datos = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < datos.length; i++) {
    var nombre = String(datos[i][0]).trim();
    if (!nombre) continue;
    out.push({
      nombre:    nombre,
      precio:    datos[i][1],
      stock:     esVerdadero(datos[i][2]),
      ml:        datos[i][3],
      destacado: esVerdadero(datos[i][4]),
      costousd:  datos[i][5]
    });
  }
  return out;
}

// Guarda los campos enviados de un producto (lo busca por nombre exacto).
function productosGuardar(p) {
  var sh = hojaProductos();
  var datos = sh.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(p.nombre).trim()) {
      if (p.precio    !== undefined) sh.getRange(i + 1, 2).setValue(formatearPrecio(p.precio));
      if (p.stock     !== undefined) sh.getRange(i + 1, 3).setValue(esVerdadero(p.stock));
      if (p.ml        !== undefined) sh.getRange(i + 1, 4).setValue(formatearPrecio(p.ml));
      if (p.destacado !== undefined) sh.getRange(i + 1, 5).setValue(esVerdadero(p.destacado));
      if (p.costousd  !== undefined) sh.getRange(i + 1, 6).setValue(numeroUsd(p.costousd));
      return true;
    }
  }
  return false;
}

// Formatea a "$72.500" (con signo y puntos de miles). Vacío queda vacío.
function formatearPrecio(v) {
  var s = String(v).replace(/[^\d]/g, '');
  if (!s) return '';
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$' + s;
}

// Número en USD (permite decimales). Vacío queda vacío.
function numeroUsd(v) {
  var s = String(v).replace(/[^\d.]/g, '');
  return s ? parseFloat(s) : '';
}
