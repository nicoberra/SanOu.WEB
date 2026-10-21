// Generado por el CRM (Productos → Nueva categoría / Nuevo producto). No editar a mano.
window.SANOU_EXTRA = {"categorias":[{"key":"repuestos","nombre":"Repuestos"},{"key":"separador-de-bridas","nombre":"Separador De Bridas"}],"productos":[{"id":51,"name":"Separador De Bridas Hidraulico 10TN HHP-1481","category":"separador-de-bridas","icon":"fa-screwdriver-wrench","badge":"HHP-1481","desc":"VENTAJAS Permite separar bridas de forma controlada y precisa. Reduce el esfuerzo físico del operario. Evita la necesidad de utilizar golpes o herramientas improvisadas. Facilita el mantenimiento de instalaciones industriales. Ideal para trabajos en espacios de acceso reducido. Fabricado con materiales resistentes para trabajos exigentes. APLICACIONES Ideal para utilizar en: Instalaciones de tuberías industriales. Mantenimiento de válvulas y conexiones. Plantas industriales y petroquímicas. Refinerías y sistemas de conducción de fluidos. Talleres de mantenimiento mecánico. Montaje y desmontaje de equipos industriales. CONTENIDO DEL PRODUCTO 1 separador de bridas hidráulico de 10 toneladas. 1 palanca de accionamiento manual. 1 accesorio de separación, según se observa en la imagen.","specs":[{"l":"Presión máxima","v":"700 bar"},{"l":"Apertura inicial de cuña","v":"6 mm"},{"l":"Apertura máxima","v":"81 mm"},{"l":"Capacidad de aceite","v":"70 ml"},{"l":"Peso bruto","v":"11,5 kg"},{"l":"Embalaje","v":"55 × 23 × 12 cm"}],"imgs":0,"folder":"separador-de-bridas-hidraulico-10tn-hhp-","catFolder":"separador-de-bridas","allSpecs":[{"l":"Presión máxima","v":"700 bar"},{"l":"Apertura inicial de cuña","v":"6 mm"},{"l":"Apertura máxima","v":"81 mm"},{"l":"Capacidad de aceite","v":"70 ml"},{"l":"Peso bruto","v":"11,5 kg"},{"l":"Embalaje","v":"55 × 23 × 12 cm"}]}]};
(function () {
  var E = window.SANOU_EXTRA || {}, C = window.SANOU_CAT_NAMES, P = window.SANOU_PRODUCTOS;
  if (!C || !P) return;
  var limpio = function (v) {   // defensa extra: sin < > ` \ y con comillas tipográficas
    if (typeof v === "string") return v.replace(/[<>`\\]/g, "").replace(/"/g, "\u2033").replace(/'/g, "\u2019");
    if (Array.isArray(v)) return v.map(limpio);
    if (v && typeof v === "object") { var o = {}; for (var k in v) o[k] = limpio(v[k]); return o; }
    return v;
  };
  (E.categorias || []).forEach(function (c) {
    if (!c || !/^[a-z0-9-]{1,40}$/.test(String(c.key)) || C[c.key]) return;
    var otros = C.otros; delete C.otros; C[c.key] = limpio(c.nombre); if (otros) C.otros = otros;   // "Otros" siempre al final
  });
  (E.productos || []).forEach(function (p) {
    if (!p || !(parseInt(p.id, 10) > 0) || !/^[a-z0-9-]{1,40}$/.test(String(p.category)) || P.some(function (x) { return x.id === parseInt(p.id, 10); })) return;
    var n = {}; for (var k in p) n[k] = limpio(p[k]); n.id = parseInt(p.id, 10); n.price = 0; n.extra = true; P.push(n);
  });
})();
