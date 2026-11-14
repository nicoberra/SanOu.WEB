// Precio en vivo para las páginas SEO:
//  - Ficha de producto (/producto/*.html): #precioVivo[data-sheet] → precio, transferencia y stock.
//  - Categoría (/categoria/*.html): cada .seo-cat-precio[data-sheet] → precio y transferencia.
// Lee los precios vigentes UNA vez (backend `catalogo` vía catalogo-fuente.js, con timeout y respaldo en
// el Sheet publicado). Nunca precios fijos: si no hay precio, muestra "Consultar precio".
// No bloquea la carga de la página (los precios llegan después y ocupan un lugar ya reservado).
(function () {
    var CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtIfGdbPDoIrVhs0zQPEB_wu_rMGz5280eSTygqqTKpjqaFpcZLWN0fSet_4wKgzcZNNEuk2PfK-i0/pub?output=csv';
    var ficha = document.getElementById('precioVivo');
    var tarjetas = document.querySelectorAll('.seo-cat-precio[data-sheet]');
    if (!ficha && !tarjetas.length) return;

    function parseLine(line) {
        var out = [], cur = '', inQ = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
            else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
        }
        out.push(cur); return out;
    }
    function num(s) { var m = String(s || '').replace(/[.\s$]/g, '').match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
    function fmt(n) { return '$' + Number(n).toLocaleString('es-AR'); }
    function clave(s) { return String(s || '').trim().replace(/^"|"$/g, '').toLowerCase(); }

    // nombre (en minúscula) → { precio, transfer, old, sinStock }
    function indexar(text) {
        var mapa = {}, rows = String(text || '').trim().split('\n').slice(1);
        for (var i = 0; i < rows.length; i++) {
            if (!rows[i].trim()) continue;
            var f = parseLine(rows[i]);
            var transfer = num(f[1]);
            var precio = (window.sanouPrecioLista ? window.sanouPrecioLista(transfer) : transfer);   // precio normal (+10%)
            var stockRaw = (f[2] || '').trim().toLowerCase();
            var old = num(f[3]);
            // Igual que la tienda: sin precio en la planilla → se muestra el de Mercado Libre (sin precio de transferencia)
            if (!(transfer > 0) && old > 0) { precio = old; old = 0; }
            mapa[clave(f[0])] = { precio: precio, transfer: transfer, old: old, sinStock: stockRaw === 'false' || stockRaw === 'no' };
        }
        return mapa;
    }

    function pintarFicha(el, d) {
        if (!d || !(d.precio > 0)) return;   // queda el "Consultar precio" que ya trae la página
        el.innerHTML = '<span class="seo-precio-lbl">Precio</span>'
            + (d.old > d.precio * 1.03 ? '<span class="seo-precio-old">' + fmt(d.old) + '</span>' : '')
            + '<span class="seo-precio-now">' + fmt(d.precio) + '</span>'
            + (d.transfer > 0 && d.transfer < d.precio ? '<span class="seo-precio-transfer">Con transferencia <b>' + fmt(d.transfer) + '</b> · ahorrás ' + fmt(d.precio - d.transfer) + '</span>' : '')
            + (d.sinStock ? '<span class="seo-precio-stock out">Sin stock · Reservalo: entrega en 20 días</span>'
                          : '<span class="seo-precio-stock ok">En stock · envío a todo el país</span>');
        el.classList.add('cargado');
        // Completar el precio en los datos estructurados (Product) para Google
        try {
            var ld = document.getElementById('ld-product');
            if (ld) {
                var j = JSON.parse(ld.textContent);
                if (j.offers) {
                    j.offers.price = String(d.precio);
                    j.offers.priceCurrency = 'ARS';
                    j.offers.availability = d.sinStock ? 'https://schema.org/BackOrder' : 'https://schema.org/InStock';
                }
                ld.textContent = JSON.stringify(j);
            }
        } catch (e) { }
    }
    function pintarTarjeta(el, d) {
        if (!d || !(d.precio > 0)) { el.innerHTML = '<span class="seo-cat-precio-consultar">Consultar precio</span>'; el.classList.add('cargado'); return; }
        el.innerHTML = (d.old > d.precio * 1.03 ? '<span class="seo-cat-precio-old">' + fmt(d.old) + '</span>' : '')
            + '<span class="seo-cat-precio-now">' + fmt(d.precio) + '</span>'
            + (d.transfer > 0 && d.transfer < d.precio ? '<span class="seo-cat-precio-tr">Transferencia <b>' + fmt(d.transfer) + '</b></span>' : '');
        el.classList.add('cargado');
    }
    function sinDatos() {   // sin conexión al backend ni a la planilla: no dejar el lugar "cargando" para siempre
        for (var i = 0; i < tarjetas.length; i++) pintarTarjeta(tarjetas[i], null);
    }

    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    var fuente = (typeof window.sanouCatalogoCsv === 'function') ? window.sanouCatalogoCsv()
        : fetch(CSV, ctrl ? { signal: ctrl.signal } : {}).then(function (r) { return r.text(); });
    fuente.then(function (text) {
        clearTimeout(to);
        var mapa = indexar(text);
        if (ficha) pintarFicha(ficha, mapa[clave(ficha.getAttribute('data-sheet'))]);
        for (var i = 0; i < tarjetas.length; i++) pintarTarjeta(tarjetas[i], mapa[clave(tarjetas[i].getAttribute('data-sheet'))]);
    }).catch(function () { clearTimeout(to); sinDatos(); });
})();
