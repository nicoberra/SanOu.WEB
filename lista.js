// lista.html — Lista de precios para leads de Instagram (palabra clave LISTA).
// 1) Dibuja YA la lista con los datos locales del catálogo ("Consultar precio") y después completa los
//    precios vigentes del backend `catalogo` (catalogo-fuente.js, con timeout y respaldo). Nunca precios fijos.
// 2) Guía de pinzas: sale de los rangos "Rango de crimpado" de las fichas (no se inventan cifras).
// 3) Formulario "Te asesoramos": guarda el lead en el CRM (acción lead_add) y ofrece seguir por WhatsApp.
(function () {
    'use strict';
    var EXEC = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';
    var WA = '5491131751517';
    var T0 = Date.now();
    var P = (window.SANOU_PRODUCTOS || []).slice();
    var CATS = window.SANOU_CAT_NAMES || {};
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); };
    var slug = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
    var ficha = function (p) { return '/producto/' + slug(p.name) + '-' + p.id + '.html'; };
    var fmt = function (n) { return '$' + Number(n).toLocaleString('es-AR'); };
    var precios = {};   // id → { lista, transfer, stock }

    // ── Familias (en el orden de las categorías de la tienda; "Otros" al final) ──
    function familias() {
        var orden = Object.keys(CATS), out = [];
        orden.forEach(function (k) {
            var items = P.filter(function (p) { return p.category === k; });
            if (items.length) out.push({ key: k, nombre: CATS[k], items: items });
        });
        return out;
    }
    function desde(items) {
        var v = items.map(function (p) { return precios[p.id] && precios[p.id].lista; }).filter(function (x) { return x > 0; });
        return v.length ? Math.min.apply(null, v) : 0;
    }
    function celdaPrecio(p) {
        var x = precios[p.id];
        if (!x || !(x.lista > 0)) return '<span class="lp-consultar">Consultar precio</span>';
        return '<span class="lp-precio">' + fmt(x.lista) + '</span>' +
            (x.transfer > 0 && x.transfer < x.lista ? '<span class="lp-transfer">Transferencia ' + fmt(x.transfer) + '</span>' : '');
    }
    function stockTxt(p) {
        var x = precios[p.id];
        if (!x || x.stock === null) return '';
        return x.stock ? '<span class="lp-stock ok">En stock</span>' : '<span class="lp-stock res">A reserva · 20 días</span>';
    }

    function pintarLista() {
        var fams = familias();
        $('lpIndice').innerHTML = fams.map(function (f) {
            var d = desde(f.items);
            return '<a class="lp-chip" href="#fam-' + esc(f.key) + '">' + esc(f.nombre) + (d ? ' <b>desde ' + fmt(d) + '</b>' : '') + '</a>';
        }).join('');
        var abiertas = {};
        document.querySelectorAll('.lp-fam[open]').forEach(function (d) { abiertas[d.id] = 1; });
        var primera = !document.querySelector('.lp-fam');
        $('lpLista').innerHTML = fams.map(function (f, i) {
            var id = 'fam-' + f.key, d = desde(f.items);
            var abierta = primera ? i === 0 : !!abiertas[id];
            return '<details class="lp-fam" id="' + esc(id) + '"' + (abierta ? ' open' : '') + '>' +
                '<summary><span class="lp-fam-nombre">' + esc(f.nombre) + '</span><span class="lp-fam-meta">' + f.items.length + (f.items.length === 1 ? ' producto' : ' productos') +
                (d ? ' · desde <b>' + fmt(d) + '</b>' : '') + '</span><i class="fas fa-chevron-down" aria-hidden="true"></i></summary>' +
                '<ul class="lp-items">' + f.items.map(function (p) {
                    return '<li class="lp-item"><a class="lp-item-nombre" href="' + ficha(p) + '">' + esc(p.name) + '</a>' +
                        '<span class="lp-item-meta">' + (p.badge ? '<span class="lp-badge">' + esc(p.badge) + '</span>' : '') + stockTxt(p) + '</span>' +
                        '<span class="lp-item-precio">' + celdaPrecio(p) + '</span></li>';
                }).join('') + '</ul></details>';
        }).join('');
    }

    // ── Guía de pinzas: rango "A–B mm²" de cada ficha ──
    function rangoDe(p) {
        var specs = (p.allSpecs || []).concat(p.specs || []);
        for (var i = 0; i < specs.length; i++) {
            if (!/rango de crimpado/i.test(specs[i].l)) continue;
            var m = String(specs[i].v).match(/(\d+(?:[.,]\d+)?)\s*[–\-a]+\s*(\d+(?:[.,]\d+)?)\s*mm/i);
            if (m) return { min: parseFloat(m[1].replace(',', '.')), max: parseFloat(m[2].replace(',', '.')), txt: specs[i].v };
        }
        return null;
    }
    function matricesDe(p) {   // medidas de matrices que figuran en la ficha (para el selector)
        var out = [];
        (p.allSpecs || []).concat(p.specs || []).forEach(function (s) {
            if (/matrices incluidas/i.test(s.l) && /mm/i.test(s.v)) String(s.v).replace(/mm.*$/i, '').split('/').forEach(function (x) { var n = parseFloat(x); if (n > 0) out.push(n); });
        });
        return out;
    }
    var PINZAS = P.filter(function (p) { return p.category === 'pinzas'; }).map(function (p) { return { p: p, r: rangoDe(p) }; }).filter(function (x) { return x.r; });
    function filasGuia() {
        var grupos = {};
        PINZAS.forEach(function (x) { var k = x.r.min + '-' + x.r.max; (grupos[k] = grupos[k] || { r: x.r, items: [] }).items.push(x.p); });
        return Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) { return a.r.max - b.r.max || a.r.min - b.r.min; });
    }
    function pintarGuia() {
        var sel = $('lpSeccion'), s = parseFloat(sel.value) || 0;
        var filas = filasGuia(), mejor = null;
        if (s) filas.forEach(function (f) { if (s >= f.r.min && s <= f.r.max && (!mejor || f.r.max < mejor.r.max)) mejor = f; });
        $('lpGuia').querySelector('tbody').innerHTML = filas.map(function (f) {
            var cubre = s && s >= f.r.min && s <= f.r.max;
            var cls = !s ? '' : (f === mejor ? ' class="lp-mejor"' : (cubre ? ' class="lp-cubre"' : ' class="lp-no"'));
            return '<tr' + cls + '><td data-label="Sección"><b>' + esc(f.r.txt) + '</b>' + (f === mejor ? '<span class="lp-reco">Recomendada</span>' : '') + '</td>' +
                '<td data-label="Modelo">' + f.items.map(function (p) { return '<a href="' + ficha(p) + '">' + esc(p.name.replace(/^Pinza Hidráulica\s*/i, '')) + ' <i class="fas fa-arrow-right" aria-hidden="true"></i></a>'; }).join('') + '</td>' +
                '<td data-label="Precio">' + f.items.map(function (p) { return '<span class="lp-guia-precio">' + celdaPrecio(p) + '</span>'; }).join('') + '</td></tr>';
        }).join('');
        $('lpGuiaNota').textContent = s && !mejor ? 'Ninguna de nuestras pinzas cubre ' + s + ' mm². Escribinos y lo vemos.' :
            (s ? 'La recomendada es la de rango más ajustado que cubre ' + s + ' mm². Las demás marcadas también sirven.' : '');
    }
    function prepararGuia() {
        var medidas = {};
        PINZAS.forEach(function (x) { matricesDe(x.p).concat([x.r.min, x.r.max]).forEach(function (n) { medidas[n] = 1; }); });
        var sel = $('lpSeccion');
        Object.keys(medidas).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
            var o = document.createElement('option'); o.value = n; o.textContent = n + ' mm²'; sel.appendChild(o);
        });
        sel.addEventListener('change', pintarGuia);
        pintarGuia();
    }

    // ── Precios vigentes (backend `catalogo`, con timeout y respaldo en catalogo-fuente.js) ──
    function parseLinea(line) {
        var out = [], cur = '', q = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
            else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
        }
        out.push(cur); return out;
    }
    var num = function (s) { var d = String(s || '').replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : 0; };
    function cargarPrecios() {
        if (typeof window.sanouCatalogoCsv !== 'function') return;
        window.sanouCatalogoCsv().then(function (csv) {
            var porNombre = {};
            P.forEach(function (p) { porNombre[(p.sheetName || p.name).toLowerCase()] = p; });
            csv.trim().split('\n').slice(1).forEach(function (row) {
                if (!row.trim()) return;
                var f = parseLinea(row), p = porNombre[String(f[0] || '').trim().toLowerCase()];
                if (!p) return;
                var transfer = num(f[1]), st = String(f[2] || '').trim().toLowerCase();
                var lista = transfer > 0 && window.sanouPrecioLista ? window.sanouPrecioLista(transfer) : 0;
                if (!lista && num(f[3]) > 0) lista = num(f[3]);   // sin precio propio: precio de referencia (como la tienda)
                precios[p.id] = { lista: lista, transfer: transfer, stock: st ? (st === 'true' || st === 'si') : null };
            });
            pintarLista(); pintarGuia();
            var hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
            $('lpFecha').textContent = 'Precios vigentes al ' + hoy + '.';
        }).catch(function () {
            $('lpFecha').textContent = 'No pudimos traer los precios ahora: consultalos por WhatsApp o recargá la página.';
        });
    }

    // ── Formulario "Te asesoramos" → lead en el CRM + WhatsApp con el texto armado ──
    function jsonp(params, ms) {
        return new Promise(function (resolve, reject) {
            var cb = 'lead_' + Date.now() + Math.floor(Math.random() * 1e5), s = document.createElement('script');
            var to = setTimeout(function () { fin(); reject(new Error('timeout')); }, ms);
            function fin() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
            window[cb] = function (d) { fin(); resolve(d); };
            s.onerror = function () { fin(); reject(new Error('red')); };
            s.src = EXEC + '?' + new URLSearchParams(Object.assign({}, params, { callback: cb, _: Date.now() })).toString();
            document.body.appendChild(s);
        });
    }
    function textoWa(d) {
        return 'Hola San Ou! Soy ' + d.nombre + (d.rubro ? ' (' + d.rubro.toLowerCase() + ')' : '') + '. Vi la lista de precios y quiero asesoramiento' +
            (d.trabajo ? ': ' + d.trabajo : '.');
    }
    function estado(txt, tipo) { var e = $('lpEstado'); e.textContent = txt; e.className = 'lp-estado' + (tipo ? ' ' + tipo : ''); }
    function prepararForm() {
        var f = $('lpForm');
        f.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var d = { nombre: $('lpNombre').value.trim(), whatsapp: $('lpWa').value.trim(), rubro: $('lpRubro').value, trabajo: $('lpTrabajo').value.trim() };
            var dig = d.whatsapp.replace(/\D/g, '').replace(/^0+/, '');
            if (d.nombre.length < 2) { estado('Escribí tu nombre.', 'error'); $('lpNombre').focus(); return; }
            if (dig.length < 8 || dig.length > 15) { estado('Revisá el WhatsApp: con código de área, sin 0 ni 15.', 'error'); $('lpWa').focus(); return; }
            if (!d.rubro) { estado('Elegí tu rubro.', 'error'); $('lpRubro').focus(); return; }
            var btn = $('lpEnviar'); btn.disabled = true; btn.querySelector('span').textContent = 'Enviando…';
            estado('');
            var wa = $('lpWaBtn');
            wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(textoWa(d));
            var params = Object.assign({ action: 'lead_add', tab: 'Clientes', pagina: location.pathname, t: String(Date.now() - T0),
                web: (f.querySelector('.lp-trampa') || {}).value || '' }, d, window.sanouUtmParams ? window.sanouUtmParams() : {});
            jsonp(params, 15000).then(function (r) {
                if (!r || r.ok !== true) throw new Error((r && r.error) || 'Sin respuesta');
                estado('¡Listo! Guardamos tu consulta. Seguí por WhatsApp y te respondemos enseguida.', 'ok');
                f.classList.add('enviado'); btn.hidden = true;
                if (typeof gtag === 'function') gtag('event', 'generate_lead', { method: 'lista', rubro: d.rubro });
            }).catch(function (err) {
                var m = String(err && err.message || '');
                estado((/timeout|red/.test(m) ? 'No pudimos guardar tu consulta (sin conexión).' : m) + ' Escribinos directo por WhatsApp:', 'error');
                btn.disabled = false; btn.querySelector('span').textContent = 'Reintentar';
            }).then(function () { wa.hidden = false; });
        });
    }

    pintarLista();
    prepararGuia();
    prepararForm();
    cargarPrecios();
})();
