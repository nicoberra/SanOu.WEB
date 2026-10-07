// ─────────────────────────────────────────────────────────────────
// Banner "¿No sabés qué crimpadora comprar?" — movimiento premium atado al scroll.
//  1) La HHY-120A entra desde la derecha girando y se asienta cuando el banner llega al centro;
//     después sigue derivando apenas (la pieza "acompaña" el scroll).
//  2) Las medidas 6–70 / 10–120 / 16–300 mm² se encienden en orden (de menor a mayor capacidad).
//  3) Una luz recorre el borde (variable --p del CSS).
//  4) Con mouse: la herramienta sigue levemente al cursor (parallax suave).
// Sin librerías. Solo corre mientras el banner está en pantalla. Solo transform/opacity.
// Con "reducir movimiento" no hace nada: la herramienta queda quieta en su lugar.
// ─────────────────────────────────────────────────────────────────
(function () {
    'use strict';
    var banner = document.getElementById('guiaBanner');
    if (!banner || !banner.classList.contains('guia-banner--premium')) return;
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { return; }
    if (!('IntersectionObserver' in window)) return;

    var tool = banner.querySelector('.guia-tool');
    var sizes = banner.querySelectorAll('.guia-size');
    if (!tool) return;

    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

    var p = 0;               // avance del scroll a través del banner (0 = entrando por abajo, 1 = saliendo por arriba)
    var mx = 0, my = 0;      // mouse suavizado (-0.5..0.5)
    var tx = 0, ty = 0;      // mouse objetivo
    var raf = 0, lit = -1;

    function render() {
        raf = 0;
        // Entrada: de 0 a 0.55 avanza desde la derecha, gira y crece; después deriva suave.
        var e = easeOut(clamp(p / 0.55, 0, 1));
        var drift = Math.max(0, p - 0.55);
        var x = (1 - e) * 62 - drift * 16;                 // % del ancho de la herramienta
        var rot = -6 - 24 * (1 - e) + drift * 10 + mx * 5; // grados
        var sc = 0.84 + 0.16 * e;
        tool.style.transform =
            'translate(-50%, -50%) translate(' + (x + mx * 4).toFixed(2) + '%, ' + (my * 6).toFixed(2) + '%) ' +
            'rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
        tool.style.opacity = (0.1 + 0.9 * clamp(e * 1.3, 0, 1)).toFixed(3);
        banner.style.setProperty('--p', p.toFixed(3));

        // Medidas: se encienden de a una, de menor a mayor capacidad.
        var n = p < 0.30 ? 0 : p < 0.40 ? 1 : p < 0.50 ? 2 : 3;
        if (n !== lit) {
            lit = n;
            for (var i = 0; i < sizes.length; i++) sizes[i].classList.toggle('is-on', i < n);
        }

        // Mientras el mouse se esté acomodando, seguir animando.
        var dx = tx - mx, dy = ty - my;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            mx += dx * 0.12; my += dy * 0.12;
            raf = requestAnimationFrame(render);
        }
    }
    function measure() {
        var r = banner.getBoundingClientRect(), vh = window.innerHeight || 1;
        p = clamp((vh - r.top) / (vh + r.height), 0, 1);
        if (!raf) raf = requestAnimationFrame(render);
    }

    function onPointer(e) {
        var r = banner.getBoundingClientRect();
        tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
        ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
        if (!raf) raf = requestAnimationFrame(render);
    }
    function onLeave() { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(render); }

    var finePointer = false;
    try { finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) {}

    var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
            window.addEventListener('scroll', measure, { passive: true });
            window.addEventListener('resize', measure);
            if (finePointer) {
                banner.addEventListener('pointermove', onPointer);
                banner.addEventListener('pointerleave', onLeave);
            }
            measure();
        } else {
            window.removeEventListener('scroll', measure);
            window.removeEventListener('resize', measure);
            banner.removeEventListener('pointermove', onPointer);
            banner.removeEventListener('pointerleave', onLeave);
        }
    });
    io.observe(banner);
})();
