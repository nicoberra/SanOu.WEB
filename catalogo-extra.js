// Generado por el CRM (Productos → Nueva categoría / Nuevo producto). No editar a mano.
window.SANOU_EXTRA = {"categorias":[],"productos":[]};
(function () {
  var E = window.SANOU_EXTRA || {}, C = window.SANOU_CAT_NAMES, P = window.SANOU_PRODUCTOS;
  if (!C || !P) return;
  (E.categorias || []).forEach(function (c) {
    if (!c || !c.key || C[c.key]) return;
    var otros = C.otros; delete C.otros; C[c.key] = c.nombre; if (otros) C.otros = otros;   // "Otros" siempre al final
  });
  (E.productos || []).forEach(function (p) {
    if (!p || !p.id || P.some(function (x) { return x.id === p.id; })) return;
    var n = {}; for (var k in p) n[k] = p[k]; n.price = 0; n.extra = true; P.push(n);
  });
})();
