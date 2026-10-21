// Generado por el CRM (Productos → Nueva categoría / Nuevo producto). No editar a mano.
window.SANOU_EXTRA = {"categorias":[{"key":"repuestos","nombre":"Repuestos"},{"key":"separador-de-bridas","nombre":"Separador De Bridas"}],"productos":[{"id":51,"name":"Separador De Bridas Hidraulico 10TN HHP-1481","category":"separador-de-bridas","icon":"fa-screwdriver-wrench","badge":"HHP-1481","desc":"VENTAJAS Permite separar bridas de forma controlada y precisa. Reduce el esfuerzo físico del operario. Evita la necesidad de utilizar golpes o herramientas improvisadas. Facilita el mantenimiento de instalaciones industriales. Ideal para trabajos en espacios de acceso reducido. Fabricado con materiales resistentes para trabajos exigentes. APLICACIONES Ideal para utilizar en: Instalaciones de tuberías industriales. Mantenimiento de válvulas y conexiones. Plantas industriales y petroquímicas. Refinerías y sistemas de conducción de fluidos. Talleres de mantenimiento mecánico. Montaje y desmontaje de equipos industriales. CONTENIDO DEL PRODUCTO 1 separador de bridas hidráulico de 10 toneladas. 1 palanca de accionamiento manual. 1 accesorio de separación, según se observa en la imagen.","specs":[{"l":"Presión máxima","v":"700 bar"},{"l":"Apertura inicial de cuña","v":"6 mm"},{"l":"Apertura máxima","v":"81 mm"},{"l":"Capacidad de aceite","v":"70 ml"},{"l":"Peso bruto","v":"11,5 kg"},{"l":"Embalaje","v":"55 × 23 × 12 cm"}],"imgs":0,"folder":"separador-de-bridas-hidraulico-10tn-hhp-","catFolder":"separador-de-bridas","allSpecs":[{"l":"Presión máxima","v":"700 bar"},{"l":"Apertura inicial de cuña","v":"6 mm"},{"l":"Apertura máxima","v":"81 mm"},{"l":"Capacidad de aceite","v":"70 ml"},{"l":"Peso bruto","v":"11,5 kg"},{"l":"Embalaje","v":"55 × 23 × 12 cm"}]},{"id":52,"name":"Matriz De 34mm Para Sacabocados Hhk-8 34","category":"repuestos","icon":"fa-screwdriver-wrench","desc":"","specs":[{"l":"Materiales aptos","v":"Metal"},{"l":"Diámetro mínimo de perforación - Diámetro máximo de perforac","v":"3.4 cm - 3.4 cm"},{"l":"Tamaño","v":"863,6 mm"}],"imgs":0,"folder":"matriz-de-34mm-para-sacabocados-hhk-8-34","catFolder":"repuestos","allSpecs":[{"l":"Materiales aptos","v":"Metal"},{"l":"Diámetro mínimo de perforación - Diámetro máximo de perforac","v":"3.4 cm - 3.4 cm"},{"l":"Tamaño","v":"863,6 mm"}]}]};
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
  var ED = E.ediciones || {}, CAMPOS = ["category", "badge", "desc", "specs", "allSpecs"];   // fichas editadas desde el CRM
  P.forEach(function (x) {
    var e = ED[x.id]; if (!e) return;
    CAMPOS.forEach(function (k) { if (e[k] === undefined) return; if (k === "category" && !/^[a-z0-9-]{1,40}$/.test(String(e[k]))) return; x[k] = limpio(e[k]); });
  });
  var B = (E.borrados || []).map(function (i) { return parseInt(i, 10); });   // sacados de la web desde el CRM
  window.SANOU_BORRADOS = [];
  for (var i = P.length - 1; i >= 0; i--) if (B.indexOf(P[i].id) >= 0) window.SANOU_BORRADOS.unshift(P.splice(i, 1)[0]);
})();
