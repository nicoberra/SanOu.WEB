// Precio en vivo para las fichas SEO de producto (/producto/*.html).
// Lee el mismo Google Sheet publicado que la tienda y completa el precio real.
// Si no hay precio, deja el texto de "Consultar precio" que ya trae la página.
(function () {
    var CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtIfGdbPDoIrVhs0zQPEB_wu_rMGz5280eSTygqqTKpjqaFpcZLWN0fSet_4wKgzcZNNEuk2PfK-i0/pub?output=csv';
    var el = document.getElementById('precioVivo');
    if (!el) return;
    var sheet = (el.getAttribute('data-sheet') || '').trim().toLowerCase();
    if (!sheet) return;

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

    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 8000);
    fetch(CSV, { signal: ctrl.signal }).then(function (r) { return r.text(); }).then(function (text) {
        clearTimeout(to);
        var rows = text.trim().split('\n').slice(1);
        for (var i = 0; i < rows.length; i++) {
            if (!rows[i].trim()) continue;
            var f = parseLine(rows[i]);
            var nombre = (f[0] || '').trim().replace(/^"|"$/g, '').toLowerCase();
            if (nombre !== sheet) continue;
            var precio = num(f[1]);
            var old = num(f[3]);
            var stockRaw = (f[2] || '').trim().toLowerCase();
            var sinStock = (stockRaw === 'false' || stockRaw === 'no');
            if (precio > 0) {
                el.innerHTML = '<span class="seo-precio-lbl">Precio</span>'
                    + (old > precio ? '<span class="seo-precio-old">' + fmt(old) + '</span>' : '')
                    + '<span class="seo-precio-now">' + fmt(precio) + '</span>'
                    + (sinStock ? '<span class="seo-precio-stock out">Sin stock · reingreso en ~90 días</span>'
                                : '<span class="seo-precio-stock ok">En stock · envío a todo el país</span>');
                el.classList.add('cargado');
                // Completar el precio en los datos estructurados (Product) para Google
                try {
                    var ld = document.getElementById('ld-product');
                    if (ld) {
                        var j = JSON.parse(ld.textContent);
                        if (j.offers) {
                            j.offers.price = String(precio);
                            j.offers.priceCurrency = 'ARS';
                            j.offers.availability = sinStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
                        }
                        ld.textContent = JSON.stringify(j);
                    }
                } catch (e) { }
            }
            return;
        }
    }).catch(function () { clearTimeout(to); });
})();
