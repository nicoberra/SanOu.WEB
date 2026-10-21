// Generado por el CRM (Productos → Nueva categoría / Nuevo producto). No editar a mano.
window.SANOU_EXTRA = {"categorias":[{"key":"repuestos","nombre":"Repuestos"},{"key":"separador-de-bridas","nombre":"Separador De Bridas"}],"productos":[]};
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
