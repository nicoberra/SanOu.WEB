// Píxel de Meta de San Ou (ID 1127043932906305, portfolio "San Ou nicolas").
// - PageView en cada página.
// - Copia a Meta los eventos de compra que la web ya manda a GA4 (gtag):
//   view_item → ViewContent, add_to_cart → AddToCart, begin_checkout → InitiateCheckout, purchase → Purchase.
// - En las páginas /producto/ manda ViewContent al abrirlas.
// Se carga justo después del gtag de GA4 para poder envolver window.gtag.
(function () {
    if (window.fbq) return;
    !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '1127043932906305');
    fbq('track', 'PageView');

    var MAPA = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase' };

    function datos(p) {
        p = p || {};
        var items = Array.isArray(p.items) ? p.items : [];
        var valor = Number(p.value);
        if (!valor && items.length) valor = items.reduce(function (s, i) { return s + (Number(i.price) || 0) * (Number(i.quantity) || 1); }, 0);
        var d = { currency: p.currency || 'ARS', value: Math.round(valor || 0) };
        if (items.length) {
            d.content_type = 'product';
            d.content_ids = items.map(function (i) { return String(i.item_id || i.item_name); });
            d.contents = items.map(function (i) { return { id: String(i.item_id || i.item_name), quantity: Number(i.quantity) || 1 }; });
            if (items.length === 1 && items[0].item_name) d.content_name = items[0].item_name;
        }
        return d;
    }

    // Envía un evento de compra a Meta (también lo usa checkout.js para el pedido por transferencia).
    window.sanouMeta = function (evento, d, idEvento) {
        try { fbq('track', evento, d, idEvento ? { eventID: idEvento } : undefined); } catch (e) {}
    };

    var original = window.gtag;
    if (typeof original === 'function') {
        window.gtag = function () {
            try {
                if (arguments[0] === 'event' && MAPA[arguments[1]]) {
                    var p = arguments[2] || {};
                    window.sanouMeta(MAPA[arguments[1]], datos(p), p.transaction_id ? 'compra-' + p.transaction_id : null);
                }
            } catch (e) {}
            return original.apply(this, arguments);
        };
    }

    // Páginas de producto (SEO): ViewContent con el nombre del producto.
    if (/\/producto\//.test(location.pathname)) {
        var h1 = document.querySelector('h1');
        var nombre = (h1 && h1.textContent.trim()) || document.title.split('—')[0].trim();
        var m = location.pathname.match(/-(\d+)\.html$/);
        var d = { content_type: 'product', content_name: nombre, currency: 'ARS' };
        if (m) { d.content_ids = [m[1]]; }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
            var t = document.querySelector('h1'); if (t) d.content_name = t.textContent.trim(); window.sanouMeta('ViewContent', d);
        });
        else window.sanouMeta('ViewContent', d);
    }
})();
