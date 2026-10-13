// Fuente del catálogo (precios, stock, destacados) para la tienda, el catálogo imprimible y las fichas SEO.
// 1) Lo pide al backend (Apps Script, acción pública "catalogo"): devuelve SOLO las columnas públicas
//    (sin "Costo USD") en el mismo formato CSV que usaba la web, así ningún parser cambia.
// 2) Si el backend no responde (o todavía no tiene la acción), cae al CSV publicado de la planilla.
//    Cuando la planilla quede privada, este respaldo dará error y no se usa.
(function () {
    var EXEC = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';
    var CSV_RESPALDO = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtIfGdbPDoIrVhs0zQPEB_wu_rMGz5280eSTygqqTKpjqaFpcZLWN0fSet_4wKgzcZNNEuk2PfK-i0/pub?output=csv';

    function desdeBackend(ms) {
        return new Promise(function (resolve, reject) {
            var cb = 'catcb_' + Date.now() + Math.floor(Math.random() * 1e5);
            var s = document.createElement('script');
            var to = setTimeout(function () { limpiar(); reject(new Error('timeout')); }, ms);
            function limpiar() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
            window[cb] = function (d) {
                limpiar();
                if (d && d.ok && typeof d.csv === 'string' && d.csv.indexOf('\n') > 0) resolve(d.csv);
                else reject(new Error((d && d.error) || 'sin catálogo'));
            };
            s.onerror = function () { limpiar(); reject(new Error('red')); };
            s.src = EXEC + '?action=catalogo&tab=Clientes&callback=' + cb + '&_=' + Math.floor(Date.now() / 60000);
            (document.body || document.head).appendChild(s);
        });
    }
    function desdeCsv(ms) {
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, ms);
        return fetch(CSV_RESPALDO, { signal: ctrl.signal }).then(function (r) {
            clearTimeout(t);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        });
    }
    var enCurso = null;   // una sola descarga por página aunque la pidan varios scripts
    window.sanouCatalogoCsv = function () {
        if (!enCurso) enCurso = desdeBackend(6000).catch(function () { return desdeCsv(7000); });
        return enCurso;
    };
})();
