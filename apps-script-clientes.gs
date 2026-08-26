/*  ============================================================
    SAN OU — Registro de clientes en Google Sheets
    ============================================================
    Guarda cada cliente que se registra en la web en una pestaña
    "Clientes" DENTRO del mismo archivo "Precios web".

    CÓMO INSTALARLO (una sola vez):
    1. Abrí tu Sheet "Precios web".
    2. Menú: Extensiones → Apps Script.
    3. Borrá lo que haya y pegá TODO este archivo.
    4. Guardá (ícono del disquete).
    5. Botón azul "Implementar" → "Nueva implementación".
    6. Tipo: "Aplicación web".
         - Ejecutar como: Yo (tu cuenta)
         - Quién tiene acceso: "Cualquier usuario"
    7. "Implementar" → autorizá los permisos que pida.
    8. Copiá la URL que termina en /exec y pasásela a Claude.

    La pestaña "Clientes" se crea sola la primera vez.
    ============================================================ */

var HOJA = 'Clientes';
var CABECERAS = ['Fecha', 'Nombre', 'Email', 'Teléfono', 'Empresa / Rubro', 'Ciudad', 'Origen'];

function doGet(e)  { return manejar(e); }
function doPost(e) { return manejar(e); }

function manejar(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HOJA);
    if (!sh) {
      sh = ss.insertSheet(HOJA);
      sh.appendRow(CABECERAS);
      sh.getRange(1, 1, 1, CABECERAS.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }

    var p = (e && e.parameter) ? e.parameter : {};
    var email = String(p.email || '').trim();
    if (!email) return responder({ ok: false, error: 'Falta el email' });

    var fila = [
      new Date(),
      String(p.nombre   || '').trim(),
      email,
      String(p.telefono || '').trim(),
      String(p.empresa  || '').trim(),
      String(p.ciudad   || '').trim(),
      String(p.origen   || 'web').trim()
    ];

    // Evitar duplicados: si el email ya existe, actualiza esa fila en vez de duplicar.
    var datos = sh.getDataRange().getValues();
    var filaExistente = -1;
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][2]).trim().toLowerCase() === email.toLowerCase()) {
        filaExistente = i + 1;
        break;
      }
    }

    if (filaExistente > 0) {
      sh.getRange(filaExistente, 1, 1, fila.length).setValues([fila]);
    } else {
      sh.appendRow(fila);
    }

    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
