/* ═════════ FINALIZAR COMPRA ═════════
   Página propia (como la de Suple Market): medio de pago, datos, entrega y resumen fijo.
   - Mercado Pago: pide la preferencia al backend (precio normal) y redirige al pago.
   - Transferencia: guarda el pedido en el CRM (precio de la planilla) y abre WhatsApp para los datos bancarios.
   El backend recalcula SIEMPRE los precios con la planilla: lo que se ve acá es solo informativo. */
(function () {
    'use strict';
    const API = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';
    const WHATSAPP = '5491131751517';
    const CART_KEY = 'sanou_cart';
    // Mismas zonas y precios que envios.html y el backend (MP_ZONAS).
    const ZONAS = {
        capital: { n: 'Capital (CABA)', p: 5500 },
        gba1: { n: 'GBA 1', p: 7000 },
        gba2: { n: 'GBA 2', p: 9000 },
        gba3: { n: 'GBA 3', p: 15000 }
    };
    const PARTIDOS = {
        gba1: ['Avellaneda', 'General San Martín', 'Hurlingham', 'Ituzaingó', 'La Matanza Norte (San Justo, Ramos Mejía, Lomas del Mirador, Isidro Casanova, Tapiales)', 'Lanús', 'Lomas de Zamora', 'Morón', 'San Fernando', 'San Isidro', 'Tres de Febrero', 'Vicente López'],
        gba2: ['Almirante Brown', 'Berazategui', 'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'José C. Paz', 'La Matanza Sur (Laferrere, González Catán, Virrey del Pino)', 'Malvinas Argentinas', 'Merlo', 'Moreno', 'Quilmes', 'San Miguel', 'Tigre'],
        gba3: ['Berisso', 'Cañuelas', 'Ensenada', 'Escobar (Garín, Maschwitz)', 'General Rodríguez', 'La Plata', 'Marcos Paz', 'Pilar (Derqui, Villa Rosa)', 'Presidente Perón (Guernica)', 'San Vicente']
    };
    const PROVINCIAS = ['Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'];

    const $ = id => document.getElementById(id);
    const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

    let cart = [];
    try { cart = JSON.parse(ls.get(CART_KEY) || '[]').filter(i => i && i.name && i.qty > 0); } catch (e) { cart = []; }

    // Estado de la entrega: zona = 'retiro' | 'capital' | 'gba1' | 'gba2' | 'gba3' | 'interior' | '' (falta definir)
    const st = { pago: 'mp', entrega: 'retiro', zona: 'retiro', lugar: '' };

    // Primera foto del producto (misma regla que la tienda: productos/<categoría>/<carpeta>/1.jpg).
    function fotoDe(p) {
        if (!p.imgs) return '';
        const base = `productos/${p.catFolder || p.category}/${p.folder || p.name}/`;
        return Array.isArray(p.imgs) ? (p.imgs[0] ? base + p.imgs[0] : '') : base + '1.' + (p.ext || 'jpg');
    }
    function precioTr(i) { return i.precioTransfer > 0 ? i.precioTransfer : i.price; }
    function totales() {
        const sub = cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
        const subTr = cart.reduce((s, i) => s + (precioTr(i) || 0) * i.qty, 0);
        const envio = ZONAS[st.zona] ? ZONAS[st.zona].p : 0;
        const esTr = st.pago === 'transferencia';
        return { sub, subTr, envio, ahorro: esTr ? sub - subTr : 0, total: (esTr ? subTr : sub) + envio, totalMp: sub + envio };
    }

    // ── Pintar resumen ──
    function pintar() {
        const t = totales();
        $('ckItems').innerHTML = cart.map(i => `<li class="ck-item"><span class="ck-item-ico">${fotoDe(i) ? `<img src="${esc(fotoDe(i))}" alt="" width="52" height="52" loading="lazy" decoding="async" onerror="this.outerHTML='<i class=&quot;fas ${esc(i.icon || 'fa-screwdriver-wrench')}&quot; aria-hidden=&quot;true&quot;></i>'">` : `<i class="fas ${esc(i.icon || 'fa-screwdriver-wrench')}" aria-hidden="true"></i>`}<em>${i.qty}</em></span><span class="ck-item-nom">${esc(i.name)}${i.inStock === false ? '<small class="ck-item-res">Reserva · entrega en 20 días</small>' : ''}</span><span class="ck-item-pr">${fmt((st.pago === 'transferencia' ? precioTr(i) : i.price) * i.qty)}</span></li>`).join('');
        $('ckSubtotal').textContent = fmt(st.pago === 'transferencia' ? t.subTr : t.sub);
        const envDet = $('ckEnvioDet'), envMon = $('ckEnvioMonto');
        if (st.entrega === 'retiro') { envDet.textContent = 'Retiro en el depósito'; envMon.textContent = 'Sin cargo'; }
        else if (ZONAS[st.zona]) { envDet.textContent = ZONAS[st.zona].n + (st.lugar ? ' · ' + st.lugar : ''); envMon.textContent = fmt(t.envio); }
        else if (st.zona === 'interior') { envDet.textContent = 'Interior · Vía Cargo'; envMon.textContent = 'A coordinar'; }
        else { envDet.textContent = 'Completá tu localidad'; envMon.textContent = 'A calcular'; }
        document.querySelectorAll('.ck-zc').forEach(z => z.classList.toggle('on', st.entrega === 'envio' && z.dataset.z === st.zona));
        $('ckAhorroFila').hidden = !(t.ahorro > 0);
        $('ckAhorro').textContent = '−' + fmt(t.ahorro);
        const antes = $('ckTotalAntes');
        antes.hidden = !(t.ahorro > 0); antes.textContent = fmt(t.totalMp);
        $('ckTotal').textContent = fmt(t.total);
        $('ckPrecioMp').innerHTML = fmt(t.sub);
        $('ckPrecioTr').innerHTML = t.sub > t.subTr ? `${fmt(t.subTr)}<small>Ahorrás ${fmt(t.sub - t.subTr)}</small>` : fmt(t.subTr);
        const btn = $('ckBtn');
        btn.classList.toggle('es-mp', st.pago === 'mp');
        $('ckBtnTxt').textContent = st.pago === 'mp' ? 'Pago seguro' : 'Confirmar pedido';
        $('ckLegal').textContent = st.pago === 'mp'
            ? 'Te llevamos al sitio seguro de Mercado Pago. No vemos ni guardamos los datos de tu tarjeta.'
            : 'Reservamos tu pedido y te mostramos el alias y el CVU para transferir.';
    }

    // ── Detección de zona por localidad (API pública Georef, como en Suple Market) ──
    function partidoDe(depto, localidad) {
        const d = norm(depto);
        if (d === 'la matanza') {
            const l = norm(localidad);
            if (['san justo', 'ramos mejia', 'lomas del mirador', 'isidro casanova', 'tapiales'].includes(l)) return { zona: 'gba1', lugar: 'La Matanza Norte' };
            if (['gregorio de laferrere', 'laferrere', 'gonzalez catan', 'virrey del pino'].includes(l)) return { zona: 'gba2', lugar: 'La Matanza Sur' };
            return null;   // otra localidad de La Matanza: que elija Norte o Sur
        }
        for (const z of Object.keys(PARTIDOS)) for (const p of PARTIDOS[z]) if (norm(p.replace(/\s*\(.*\)$/, '')) === d) return { zona: z, lugar: p.replace(/\s*\(.*\)$/, '') };
        return { zona: 'interior', lugar: depto };   // partido de Buenos Aires fuera de las zonas
    }
    let busca = null, timer = 0;
    async function detectar(texto) {
        const q = norm(texto);
        if (q.length < 3) return null;
        if (['caba', 'capital', 'capital federal', 'ciudad autonoma de buenos aires', 'ciudad de buenos aires'].includes(q)) return { zona: 'capital', lugar: 'CABA' };
        if (busca) busca.abort();
        busca = new AbortController();
        const r = await fetch('https://apis.datos.gob.ar/georef/api/localidades?max=20&campos=nombre,departamento.nombre,provincia.id,provincia.nombre&nombre=' + encodeURIComponent(texto.trim()), { signal: busca.signal });
        if (!r.ok) return null;
        const list = ((await r.json()).localidades) || [];
        const amba = l => l.provincia.id === '02' || l.provincia.id === '06';
        const pick = list.find(l => amba(l) && norm(l.nombre) === q) || list.find(l => amba(l) && (norm(l.nombre).includes(q) || q.includes(norm(l.nombre)))) || list.find(l => norm(l.nombre) === q);
        if (!pick) return null;
        if (pick.provincia.id === '02') return { zona: 'capital', lugar: pick.nombre };
        if (pick.provincia.id === '06') { const z = partidoDe(pick.departamento && pick.departamento.nombre || '', pick.nombre); return z ? { zona: z.zona, lugar: pick.nombre + (z.lugar && z.lugar !== pick.nombre ? ' (' + z.lugar + ')' : '') } : { zona: '', ambiguo: true, lugar: pick.nombre }; }
        return { zona: 'interior', lugar: pick.nombre + ', ' + pick.provincia.nombre };
    }
    function zonaMsg(html, ok) { const el = $('ckZona'); el.innerHTML = html; el.classList.toggle('ok', !!ok); }
    function mostrarManual(mostrar) {
        $('ckProvCampo').hidden = !mostrar;
        if (!mostrar) $('ckPartCampo').hidden = true;
    }
    function aplicarZona(z) {
        st.zona = z.zona; st.lugar = z.lugar || '';
        if (ZONAS[z.zona]) zonaMsg(`<span class="ck-zona-precio">Tu envío sale <b>${fmt(ZONAS[z.zona].p)}</b></span><small>${ZONAS[z.zona].n} · ${esc(st.lugar)} <button type="button" id="ckCambiar">¿No es tu zona?</button></small>`, true);
        else if (z.zona === 'interior') zonaMsg(`<span class="ck-zona-precio">Envío por Vía Cargo: <b>a coordinar</b></span><small>${esc(st.lugar)} · te pasamos el costo por WhatsApp <button type="button" id="ckCambiar">Cambiar</button></small>`, true);
        const b = $('ckCambiar'); if (b) b.onclick = () => { mostrarManual(true); $('ckProv').focus(); };
        pintar();
    }
    // Al escribir la localidad se borra la cotización anterior; se cotiza con el botón "Cotizar envío".
    function onLocalidad() {
        if (st.entrega !== 'envio') return;
        st.zona = ''; st.lugar = '';
        zonaMsg(''); pintar();
    }
    async function cotizarEnvio() {
        if (st.entrega !== 'envio') return;
        const v = $('ckLoc').value;
        if (norm(v).length < 3) { marcar('ckLoc', 'Escribí tu localidad o barrio para cotizar.'); $('ckLoc').focus(); return; }
        const b = $('ckCotizar'); b.disabled = true;
        st.zona = ''; st.lugar = '';
        zonaMsg('<i class="fas fa-circle-notch fa-spin"></i> Cotizando…'); pintar();
        try {
            const z = await detectar(v);
            if (z && z.zona) { mostrarManual(false); aplicarZona(z); }
            else if (z && z.ambiguo) { zonaMsg(`<b>${esc(z.lugar)}</b> es de La Matanza: elegí si es Norte o Sur.`); mostrarManual(true); $('ckProv').value = 'BA'; onProv(); }
            else { zonaMsg('No reconocimos esa localidad. Elegí tu provincia y partido:'); mostrarManual(true); }
        } catch (e) { if (e.name !== 'AbortError') { zonaMsg('Elegí tu provincia y partido:'); mostrarManual(true); } }
        b.disabled = false;
    }
    function onProv() {
        const v = $('ckProv').value;
        $('ckPartCampo').hidden = v !== 'BA';
        if (v === 'CABA') aplicarZona({ zona: 'capital', lugar: 'CABA' });
        else if (v === 'BA') { if ($('ckPart').value) onPart(); else { st.zona = ''; zonaMsg('Elegí tu partido para ver el costo.'); pintar(); } }
        else if (v) aplicarZona({ zona: 'interior', lugar: v });
        else { st.zona = ''; pintar(); }
    }
    function onPart() {
        const v = $('ckPart').value; if (!v) return;
        const [z, i] = v.split('|');
        aplicarZona({ zona: z, lugar: PARTIDOS[z][+i].replace(/\s*\(.*\)$/, '') });
    }

    // ── Validación ──
    function marcar(id, msg) {
        const campo = $(id).closest('.ck-campo');
        campo.classList.toggle('es-error', !!msg);
        let e = campo.querySelector('.ck-campo-err');
        if (msg) { if (!e) { e = document.createElement('span'); e.className = 'ck-campo-err'; campo.appendChild(e); } e.textContent = msg; }
        else if (e) e.remove();
        return !msg;
    }
    function validar() {
        const v = id => $(id).value.trim();
        const reglas = [
            ['ckNombre', v('ckNombre').split(' ').filter(Boolean).length >= 2 ? '' : 'Escribí nombre y apellido.'],
            ['ckTel', v('ckTel').replace(/\D/g, '').length >= 8 ? '' : 'Celular con código de área (ej: 11 2345-6789).'],
            ['ckEmail', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('ckEmail')) ? '' : 'Revisá el email.']
        ];
        if ($('ckFactA').checked) reglas.push(
            ['ckRazon', v('ckRazon').length >= 3 ? '' : 'Razón social o nombre.'],
            ['ckCuit', cuitOk(v('ckCuit')) ? '' : 'Revisá el CUIT (11 números).'],
            ['ckDomF', v('ckDomF').length >= 5 ? '' : 'Domicilio fiscal.']
        );
        if (st.entrega === 'envio') reglas.push(
            ['ckDni', /^\d{7,9}$/.test(v('ckDni').replace(/\D/g, '')) ? '' : 'DNI de 7 u 8 números.'],
            ['ckCp', v('ckCp').length >= 4 ? '' : 'Código postal.'],
            ['ckDir', v('ckDir').length >= 5 ? '' : 'Calle y número.'],
            ['ckLoc', v('ckLoc').length >= 3 ? '' : 'Localidad o barrio.']
        );
        let primero = null;
        reglas.forEach(([id, msg]) => { if (!marcar(id, msg) && !primero) primero = id; });
        if (primero) { $(primero).focus(); return false; }
        if (st.entrega === 'envio' && !st.zona) { error('Tocá "Cotizar envío" para calcular el costo antes de pagar.'); $('ckCotizar').focus(); return false; }
        return true;
    }
    // CUIT válido: 11 números y dígito verificador correcto.
    function cuitOk(c) {
        c = String(c || '').replace(/\D/g, '');
        if (c.length !== 11) return false;
        const m = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        let s = 0; for (let i = 0; i < 10; i++) s += m[i] * +c[i];
        let v = 11 - (s % 11); if (v === 11) v = 0; if (v === 10) v = 9;
        return v === +c[10];
    }
    function error(t) { const e = $('ckError'); e.textContent = t || ''; e.hidden = !t; }

    // ── Backend (JSONP, igual que la tienda) ──
    function jsonp(params) {
        return new Promise((resolve, reject) => {
            const cb = 'ck_' + Date.now() + Math.floor(Math.random() * 1e5);
            const s = document.createElement('script');
            const to = setTimeout(() => { fin(); reject(new Error('timeout')); }, 25000);
            function fin() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
            window[cb] = d => { fin(); resolve(d); };
            const hp = (document.querySelector('input[name="hp_campo"]') || {}).value || '';
            s.src = API + '?' + new URLSearchParams(Object.assign({}, params, { web: hp, callback: cb, _: Date.now() })).toString();
            s.onerror = () => { fin(); reject(new Error('network')); };
            document.body.appendChild(s);
        });
    }
    function cid(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36) + '-' + Math.floor(Date.now() / 3600000).toString(36); }

    async function enviar(e) {
        e.preventDefault();
        error('');
        if (!validar()) return;
        const datos = {
            nombre: $('ckNombre').value.trim(), telefono: $('ckTel').value.trim(), email: $('ckEmail').value.trim(),
            zona: st.entrega === 'retiro' ? 'retiro' : st.zona
        };
        if ($('ckFactA').checked) Object.assign(datos, { fa: '1', razon: $('ckRazon').value.trim(), cuit: $('ckCuit').value.replace(/\D/g, ''), condiva: $('ckIva').value, domfiscal: $('ckDomF').value.trim() });
        if (st.entrega === 'envio') Object.assign(datos, { dni: $('ckDni').value.replace(/\D/g, ''), cp: $('ckCp').value.trim(), direccion: $('ckDir').value.trim(), localidad: $('ckLoc').value.trim(), lugar: st.lugar });
        const items = cart.map(i => ({ nombre: i.name, qty: i.qty }));
        ls.set('kl_name', datos.nombre); ls.set('kl_email', datos.email); ls.set('kl_phone', datos.telefono);
        if (st.entrega === 'envio') ls.set('sanou_envio', JSON.stringify({ dni: datos.dni, cp: datos.cp, direccion: datos.direccion, localidad: datos.localidad }));
        const btn = $('ckBtn'), txt = $('ckBtnTxt').textContent;
        btn.disabled = true; $('ckBtnTxt').textContent = 'Procesando…';
        try {
            const accion = st.pago === 'mp' ? 'mp_preferencia' : 'pedido_transferencia';
            const r = await jsonp(Object.assign({ action: accion, tab: 'Clientes', items: JSON.stringify(items), cid: cid(datos.telefono + '|' + JSON.stringify(items) + '|' + datos.zona + '|' + st.pago) }, datos));
            if (!r || !r.ok) throw new Error((r && r.error) || 'No pudimos procesar el pedido.');
            if (typeof gtag !== 'undefined') gtag('event', 'begin_checkout', { value: r.total, currency: 'ARS', payment_type: st.pago });
            if (st.pago === 'mp') { $('ckBtnTxt').textContent = 'Abriendo Mercado Pago…'; window.location.href = r.init_point; return; }
            gracias(r, datos);
        } catch (err) {
            const m = String(err && err.message || '');
            error(/timeout|network/.test(m) ? 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' : m);
            btn.disabled = false; $('ckBtnTxt').textContent = txt;
        }
    }

    function gracias(r, d) {
        const det = cart.map(i => `${i.qty}x ${i.name}`).join(', ');
        const entrega = d.zona === 'retiro' ? 'Retiro en el depósito (Marcelo Gamboa 6306, Versalles)'
            : `${ZONAS[d.zona] ? 'Envío ' + ZONAS[d.zona].n : 'Envío por Vía Cargo'} — ${d.direccion}, ${d.localidad} (CP ${d.cp})`;
        st.pedido = r.pedido; st.ut = r.ut;
        const num = '#' + String(r.pedido).slice(-6).toUpperCase();   // número corto para el cliente (el CRM lo encuentra igual)
        $('ckGrNum').textContent = num;
        $('ckGrDet').innerHTML = `<span>Pedido <b>${esc(num)}</b></span><span>Productos: <b>${esc(det)}</b></span><span>Entrega: <b>${esc(entrega)}</b></span><span>Total a transferir: <b class="ck-gr-total">${fmt(r.total)}</b></span>`;
        $('ckImporte').textContent = fmt(r.total);
        const msg = `Hola San Ou! Hice el pedido ${num} en la web y pagué con transferencia. Te mando el comprobante.\n\n🛠 ${det}\n🚚 ${entrega}\n💰 Total: ${fmt(r.total)}\n👤 ${d.nombre}`;
        $('ckGrWa').href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
        try { localStorage.removeItem(CART_KEY); } catch (e) {}
        $('ckForm').hidden = true; document.querySelector('.ck-titulo').textContent = 'Pedido confirmado';
        $('ckGracias').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── Comprobante de transferencia: foto (achicada) o PDF, por POST al backend ──
    function leerArchivo(file) {
        return new Promise((resolve, reject) => {
            if (file.type === 'application/pdf') {
                if (file.size > 4 * 1024 * 1024) return reject(new Error('El PDF es muy grande (máximo 4 MB).'));
                const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(new Error('No se pudo leer el archivo.')); fr.readAsDataURL(file); return;
            }
            if (!/^image\//.test(file.type)) return reject(new Error('Subí una foto o un PDF.'));
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la foto. Probá con otra o mandala por WhatsApp.')); };
            img.src = url;
        });
    }
    async function subirComprobante(file) {
        const txt = $('ckCompTxt'), msg = $('ckCompMsg'), lbl = $('ckCompBtn');
        lbl.classList.add('es-cargando'); txt.textContent = 'Subiendo…'; msg.textContent = '';
        try {
            const data = await leerArchivo(file);
            const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'subir_comprobante', pedido: st.pedido, ut: st.ut, data }) });
            const j = await res.json();
            if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo subir.');
            lbl.classList.remove('es-cargando'); lbl.classList.add('es-ok');
            txt.textContent = '¡Comprobante recibido!'; lbl.querySelector('i').className = 'fas fa-check';
            msg.textContent = 'Listo. Lo revisamos y te avisamos por WhatsApp cuando el pedido esté en camino.';
            $('ckComp').disabled = true;
        } catch (e) {
            lbl.classList.remove('es-cargando'); txt.textContent = 'Subir comprobante';
            msg.textContent = (e && e.message && !/fetch|network|json/i.test(e.message)) ? e.message : 'No se pudo subir. Probá de nuevo o mandalo por WhatsApp.';
            msg.classList.add('es-error');
        }
    }

    // ── Inicio ──
    function init() {
        if (!cart.length) { $('ckVacio').hidden = false; return; }
        $('ckForm').hidden = false;
        // Si vino de "transferencia" en el carrito, arrancar con esa opción.
        if (/[?&]pago=transferencia/.test(location.search)) { st.pago = 'transferencia'; document.querySelector('input[name="pago"][value="transferencia"]').checked = true; }
        $('ckNombre').value = ls.get('kl_name') || '';
        $('ckEmail').value = ls.get('kl_email') || '';
        $('ckTel').value = ls.get('kl_phone') || '';
        try { const env = JSON.parse(ls.get('sanou_envio') || 'null'); if (env) { $('ckDni').value = env.dni || ''; $('ckCp').value = env.cp || ''; $('ckDir').value = env.direccion || ''; $('ckLoc').value = env.localidad || ''; } } catch (e) {}
        $('ckProv').innerHTML = '<option value="">Elegí tu provincia…</option><option value="CABA">Ciudad de Buenos Aires (CABA)</option><option value="BA">Buenos Aires</option><optgroup label="Resto del país">' + PROVINCIAS.map(p => `<option value="${p}">${p}</option>`).join('') + '</optgroup>';
        $('ckPart').innerHTML = '<option value="">Elegí tu partido…</option>' + Object.keys(PARTIDOS).map(z => `<optgroup label="${ZONAS[z].n} · ${fmt(ZONAS[z].p)}">${PARTIDOS[z].map((p, i) => `<option value="${z}|${i}">${p}</option>`).join('')}</optgroup>`).join('') + '<option value="otro">Otro partido (Vía Cargo, a coordinar)</option>';
        document.querySelectorAll('input[name="pago"]').forEach(r => r.addEventListener('change', () => { st.pago = r.value; pintar(); }));
        document.querySelectorAll('input[name="entrega"]').forEach(r => r.addEventListener('change', () => {
            st.entrega = r.value;
            $('ckRetiro').hidden = r.value !== 'retiro';
            $('ckEnvio').hidden = r.value !== 'envio';
            if (r.value === 'retiro') { st.zona = 'retiro'; st.lugar = ''; pintar(); }
            else { st.zona = ''; onLocalidad(); if (norm($('ckLoc').value).length >= 3) cotizarEnvio(); }
            error('');
        }));
        $('ckFactA').addEventListener('change', () => { $('ckFact').hidden = !$('ckFactA').checked; if ($('ckFactA').checked) $('ckRazon').focus(); });
        $('ckLoc').addEventListener('input', onLocalidad);
        $('ckLoc').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cotizarEnvio(); } });
        $('ckCotizar').addEventListener('click', cotizarEnvio);
        $('ckProv').addEventListener('change', onProv);
        $('ckPart').addEventListener('change', () => { if ($('ckPart').value === 'otro') aplicarZona({ zona: 'interior', lugar: 'Buenos Aires' }); else onPart(); });
        ['ckNombre', 'ckTel', 'ckEmail', 'ckDni', 'ckCp', 'ckDir', 'ckLoc', 'ckRazon', 'ckCuit', 'ckDomF'].forEach(id => $(id).addEventListener('input', () => { if ($(id).closest('.ck-campo').classList.contains('es-error')) marcar(id, ''); }));
        $('ckForm').addEventListener('submit', enviar);
        $('ckComp').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) subirComprobante(f); e.target.value = ''; });
        // Copiar alias / CVU / importe (como en Suple Market): el botón confirma "Copiado ✓".
        document.querySelectorAll('.ck-copiar').forEach(b => b.addEventListener('click', async () => {
            let v = $(b.dataset.copiar).textContent.trim();
            if (b.dataset.soloNumeros) v = v.replace(/\D/g, '');
            try { await navigator.clipboard.writeText(v); } catch (e) { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} t.remove(); }
            b.textContent = 'Copiado ✓'; b.classList.add('ok');
            setTimeout(() => { b.textContent = 'Copiar'; b.classList.remove('ok'); }, 1800);
        }));
        // Volver con "atrás" desde Mercado Pago: reactivar el botón.
        window.addEventListener('pageshow', ev => { if (ev.persisted) { $('ckBtn').disabled = false; pintar(); } });
        pintar();
    }
    init();
})();
