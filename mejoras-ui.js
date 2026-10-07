// ─────────────────────────────────────────────────────────────────
// MEJORAS UI (2026-10). Se carga después de script.js y solo agrega comportamiento:
// no cambia precios, carrito, stock ni presupuestos. Para desactivarlo, sacar el
// <script src="mejoras-ui.js"> del index.html.
// ─────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var conn = navigator.connection || {};
    var ahorroDatos = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');

    // 1. Movimiento reducido: las animaciones de anime.js saltan directo al estado final
    //    (todo queda visible igual, sin desplazamientos).
    if (reduce && window.anime) {
        var real = window.anime;
        var alFinal = function (o) {
            try {
                var t = o.targets;
                var els = typeof t === 'string' ? document.querySelectorAll(t)
                        : (t && t.length !== undefined ? t : [t]);
                Array.prototype.forEach.call(els, function (el) {
                    if (!el || !el.style) return;
                    if (o.opacity) el.style.opacity = '1';
                    if (o.translateX || o.translateY || o.scale) el.style.transform = 'none';
                    if (o.innerHTML) el.innerHTML = o.innerHTML[o.innerHTML.length - 1];
                });
            } catch (e) {}
            if (typeof o.complete === 'function') { try { o.complete(); } catch (e) {} }
            return { play: function () {}, pause: function () {}, restart: function () {}, finished: Promise.resolve() };
        };
        for (var k in real) { if (Object.prototype.hasOwnProperty.call(real, k)) alFinal[k] = real[k]; }
        alFinal.stagger = function () { return 0; };
        window.anime = alFinal;
    }

    // 2. Video del hero: con movimiento reducido o ahorro de datos no se descarga
    //    (la pantalla del iPhone queda con el logo). Si se carga, el logo se oculta
    //    apenas hay un primer cuadro para mostrar (aunque el navegador bloquee el autoplay).
    if ((reduce || ahorroDatos) && typeof window.initHeroVideo === 'function') {
        window.initHeroVideo = function () {};
    }
    var video = document.getElementById('heroVideo');
    if (video) {
        var listo = function () {
            var pantalla = video.closest('.iphone-screen');
            if (pantalla) pantalla.classList.add('video-listo');
        };
        if (video.readyState >= 2) listo();
        else video.addEventListener('loadeddata', listo, { once: true });
    }

    // 3. Tarjetas de categoría: se pueden usar con teclado (Tab + Enter/Espacio).
    document.querySelectorAll('.category-card[onclick]').forEach(function (card) {
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
        });
    });
})();
