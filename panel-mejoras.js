// MEJORAS UI CRM (2026-10). Solo agrega efectos visuales; no toca la clave, la caché
// ni las llamadas al backend. Para desactivarlo, sacar el <script src="panel-mejoras.js"> del panel.html.
(function () {
    'use strict';

    // 1. Clave incorrecta: la caja hace una sacudida corta (se repite en cada intento fallido).
    if (typeof window.probarClave === 'function') {
        var probarOriginal = window.probarClave;
        window.probarClave = async function () {
            var r = await probarOriginal.apply(this, arguments);
            var err = document.getElementById('claveError');
            var caja = document.querySelector('.panel-lock-caja');
            if (err && caja && err.classList.contains('on') && document.body.classList.contains('bloqueado')) {
                caja.classList.remove('sacudir');
                void caja.offsetWidth;
                caja.classList.add('sacudir');
            }
            return r;
        };
    }

    // 2. Cambio de sección: fade corto del contenido y, en celu, el botón elegido
    //    se centra en la barra de navegación (que se desplaza de costado).
    if (typeof window.navegar === 'function') {
        var navegarOriginal = window.navegar;
        window.navegar = function (sec) {
            var r = navegarOriginal.apply(this, arguments);
            var vista = document.getElementById('vista');
            if (vista) { vista.classList.remove('crm-entra'); void vista.offsetWidth; vista.classList.add('crm-entra'); }
            var btn = document.querySelector('.panel-nav-btn[data-sec="' + sec + '"]');
            if (btn && btn.scrollIntoView) {
                var suave = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
                try { btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: suave ? 'smooth' : 'auto' }); } catch (e) {}
            }
            return r;
        };
    }
})();
