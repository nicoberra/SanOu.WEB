// Atribución de campañas: si la visita llega con utm_* en la URL (por ejemplo desde el mensaje automático
// de Instagram: ?utm_source=instagram&utm_medium=dm&utm_campaign=lista), se guardan en la SESIÓN del
// navegador (sessionStorage) y después viajan con el pedido o el presupuesto. Gana la última campaña.
// window.sanouUtm() → { utm_source, utm_medium, utm_campaign, landing } (o {} si no hubo campaña).
(function () {
    var K = 'sanou_utm';
    var limpio = function (v) { return String(v || '').toLowerCase().replace(/[^a-z0-9_.\-]/g, '').slice(0, 60); };
    try {
        var q = new URLSearchParams(location.search);
        var u = { utm_source: limpio(q.get('utm_source')), utm_medium: limpio(q.get('utm_medium')), utm_campaign: limpio(q.get('utm_campaign')) };
        if (u.utm_source || u.utm_medium || u.utm_campaign) {
            u.landing = location.pathname.replace(/[^\w\-./]/g, '').slice(0, 80);
            sessionStorage.setItem(K, JSON.stringify(u));
        }
    } catch (e) { /* sin sessionStorage (modo privado estricto): la compra sigue igual, sin campaña */ }
    window.sanouUtm = function () {
        try {
            var u = JSON.parse(sessionStorage.getItem(K) || '{}') || {};
            return { utm_source: limpio(u.utm_source), utm_medium: limpio(u.utm_medium), utm_campaign: limpio(u.utm_campaign), landing: String(u.landing || '').slice(0, 80) };
        } catch (e) { return {}; }
    };
    // Solo los 3 campos utm (para mandar al backend con un pedido o presupuesto).
    window.sanouUtmParams = function () {
        var u = window.sanouUtm(), out = {};
        ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { if (u[k]) out[k] = u[k]; });
        return out;
    };
})();
