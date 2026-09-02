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

// Cada columna: k = clave para la API, h = título que se ve en la planilla.
var TABS = {
  'Clientes': [
    { k: 'id',       h: 'id' },
    { k: 'fecha',    h: 'Fecha' },
    { k: 'nombre',   h: 'Nombre' },
    { k: 'telefono', h: 'Teléfono' },
    { k: 'email',    h: 'Email' },
    { k: 'empresa',  h: 'Empresa / Rubro' },
    { k: 'ciudad',   h: 'Ciudad' },
    { k: 'notas',    h: 'Notas' }
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
    { k: 'id',       h: 'id' },
    { k: 'fecha',    h: 'Fecha' },
    { k: 'cliente',  h: 'Cliente' },
    { k: 'telefono', h: 'Teléfono' },
    { k: 'detalle',  h: 'Detalle' },
    { k: 'monto',    h: 'Monto' },
    { k: 'estado',   h: 'Estado' },
    { k: 'notas',    h: 'Notas' }
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
  if (!sh) {
    var titulos = TABS[tab].map(function (c) { return c.h; });
    sh = ss.insertSheet(tab);
    sh.appendRow(titulos);
    sh.getRange(1, 1, 1, titulos.length).setFontWeight('bold');
    sh.setFrozenRows(1);
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
