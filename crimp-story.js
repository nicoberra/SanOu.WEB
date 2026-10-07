// ─────────────────────────────────────────────────────────────────
// "Cómo se crimpa": storytelling con scroll (solo desktop, ≥900px).
// La crimpadora queda fija (CSS sticky) y GSAP + ScrollTrigger hacen:
//  - paso activo resaltado y contador 01/06,
//  - la herramienta gira y se acerca atada al scroll (scrub),
//  - barra de progreso y brillo que crece con cada paso.
// GSAP se descarga recién cuando la sección está cerca (no pesa en la carga inicial).
// Sin JS, con "reducir movimiento", en celular o si el CDN falla: lista normal, todo visible.
// ─────────────────────────────────────────────────────────────────
(function () {
    'use strict';
    var section = document.getElementById('como-se-crimpa');
    if (!section || !('IntersectionObserver' in window)) return;
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { return; }

    var GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/';

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src; s.async = true;
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function start() {
        var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        var steps = Array.prototype.slice.call(section.querySelectorAll('.crimp-step'));
        var list = section.querySelector('.crimp-steps');
        var tool = section.querySelector('.crimp-tool');
        var glow = section.querySelector('.crimp-glow');
        var num = section.querySelector('.crimp-counter-num');
        var bar = section.querySelector('.crimp-progress-bar');

        var mm = gsap.matchMedia();
        mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', function () {
            section.classList.add('crimp-js');

            function setActive(i) {
                steps.forEach(function (s, j) { s.classList.toggle('is-active', j === i); });
                num.textContent = String(i + 1).padStart(2, '0');
                // El brillo crece con cada paso; en "Crimpá" (5) la herramienta hace un leve "apriete".
                gsap.to(glow, { opacity: 0.45 + i * 0.1, scale: 0.9 + i * 0.04, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
                if (i === 4) gsap.fromTo(tool, { scaleY: 0.96 }, { scaleY: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });
            }

            steps.forEach(function (step, i) {
                ScrollTrigger.create({
                    trigger: step, start: 'top 60%', end: 'bottom 60%',
                    onToggle: function (self) { if (self.isActive) setActive(i); }
                });
            });

            // Giro + acercamiento de la herramienta y barra de progreso, atados al recorrido de los pasos.
            var range = { trigger: list, start: 'top 60%', end: 'bottom 60%', scrub: 0.6 };
            gsap.fromTo(tool, { rotate: -12, scale: 0.9, y: 24 }, { rotate: 8, scale: 1.04, y: -16, ease: 'none', scrollTrigger: range });
            gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: list, start: 'top 60%', end: 'bottom 60%', scrub: true } });

            return function () { section.classList.remove('crimp-js'); };
        });

        // El catálogo y los destacados se dibujan después: si cambia la altura de la página,
        // recalcular dónde empieza cada paso.
        var t;
        var refresh = function () { clearTimeout(t); t = setTimeout(function () { ScrollTrigger.refresh(); }, 250); };
        if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(document.body);
        window.addEventListener('load', refresh);
    }

    // En celular el efecto no se usa: no se descarga GSAP. Si la ventana se agranda a desktop, se carga ahí.
    var DESKTOP = '(min-width: 900px)';
    var loading = false;
    function load() {
        if (loading) return;
        if (!matchMedia(DESKTOP).matches) {
            window.addEventListener('resize', load, { passive: true });
            return;
        }
        loading = true;
        window.removeEventListener('resize', load);
        var ready = window.gsap && window.ScrollTrigger
            ? Promise.resolve()
            : loadScript(GSAP_CDN + 'gsap.min.js').then(function () { return loadScript(GSAP_CDN + 'ScrollTrigger.min.js'); });
        ready.then(start).catch(function () { /* sin GSAP: queda la lista normal */ });
    }

    var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        load();
    }, { rootMargin: '800px 0px' });
    io.observe(section);
})();
