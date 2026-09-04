// ─── KLAVIYO ─────────────────────────────────────────────────────
const KL_KEY = 'Ygitdg';
let klUserEmail = localStorage.getItem('kl_email') || null;
let klUserName  = localStorage.getItem('kl_name')  || null;
let klModalMostrado = false;

// ─── CLIENTES → CRM PRIVADO (Google Sheets) ─────────────────────
// Escribe en la MISMA planilla privada del CRM (pestaña Clientes),
// vía el Apps Script del panel. Ya NO usa la planilla publicada.
const CLIENTES_URL = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';

// Guarda/actualiza el cliente en el CRM. Fire-and-forget (no-cors).
// El backend hace upsert por email (no duplica si ya existe).
function guardarClienteEnSheet(datos) {
    if (!CLIENTES_URL) return;
    try {
        const params = new URLSearchParams({
            action:   'add',
            tab:      'Clientes',
            nombre:   datos.nombre   || '',
            email:    datos.email    || '',
            telefono: datos.telefono || '',
            empresa:  datos.empresa  || '',
            ciudad:   datos.ciudad   || '',
            origen:   'web',
            notas:    datos.origen   || 'registro web'
        });
        fetch(CLIENTES_URL + '?' + params.toString(), { mode: 'no-cors' });
    } catch (e) { /* silencioso: no frenar al cliente si falla la red */ }
}

// ─── CUENTAS: login / registro (misma cuenta en todos los dispositivos) ──
// JSONP: necesitamos LEER la respuesta del servidor (no-cors no deja).
function crmJsonp(params) {
    return new Promise((resolve, reject) => {
        const cb = 'cb_' + Date.now() + Math.floor(Math.random() * 100000);
        const s = document.createElement('script');
        const to = setTimeout(() => { limpiar(); reject(new Error('timeout')); }, 15000);
        function limpiar() { clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
        window[cb] = (data) => { limpiar(); resolve(data); };
        const usp = new URLSearchParams(Object.assign({}, params, { callback: cb, _: Date.now() }));
        s.src = CLIENTES_URL + '?' + usp.toString();
        s.onerror = () => { limpiar(); reject(new Error('network')); };
        document.body.appendChild(s);
    });
}
// Encripta la contraseña (PBKDF2). El texto plano NUNCA sale del dispositivo.
async function hashClave(email, pass) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode('sanou::cuenta::' + String(email).trim().toLowerCase()), iterations: 150000, hash: 'SHA-256' },
        key, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function guardarSesionCliente(c) {
    localStorage.setItem('kl_email', c.email || '');
    localStorage.setItem('kl_name', c.nombre || '');
    localStorage.setItem('kl_phone', c.telefono || '');
    if (c.empresa) localStorage.setItem('kl_empresa', c.empresa);
    if (c.ciudad) localStorage.setItem('kl_ciudad', c.ciudad);
    klUserEmail = c.email || null; klUserName = c.nombre || null;
    if (typeof actualizarSeccionRegistro === 'function') actualizarSeccionRegistro();
    if (typeof actualizarBotonCuenta === 'function') actualizarBotonCuenta();
    renderCuenta();
}
function formAccesoHTML(modo) {
    if (modo === 'registro') {
        return `
        <p class="cuenta-intro">Creá tu cuenta para guardar tus datos y ver tus presupuestos desde cualquier dispositivo.</p>
        <form class="cuenta-form" onsubmit="hacerRegistro(event)">
            <input type="text"  id="acNombre"  placeholder="Nombre y apellido *" required autocomplete="name">
            <input type="email" id="acEmail"   placeholder="Email *" required autocomplete="email">
            <input type="tel"   id="acTel"     placeholder="Teléfono / WhatsApp *" required autocomplete="tel">
            <input type="text"  id="acEmpresa" placeholder="Empresa / Rubro (opcional)" autocomplete="organization">
            <input type="password" id="acPass" placeholder="Contraseña (mín. 6) *" required minlength="6" autocomplete="new-password">
            <div class="cuenta-err" id="acErr"></div>
            <button type="submit" class="cuenta-submit" id="acBtn">Crear mi cuenta</button>
            <span class="cuenta-legal">¿Ya tenés cuenta? <a href="#" onclick="mostrarLogin(event)">Entrá acá</a></span>
        </form>`;
    }
    return `
        <p class="cuenta-intro">Entrá a tu cuenta para ver tus datos y presupuestos en cualquier celu o compu.</p>
        <form class="cuenta-form" onsubmit="hacerLogin(event)">
            <input type="email"    id="acEmail" placeholder="Email *" required autocomplete="email">
            <input type="password" id="acPass"  placeholder="Contraseña *" required autocomplete="current-password">
            <div class="cuenta-err" id="acErr"></div>
            <button type="submit" class="cuenta-submit" id="acBtn">Entrar</button>
            <span class="cuenta-legal">¿No tenés cuenta? <a href="#" onclick="mostrarRegistro(event)">Creala acá</a></span>
        </form>`;
}
function mostrarLogin(e)    { if (e) e.preventDefault(); document.getElementById('cuentaBody').innerHTML = formAccesoHTML('login'); }
function mostrarRegistro(e) { if (e) e.preventDefault(); document.getElementById('cuentaBody').innerHTML = formAccesoHTML('registro'); }

async function hacerLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('acBtn'), err = document.getElementById('acErr');
    const email = document.getElementById('acEmail').value.trim();
    const pass  = document.getElementById('acPass').value;
    if (!email || !pass) return;
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
    try {
        const clave = await hashClave(email, pass);
        const r = await crmJsonp({ action: 'login', tab: 'Clientes', email, clave });
        if (r && r.ok) { guardarSesionCliente(r.cliente); }
        else { err.textContent = (r && r.error) || 'No se pudo entrar.'; btn.disabled = false; btn.textContent = 'Entrar'; }
    } catch (x) { err.textContent = 'Error de conexión. Reintentá.'; btn.disabled = false; btn.textContent = 'Entrar'; }
}
async function hacerRegistro(e) {
    e.preventDefault();
    const btn = document.getElementById('acBtn'), err = document.getElementById('acErr');
    const nombre  = document.getElementById('acNombre').value.trim();
    const email   = document.getElementById('acEmail').value.trim();
    const tel     = document.getElementById('acTel').value.trim();
    const empresa = document.getElementById('acEmpresa').value.trim();
    const pass    = document.getElementById('acPass').value;
    if (!nombre || !email || !tel || pass.length < 6) { err.textContent = 'Completá los datos (contraseña de 6+).'; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Creando…';
    try {
        const clave = await hashClave(email, pass);
        const r = await crmJsonp({ action: 'registrar', tab: 'Clientes', nombre, email, telefono: tel, empresa, clave });
        if (r && r.ok) {
            klPush(['identify', { '$email': email, '$first_name': nombre, '$phone_number': tel }]);
            guardarSesionCliente(r.cliente);
        } else { err.textContent = (r && r.error) || 'No se pudo crear la cuenta.'; btn.disabled = false; btn.textContent = 'Crear mi cuenta'; }
    } catch (x) { err.textContent = 'Error de conexión. Reintentá.'; btn.disabled = false; btn.textContent = 'Crear mi cuenta'; }
}

// ─── MI CUENTA ───────────────────────────────────────────────────
function clienteRegistrado() { return !!localStorage.getItem('kl_email'); }

function openCuenta() {
    renderCuenta();
    document.getElementById('cuentaOverlay').classList.add('active');
    document.getElementById('cuentaPanel').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeCuenta() {
    document.getElementById('cuentaOverlay').classList.remove('active');
    document.getElementById('cuentaPanel').classList.remove('active');
    document.body.style.overflow = '';
}

function actualizarBotonCuenta() {
    const btn = document.getElementById('cuentaBtn');
    if (btn) btn.classList.toggle('logueado', clienteRegistrado());
}

function formularioCuentaHTML(pref) {
    pref = pref || {};
    return `
        <p class="cuenta-intro">Registrate para que te reconozcamos, guardar tus favoritos y recibir ofertas.</p>
        <form class="cuenta-form" onsubmit="registrarCliente(event)">
            <input type="text"  id="ccNombre"   placeholder="Nombre y apellido *" value="${pref.nombre||''}" required autocomplete="name">
            <input type="email" id="ccEmail"    placeholder="Email *" value="${pref.email||''}" required autocomplete="email">
            <input type="tel"   id="ccTelefono" placeholder="Teléfono / WhatsApp *" value="${pref.telefono||''}" required autocomplete="tel">
            <input type="text"  id="ccEmpresa"  placeholder="Empresa / Rubro (opcional)" value="${pref.empresa||''}" autocomplete="organization">
            <input type="text"  id="ccCiudad"   placeholder="Ciudad (opcional)" value="${pref.ciudad||''}" autocomplete="address-level2">
            <button type="submit" class="cuenta-submit">Crear mi cuenta</button>
            <span class="cuenta-legal">Tus datos son solo para contactarte. No los compartimos.</span>
        </form>
    `;
}

function renderCuenta() {
    const body = document.getElementById('cuentaBody');
    if (!body) return;
    const email = localStorage.getItem('kl_email');
    if (!email) { body.innerHTML = formAccesoHTML('login'); return; }

    const nombre   = localStorage.getItem('kl_name')    || '';
    const telefono = localStorage.getItem('kl_phone')   || '';
    const empresa  = localStorage.getItem('kl_empresa') || '';
    const ciudad   = localStorage.getItem('kl_ciudad')  || '';
    const dato = (etq, val) => val ? `<div class="cuenta-dato"><span>${etq}</span><strong>${val}</strong></div>` : '';
    const faltaTel = !telefono;
    body.innerHTML = `
        <div class="cuenta-saludo">
            <div class="cuenta-avatar">${(nombre || email).charAt(0).toUpperCase()}</div>
            <div class="cuenta-saludo-txt">
                <div class="cuenta-hola">¡Hola${nombre ? ', ' + nombre : ''}!</div>
                <div class="cuenta-mail">${email}</div>
            </div>
        </div>
        <div class="cuenta-datos">
            ${dato('Teléfono', telefono)}
            ${dato('Empresa / Rubro', empresa)}
            ${dato('Ciudad', ciudad)}
        </div>
        <button class="cuenta-completar${faltaTel ? '' : ' cuenta-ghost'}" onclick="editarCuenta()">
            ${faltaTel ? 'Completar mis datos' : 'Editar mis datos'}
        </button>
        <div class="cuenta-acciones">
            <button onclick="closeCuenta(); openFavs();"><i class="fas fa-heart"></i> Mis favoritos</button>
            <button onclick="closeCuenta(); openOrders();"><i class="fas fa-history"></i> Mis pedidos</button>
        </div>
        <button class="cuenta-logout" onclick="cerrarSesionCliente()"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>
    `;
}

function editarCuenta() {
    const body = document.getElementById('cuentaBody');
    if (!body) return;
    body.innerHTML = formularioCuentaHTML({
        nombre:   localStorage.getItem('kl_name')    || '',
        email:    localStorage.getItem('kl_email')   || '',
        telefono: localStorage.getItem('kl_phone')   || '',
        empresa:  localStorage.getItem('kl_empresa') || '',
        ciudad:   localStorage.getItem('kl_ciudad')  || ''
    });
}

function registrarCliente(e) {
    e.preventDefault();
    const nombre   = document.getElementById('ccNombre').value.trim();
    const email    = document.getElementById('ccEmail').value.trim();
    const telefono = document.getElementById('ccTelefono').value.trim();
    const empresa  = document.getElementById('ccEmpresa').value.trim();
    const ciudad   = document.getElementById('ccCiudad').value.trim();
    if (!email || !nombre || !telefono) return;

    // Identidad local (para "Mi cuenta" y el saludo)
    klUserEmail = email; klUserName = nombre;
    localStorage.setItem('kl_email', email);
    localStorage.setItem('kl_name', nombre);
    localStorage.setItem('kl_phone', telefono);
    localStorage.setItem('kl_empresa', empresa);
    localStorage.setItem('kl_ciudad', ciudad);

    // Guardar en tu Google Sheets (pestaña Clientes)
    guardarClienteEnSheet({ nombre, email, telefono, empresa, ciudad, origen: 'registro web' });
    // Identificar también en Klaviyo
    klPush(['identify', { '$email': email, '$first_name': nombre, '$phone_number': telefono }]);

    actualizarSeccionRegistro();
    actualizarBotonCuenta();
    renderCuenta();
}

function cerrarSesionCliente() {
    ['kl_email','kl_name','kl_phone','kl_empresa','kl_ciudad'].forEach(k => localStorage.removeItem(k));
    klUserEmail = null; klUserName = null;
    actualizarSeccionRegistro();
    actualizarBotonCuenta();
    renderCuenta();
}

function abrirKlModal() {
    if (klUserEmail || klModalMostrado) return;
    klModalMostrado = true;
    cerrarIosNotif();
    document.getElementById('klOverlay').classList.add('active');
    setTimeout(() => document.getElementById('klModal').classList.add('active'), 10);
}

function cerrarKlModal() {
    document.getElementById('klModal').classList.remove('active');
    document.getElementById('klOverlay').classList.remove('active');
}

function abrirKlModalDesdeNotif() {
    cerrarIosNotif();
    klModalMostrado = false;
    abrirKlModal();
}

function cerrarIosNotif() {
    const n = document.getElementById('iosNotif');
    if (!n) return;
    n.classList.remove('show');
    n.classList.add('hide');
}

// Permite descartar la notificación deslizándola hacia arriba con el dedo (celu)
function initIosNotifSwipe() {
    const n = document.getElementById('iosNotif');
    if (!n) return;
    let startY = 0, dy = 0, dragging = false;

    n.addEventListener('touchstart', e => {
        startY = e.touches[0].clientY;
        dy = 0;
        dragging = true;
        n.style.transition = 'none';
    }, { passive: true });

    n.addEventListener('touchmove', e => {
        if (!dragging) return;
        dy = e.touches[0].clientY - startY;
        if (dy > 0) dy = dy * 0.25; // resistencia si arrastra hacia abajo
        n.style.transform = `translateX(-50%) translateY(${dy}px)`;
    }, { passive: true });

    n.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        n.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
        if (dy < -40) {
            // deslizó lo suficiente hacia arriba: descartar
            n.style.transform = 'translateX(-50%) translateY(-140px)';
            n.style.opacity = '0';
            setTimeout(() => {
                cerrarIosNotif();
                n.style.transform = '';
                n.style.opacity = '';
                n.style.transition = '';
            }, 250);
        } else {
            // no llegó: vuelve a su lugar
            n.style.transform = '';
            setTimeout(() => { n.style.transition = ''; }, 260);
        }
    });

    // Si fue un deslizamiento (no un toque), no abrir el modal por el onclick
    n.addEventListener('click', e => {
        if (Math.abs(dy) > 10) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
}

// Mostrar notificación iOS al entrar
window.addEventListener('load', () => {
    // Actualizar sección visible de registro
    actualizarSeccionRegistro();

    const titleEl = document.getElementById('iosNotifTitle');
    const msgEl   = document.getElementById('iosNotifMsg');

    if (klUserEmail) {
        // Usuario ya registrado: saludo personalizado por su nombre
        if (titleEl) titleEl.textContent = klUserName ? `¡Hola, ${klUserName}. Bienvenido a San Ou! 👋` : '¡Bienvenido de nuevo a San Ou! 👋';
        if (msgEl)   msgEl.textContent   = 'Mirá las ofertas y productos nuevos 🔧';
    } else {
        // Usuario nuevo: invitación a dejar el mail
        if (titleEl) titleEl.textContent = '¡Bienvenido a San Ou! 👋';
        if (msgEl)   msgEl.textContent   = 'Dejá tu mail y recibí ofertas exclusivas';
    }

    initIosNotifSwipe();
    actualizarBotonCuenta();

    setTimeout(() => {
        const n = document.getElementById('iosNotif');
        if (n) n.classList.add('show');
        // Auto-cerrar a los 6 segundos
        setTimeout(() => cerrarIosNotif(), 6000);
    }, 3500);
});

function actualizarSeccionRegistro() {
    const barra      = document.getElementById('registrate');
    const inner      = document.getElementById('ecbInner');
    const registered = document.getElementById('ecbRegistered');
    if (!inner || !registered) return;
    // Siempre ocultamos el cartel de "ya estás suscripto".
    registered.style.display = 'none';
    if (klUserEmail) {
        // Ya suscripto: no mostramos nada (ni formulario ni cartel).
        if (barra) barra.style.display = 'none';
    } else {
        // Visitante nuevo: mostramos el formulario para suscribirse.
        if (barra) barra.style.display = '';
        inner.style.display = '';
    }
}

function registrarseDesdeSeccion(e) {
    e.preventDefault();
    const email  = document.getElementById('ecbEmail').value.trim();
    const nombre = document.getElementById('ecbNombre').value.trim();
    if (!email) return;

    klUserEmail = email;
    klUserName  = nombre;
    localStorage.setItem('kl_email', email);
    if (nombre) localStorage.setItem('kl_name', nombre);

    klPush(['identify', { '$email': email, '$first_name': nombre || '' }]);
    guardarClienteEnSheet({ nombre, email, origen: 'barra registro' });
    if (typeof actualizarBotonCuenta === 'function') actualizarBotonCuenta();

    actualizarSeccionRegistro();
    cerrarIosNotif();
    cerrarKlModal();
    klTrackCart();
}

function klPush(args) {
    if (window.klaviyo) window.klaviyo.push(args);
    else { window._klOnsite = window._klOnsite || []; window._klOnsite.push(args); }
}

function guardarEmailKlaviyo(e) {
    e.preventDefault();
    const email = document.getElementById('klEmail').value.trim();
    const nombre = document.getElementById('klNombre').value.trim();
    if (!email) return;

    klUserEmail = email;
    klUserName  = nombre;
    localStorage.setItem('kl_email', email);
    if (nombre) localStorage.setItem('kl_name', nombre);

    // Identificar en Klaviyo
    klPush(['identify', { '$email': email, '$first_name': nombre || '' }]);
    guardarClienteEnSheet({ nombre, email, origen: 'popup carrito' });
    if (typeof actualizarBotonCuenta === 'function') actualizarBotonCuenta();

    cerrarKlModal();
    actualizarSeccionRegistro();
    klTrackCart();

    // Si había una compra rápida pendiente, ejecutarla ahora
    const modal = document.getElementById('klModal');
    const pendingId = modal?.dataset.pendingQuickBuy;
    if (pendingId) {
        delete modal.dataset.pendingQuickBuy;
        setTimeout(() => _doQuickBuy(parseInt(pendingId)), 300);
    }
}

function klTrackCart() {
    if (!klUserEmail || cart.length === 0) return;
    const items = cart.map(p => ({
        ProductID: String(p.id),
        ProductName: p.name,
        ProductCategories: [p.category],
        ItemPrice: p.price || 0,
        Quantity: p.qty,
        RowTotal: (p.price || 0) * p.qty,
    }));
    const total = cart.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
    klPush(['track', 'Added to Cart', {
        '$value': total,
        'AddedItemProductName': items[items.length - 1]?.ProductName || '',
        'CheckoutURL': window.location.href,
        'Items': items,
    }]);
}

function suscribirNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('fnEmail').value.trim();
    if (!email) return;
    klUserEmail = email;
    localStorage.setItem('kl_email', email);
    klPush(['identify', { '$email': email }]);
    klPush(['track', 'Newsletter Signup', { '$email': email }]);
    const btn = e.target.querySelector('.fn-btn');
    btn.textContent = '¡Listo!';
    btn.style.background = '#25D366';
    setTimeout(() => { btn.textContent = 'Suscribirme'; btn.style.background = ''; }, 3000);
}

// ─── CONFIGURACIÓN ──────────────────────────────────────────────
// Reemplazá este número con tu WhatsApp (código de país + número, sin + ni espacios)
const WHATSAPP_NUMBER = '5491131751517';

// URL de la hoja de Google Sheets publicada como CSV (Archivo → Publicar en la web → CSV)
// Dejá vacío ('') para usar los precios del código
const PRICES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtIfGdbPDoIrVhs0zQPEB_wu_rMGz5280eSTygqqTKpjqaFpcZLWN0fSet_4wKgzcZNNEuk2PfK-i0/pub?output=csv';

// ─── PRODUCTOS ──────────────────────────────────────────────────
const products = window.SANOU_PRODUCTOS || [];

const CAT_NAMES = window.SANOU_CAT_NAMES || {};

// ─── ESTADO ─────────────────────────────────────────────────────
const CART_KEY = 'sanou_cart';
let cart = (() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch(e) { return []; }
})();

function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    catch(e) {}
}

// ─── FORMATO ────────────────────────────────────────────────────
function fmt(n) {
    return '$' + n.toLocaleString('es-AR');
}

// ─── RENDER PRODUCTOS ───────────────────────────────────────────
function specsRows(specs) {
    if (!specs || specs.length === 0) return '';
    return specs.map(s => `
        <div class="spec-row">
            <span class="spec-label">${s.l}</span>
            <span class="spec-value">${s.v}</span>
        </div>`).join('');
}

function priceHTML(p) {
    if (!(p.price > 0)) return '';
    if (p.oldPrice > 0) {
        return `<div class="product-price-bar">
                   <span class="price-label">Precio</span>
                   <div class="price-values price-values--stack">
                       <span class="price-old">${fmt(p.oldPrice)}</span>
                       <span class="price-amount">${fmt(p.price)}</span>
                   </div>
               </div>`;
    }
    return `<div class="product-price-bar">
               <span class="price-label">Precio</span>
               <div class="price-values"><span class="price-amount">${fmt(p.price)}</span></div>
           </div>`;
}

function getImgs(p) {
    if (!p.imgs || p.imgs === 0) return [];
    const catFolder = p.catFolder || p.category;
    const folder = p.folder || p.name;
    if (Array.isArray(p.imgs)) {
        return p.imgs.map(f => `productos/${catFolder}/${folder}/${f}`);
    }
    const ext = p.ext || 'jpg';
    return Array.from({ length: p.imgs }, (_, i) =>
        `productos/${catFolder}/${folder}/${i + 1}.${ext}`
    );
}

function cardMedia(p) {
    const imgs = getImgs(p);
    if (imgs.length > 0) {
        return `<div class="product-media"><img src="${imgs[0]}" alt="${p.name}" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\\'product-media product-media-icon\\'><i class=\\'fas ${p.icon}\\'></i></div>'"></div>`;
    }
    return `<div class="product-media product-media-icon"><i class="fas ${p.icon}"></i></div>`;
}

function getVideo(p) {
    if (!p.video) return null;
    if (typeof p.video === 'string') return p.video; // URL de YouTube o ruta explícita
    const catFolder = p.catFolder || p.category;
    const folder = p.folder || p.name;
    return `productos/${catFolder}/${folder}/video.mp4`;
}

function buildVideoContent(url) {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (yt) {
        return `<iframe src="https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    }
    return `<video src="${url}" controls playsinline></video>`;
}

function modalMedia(p) {
    const imgs = getImgs(p);
    const videoSrc = getVideo(p);
    const items = [
        ...imgs.map(src => ({ type: 'img', src })),
        ...(videoSrc ? [{ type: 'video', src: videoSrc }] : [])
    ];

    if (items.length === 0) {
        return `<div class="modal-icon"><i class="fas ${p.icon}"></i></div>`;
    }
    if (items.length === 1 && items[0].type === 'img') {
        return `<div class="modal-img"><img src="${items[0].src}" alt="${p.name}" onerror="this.parentElement.outerHTML='<div class=\\'modal-icon\\'><i class=\\'fas ${p.icon}\\'></i></div>'"></div>`;
    }

    const slides = items.map((item, i) => {
        const active = i === 0 ? ' active' : '';
        const inner = item.type === 'video'
            ? buildVideoContent(item.src)
            : `<img src="${item.src}" alt="${p.name} ${i + 1}" onerror="this.style.display='none'">`;
        return `<div class="carousel-slide${active}">${inner}</div>`;
    }).join('');

    const dots = items.map((_, i) =>
        `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="carouselGo(${i})"></button>`
    ).join('');

    return `
        <div class="modal-carousel" id="modalCarousel" data-current="0" data-total="${items.length}">
            <div class="carousel-track">${slides}</div>
            <button class="carousel-prev" onclick="carouselStep(-1)"><i class="fas fa-chevron-left"></i></button>
            <button class="carousel-next" onclick="carouselStep(1)"><i class="fas fa-chevron-right"></i></button>
            <div class="carousel-dots">${dots}</div>
        </div>`;
}

function carouselStep(dir) {
    const el = document.getElementById('modalCarousel');
    if (!el) return;
    const total = parseInt(el.dataset.total);
    const current = parseInt(el.dataset.current);
    carouselGo((current + dir + total) % total);
}

function carouselGo(idx) {
    const el = document.getElementById('modalCarousel');
    if (!el) return;
    el.dataset.current = idx;
    el.querySelectorAll('.carousel-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
    el.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

let _currentFilter = 'all';
let productsShuffled = []; // copia mezclada SOLO para la vista "Todas las categorías"

// Badge de descuento (%) calculado con el precio propio vs. el de mercado libre
function discountBadge(p) {
    if (p.price > 0 && p.oldPrice > p.price) {
        const off = Math.round((1 - p.price / p.oldPrice) * 100);
        if (off >= 1) return `<span class="discount-badge">-${off}%</span>`;
    }
    return '';
}

// Tarjeta de producto (compartida entre la grilla de productos y la de destacados)
function stockChipHTML(p) {
    if (p.inStock === false)
        return '<span class="stock-chip stock-chip--out">Sin stock</span>';
    if (p.lowStock)
        return '<span class="stock-chip stock-chip--low"><i class="fas fa-fire"></i> ¡Pocas unidades!</span>';
    return '<span class="stock-chip"><i class="fas fa-check"></i> En stock</span>';
}

function productCardHTML(p) {
    const isFav = getFavs().includes(p.id);
    const stockChip = stockChipHTML(p);
    return `
        <div class="product-card${p.inStock === false ? ' out-of-stock' : ''}" id="pc-${p.id}" onclick="openModal(${p.id})" style="cursor:pointer">
            ${discountBadge(p)}
            <button class="fav-icon-btn${isFav ? ' active' : ''}" data-id="${p.id}" onclick="event.stopPropagation(); toggleFav(${p.id})" title="Guardar en favoritos">
                <i class="fas fa-heart"></i>
            </button>
            ${cardMedia(p)}
            <div class="product-info">
                <div class="product-chips">
                    <span class="product-badge">${p.badge || CAT_NAMES[p.category]}</span>
                    ${stockChip}
                </div>
                <h3 class="product-name">${p.name}</h3>
                <p class="product-desc">${p.desc}</p>
                <div class="specs-table">${specsRows(p.specs)}</div>
                ${priceHTML(p)}
                <div class="product-buttons" onclick="event.stopPropagation()">
                    <button class="btn-add-cart" id="add-${p.id}" onclick="addToCart(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                        Agregar al carrito
                    </button>
                    <button class="btn-quick-buy" onclick="quickBuy(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                        Compra rápida
                    </button>
                </div>
                <button class="btn-ver-detalle" onclick="event.stopPropagation(); openModal(${p.id})">
                    Ver más detalles <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>`;
}

function renderProducts(filter, showAll = false) {
    _currentFilter = filter;
    // "all" usa la copia mezclada; cada categoría mantiene su orden original
    const list = filter === 'all'
        ? (productsShuffled.length ? productsShuffled : products)
        : products.filter(p => p.category === filter || (p.extraCategories && p.extraCategories.includes(filter)));
    const grid = document.getElementById('productsGrid');
    const verMasWrap = document.getElementById('verMasWrap');

    if (list.length === 0) {
        grid.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;text-align:center;padding:40px 0">No hay productos en esta categoría aún.</p>';
        if (verMasWrap) verMasWrap.style.display = 'none';
        return;
    }

    const limite = window.innerWidth <= 768 ? 4 : 8;
    const mostrar = (showAll || list.length <= limite) ? list : list.slice(0, limite);

    grid.innerHTML = mostrar.map(productCardHTML).join('');

    // Contador de productos
    const countEl = document.getElementById('productCount');
    if (countEl) {
        countEl.textContent = list.length === products.length
            ? `${list.length} productos`
            : `${list.length} producto${list.length !== 1 ? 's' : ''}`;
        countEl.style.display = 'inline';
    }

    // Mostrar u ocultar botón "Ver más"
    if (verMasWrap) {
        verMasWrap.style.display = (!showAll && list.length > limite) ? 'flex' : 'none';
    }
}

function mostrarTodosProductos() {
    renderProducts(_currentFilter, true);
    document.getElementById('verMasWrap').style.display = 'none';
}

// ─── MODAL DE DETALLE ────────────────────────────────────────────
function openModal(id) {
    const p = products.find(x => x.id === id);
    // GA4 — vista de producto
    if (typeof gtag !== 'undefined') {
        gtag('event', 'view_item', {
            items: [{ item_id: String(p.id), item_name: p.name, item_category: p.category, price: p.price || 0 }]
        });
    }
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-product">
            ${discountBadge(p)}
            ${modalMedia(p)}
            <div class="modal-details">
                <span class="product-badge">${p.badge || CAT_NAMES[p.category]}</span>
                <h2 class="modal-title">${p.name}</h2>
                <p class="modal-desc">${p.desc}</p>
                ${p.instagram ? `<a class="btn-ig-video" href="${p.instagram}" target="_blank" rel="noopener"><i class="fab fa-instagram"></i> Ver video en Instagram</a>` : ''}
                <div class="specs-table modal-specs">${specsRows(p.allSpecs || p.specs)}</div>
                ${p.price > 0 ? `<div class="product-price-bar"><span class="price-label">Precio</span><div class="price-values">${p.oldPrice > 0 ? `<span class="price-old">${fmt(p.oldPrice)}</span>` : ''}<span class="price-amount">${fmt(p.price)}</span></div></div>` : '<div class="modal-consultar">Consultar precio por WhatsApp</div>'}
                <div class="modal-buttons">
                    <button class="btn-add-cart" onclick="addToCart(${p.id}); closeModal()">
                        Agregar al carrito
                    </button>
                    <button class="btn-quick-buy" onclick="quickBuy(${p.id})">
                        Compra rápida
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    history.replaceState(null, '', '#producto-' + id);
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('productModal').classList.remove('active');
    document.body.style.overflow = '';
    history.replaceState(null, '', window.location.pathname);
}

// ─── FILTRAR ────────────────────────────────────────────────────
function filterProducts(filter) {
    // Reflejar la categoría seleccionada en el dropdown de filtro
    const opt = document.querySelector('.filter-option[data-filter="' + filter + '"]');
    const labelEl = document.getElementById('filterDropdownLabel');
    if (labelEl) labelEl.textContent = opt ? opt.textContent.trim()
        : (filter === 'all' ? 'Todas las categorías' : (CAT_NAMES[filter] || filter));
    document.querySelectorAll('.filter-option').forEach(o =>
        o.classList.toggle('active', o.dataset.filter === filter));

    document.getElementById('searchInput').value = '';
    toggleGuiaBanner(filter);
    renderProducts(filter, true); // con filtro: mostrar TODOS, sin botón "Ver más"
    document.getElementById('productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Abrir/cerrar reseñas largas de Google
function toggleReview(btn) {
    const p = btn.previousElementSibling;
    if (!p) return;
    const open = p.classList.toggle('open');
    btn.textContent = open ? 'Ver menos' : 'Ver más';
}

// Muestra el banner de la guía de crimpadoras solo en "Todas" o "Pinzas"
function toggleGuiaBanner(filter) {
    const banner = document.getElementById('guiaBanner');
    if (!banner) return;
    banner.style.display = (filter === 'all' || filter === 'pinzas') ? '' : 'none';
}

// ─── COMPARADOR DE HERRAMIENTAS (estilo Apple) ──────────────────
let compareSlots = [null, null, null]; // hasta 3 columnas (ids de producto)

function compareOptions(selectedId) {
    let html = '<option value="">— Elegí una herramienta —</option>';
    Object.keys(CAT_NAMES).forEach(cat => {
        const items = products.filter(p => p.category === cat);
        if (!items.length) return;
        html += `<optgroup label="${CAT_NAMES[cat]}">`;
        items.forEach(p => {
            html += `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${p.name}</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

// 2 columnas en celular, 3 en computadora
function visibleCols() {
    return window.matchMedia('(max-width: 700px)').matches ? 2 : 3;
}

// Tarjeta de producto: foto + nombre + precio. NO es fija: se va al bajar.
function compareColCard(slotIdx) {
    const id = compareSlots[slotIdx];
    const p = id ? products.find(x => x.id === id) : null;
    if (!p) {
        return `<div class="cmp-colcard cmp-colcard--empty">
            <div class="cmp-img cmp-img--placeholder"><i class="fas fa-plus"></i></div>
        </div>`;
    }
    const imgs = getImgs(p);
    const img = imgs.length
        ? `<img src="${imgs[0]}" alt="${p.name}" class="cmp-img" onerror="this.outerHTML='<div class=\\'cmp-img cmp-img--icon\\'><i class=\\'fas ${p.icon}\\'></i></div>'">`
        : `<div class="cmp-img cmp-img--icon"><i class="fas ${p.icon}"></i></div>`;
    const badge = discountBadge(p);
    const price = p.price > 0
        ? `<div class="cmp-price">${p.oldPrice > p.price ? `<span class="cmp-price-old">${fmt(p.oldPrice)}</span>` : ''}<span class="cmp-price-now">${fmt(p.price)}</span></div>`
        : `<div class="cmp-price cmp-price--consult">Consultar precio</div>`;
    return `<div class="cmp-colcard">
        <div class="cmp-img-wrap">${badge}${img}</div>
        <div class="cmp-name">${p.name}</div>
        ${price}
    </div>`;
}

// Barra compacta: selector + botones. Esta SÍ queda fija arriba al bajar.
function compareColBar(slotIdx) {
    const id = compareSlots[slotIdx];
    const p = id ? products.find(x => x.id === id) : null;
    const select = `<div class="cmp-select-wrap"><select class="cmp-select" onchange="setCompareSlot(${slotIdx}, this.value)">${compareOptions(id)}</select><i class="fas fa-chevron-down"></i></div>`;
    const actions = p ? `<div class="cmp-col-actions">
            <button class="cmp-btn cmp-btn--buy" onclick="quickBuy(${p.id})">Comprar</button>
            <button class="cmp-btn cmp-btn--link" onclick="openModal(${p.id})">Más información <i class="fas fa-chevron-right"></i></button>
        </div>` : '';
    return `<div class="cmp-colbar">${select}${actions}</div>`;
}

// Agrupa las specs en secciones que se van revelando al bajar
function specGroup(label) {
    const l = label.toLowerCase();
    if (/(peso|medida|dimension|tama|largo|ancho|alto|empaque)/.test(l)) return 'Dimensiones y peso';
    if (/(modelo|aplica|material|marca|incluye|contenido)/.test(l)) return 'General';
    return 'Especificaciones';
}
const SPEC_GROUP_ORDER = ['General', 'Especificaciones', 'Dimensiones y peso'];

let _cmpCols = null;

function renderCompare() {
    const n = visibleCols();
    _cmpCols = n;
    const sel = compareSlots.slice(0, n).map(id => id ? products.find(p => p.id === id) : null);
    const active = sel.filter(Boolean);
    // unión de etiquetas de specs en orden de aparición
    const labels = [];
    active.forEach(p => (p.allSpecs || p.specs || []).forEach(s => {
        if (!labels.includes(s.l)) labels.push(s.l);
    }));

    // fila 1: tarjetas (se van al bajar) — fila 2: barra compacta (queda fija)
    let html = sel.map((_, i) => compareColCard(i)).join('');
    html += sel.map((_, i) => compareColBar(i)).join('');

    if (!labels.length) {
        html += `<div class="cmp-empty-msg">Elegí al menos una herramienta para ver sus características.</div>`;
    } else {
        // fila de precio
        html += sel.map(p => {
            if (!p) return '<div class="cmp-cell cmp-cell--empty"><span class="cmp-val">—</span><span class="cmp-lbl">Precio</span></div>';
            if (!(p.price > 0)) return '<div class="cmp-cell"><span class="cmp-val cmp-val--muted">Consultar</span><span class="cmp-lbl">Precio</span></div>';
            return `<div class="cmp-cell">${p.oldPrice > p.price ? `<span class="cmp-cell-old">${fmt(p.oldPrice)}</span>` : ''}<span class="cmp-val cmp-val--price">${fmt(p.price)}</span><span class="cmp-lbl">Precio</span></div>`;
        }).join('');

        // secciones de características
        const groups = {};
        labels.forEach(l => { const g = specGroup(l); (groups[g] = groups[g] || []).push(l); });
        SPEC_GROUP_ORDER.forEach(g => {
            if (!groups[g] || !groups[g].length) return;
            html += `<div class="cmp-section">${g}</div>`;
            groups[g].forEach(l => {
                html += sel.map(p => {
                    const spec = p ? (p.allSpecs || p.specs || []).find(s => s.l === l) : null;
                    const val = spec ? spec.v : '—';
                    return `<div class="cmp-cell${spec ? '' : ' cmp-cell--empty'}">
                        <span class="cmp-val">${val}</span>
                        <span class="cmp-lbl">${l}</span>
                    </div>`;
                }).join('');
            });
        });
    }
    document.getElementById('compareTable').innerHTML = html;
}

// Si cambia el tamaño de pantalla y cambia la cantidad de columnas, re-dibujar
window.addEventListener('resize', () => {
    const m = document.getElementById('compareModal');
    if (!m || !m.classList.contains('active')) return;
    if (visibleCols() !== _cmpCols) renderCompare();
});

function setCompareSlot(i, val) {
    compareSlots[i] = val ? parseInt(val, 10) : null;
    renderCompare();
}

function openCompare() {
    // por defecto arranca comparando las dos primeras crimpadoras
    if (compareSlots.every(x => x === null)) {
        const pinzas = products.filter(p => p.category === 'pinzas');
        compareSlots = [pinzas[0] ? pinzas[0].id : null, pinzas[1] ? pinzas[1].id : null, null];
    }
    renderCompare();
    document.getElementById('compareOverlay').classList.add('active');
    document.getElementById('compareModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    const sc = document.querySelector('.compare-scroll');
    if (sc) sc.scrollTop = 0;
}

function closeCompare() {
    document.getElementById('compareOverlay').classList.remove('active');
    document.getElementById('compareModal').classList.remove('active');
    document.body.style.overflow = '';
}

// ─── BUSCADOR ────────────────────────────────────────────────────
function searchProducts(query) {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const grid = document.getElementById('productsGrid');
    const list = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
        (CAT_NAMES[p.category] || '').toLowerCase().includes(q) ||
        (p.badge || '').toLowerCase().includes(q)
    );
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (list.length === 0) {
        grid.innerHTML = `<p style="color:var(--gray);grid-column:1/-1;text-align:center;padding:40px 0">No se encontraron productos para "<strong style="color:var(--white)">${query}</strong>".</p>`;
    } else {
        grid.innerHTML = list.map(p => `
            <div class="product-card${p.inStock === false ? ' out-of-stock' : ''}" id="pc-${p.id}" onclick="openModal(${p.id})" style="cursor:pointer">
                ${cardMedia(p)}
                <div class="product-info">
                    <span class="product-badge">${p.badge || CAT_NAMES[p.category]}</span>
                    <h3 class="product-name">${p.name}</h3>
                    <p class="product-desc">${p.desc}</p>
                    <div class="specs-table">${specsRows(p.specs)}</div>
                    ${priceHTML(p)}
                    <div class="product-buttons" onclick="event.stopPropagation()">
                        <button class="btn-add-cart" id="add-${p.id}" onclick="addToCart(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                            Agregar al carrito
                        </button>
                        <button class="btn-quick-buy" onclick="quickBuy(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                            Compra rápida
                        </button>
                    </div>
                    <button class="btn-ver-detalle" onclick="event.stopPropagation(); openModal(${p.id})">
                        Ver más detalles <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    document.getElementById('productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── CARRITO ─────────────────────────────────────────────────────
function addToCart(id) {
    const product = products.find(p => p.id === id);
    // GA4 — agregar al carrito
    if (typeof gtag !== 'undefined') {
        gtag('event', 'add_to_cart', {
            currency: 'ARS',
            value: product.price || 0,
            items: [{ item_id: String(product.id), item_name: product.name, item_category: product.category, price: product.price || 0, quantity: 1 }]
        });
    }
    const existing = cart.find(i => i.id === id);
    // Klaviyo — mostrar modal si no tenemos email aún
    setTimeout(() => {
        if (!klUserEmail) abrirKlModal();
        else klTrackCart();
    }, 600);

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    saveCart();
    updateCartUI();
    openCart();

    // Feedback visual en el botón
    const btn = document.getElementById(`add-${id}`);
    if (btn) {
        btn.classList.add('added');
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
        setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = '<i class="fas fa-cart-plus"></i> Agregar al carrito';
        }, 1800);
    }
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    saveCart();
    updateCartUI();
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart();
    updateCartUI();
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartUI();
}

function updateCartUI() {
    const total    = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const count    = cart.reduce((s, i) => s + i.qty, 0);
    const itemsEl  = document.getElementById('cartItems');
    const countEl  = document.getElementById('cartCount');
    const totalEl  = document.getElementById('cartTotal');
    const totalRow = document.getElementById('cartTotalRow');

    countEl.textContent = count;

    if (cart.length === 0) {
        itemsEl.innerHTML = `<div class="cart-empty"><p>Todavía no agregaste productos.</p></div>`;
        if (totalRow) totalRow.style.display = 'none';
        return;
    }

    if (totalRow) totalRow.style.display = 'flex';
    totalEl.textContent = fmt(total);

    itemsEl.innerHTML = cart.map(item => {
        const prod = products.find(p => p.id === item.id);
        const imgs = prod ? getImgs(prod) : [];
        const media = imgs.length
            ? `<img src="${imgs[0]}" alt="${item.name}" class="cart-item-img" loading="lazy" onerror="this.outerHTML='<div class=\\'cart-item-icon\\'><i class=\\'fas ${item.icon}\\'></i></div>'">`
            : `<div class="cart-item-icon"><i class="fas ${item.icon}"></i></div>`;
        return `
        <div class="cart-item">
            ${media}
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-unit">Precio unitario: ${fmt(item.price)}</div>
                <div class="cart-item-subtotal">Subtotal: ${fmt(item.price * item.qty)}</div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)"><i class="fas fa-minus"></i></button>
                    <span class="qty-num">${item.qty}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, 1)"><i class="fas fa-plus"></i></button>
                    <button class="cart-item-remove" onclick="removeFromCart(${item.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

// ─── ABRIR / CERRAR CARRITO ──────────────────────────────────────
function openCart() {
    document.getElementById('cartSidebar').classList.add('active');
    document.getElementById('cartOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    // Klaviyo — pedir email al abrir carrito si hay productos
    if (cart.length > 0) setTimeout(() => { if (!klUserEmail) abrirKlModal(); }, 800);
}

function closeCart() {
    document.getElementById('cartSidebar').classList.remove('active');
    document.getElementById('cartOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ─── WHATSAPP: CARRITO COMPLETO ──────────────────────────────────
// ─── PEDIR PRESUPUESTO (web → PDF + CRM) ─────────────────────────
function pedirPresupuesto() {
    if (cart.length === 0) { alert('Agregá al menos un producto al carrito.'); return; }
    const set = (id, v) => { const e = document.getElementById(id); if (e && v) e.value = v; };
    set('ppNombre',   localStorage.getItem('kl_name'));
    set('ppEmail',    localStorage.getItem('kl_email'));
    set('ppTelefono', localStorage.getItem('kl_phone'));
    set('ppEmpresa',  localStorage.getItem('kl_empresa'));
    document.getElementById('ppOverlay').classList.add('active');
    document.getElementById('ppModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const n = document.getElementById('ppNombre'); if (n && !n.value) n.focus(); }, 120);
}
function cerrarPresupuesto() {
    document.getElementById('ppOverlay').classList.remove('active');
    document.getElementById('ppModal').classList.remove('active');
    document.body.style.overflow = '';
}
function _ddmmaaaa(f) { return String(f.getDate()).padStart(2,'0') + '/' + String(f.getMonth()+1).padStart(2,'0') + '/' + f.getFullYear(); }

function generarPresupuestoWeb(e) {
    e.preventDefault();
    if (cart.length === 0) return;
    const nombre   = document.getElementById('ppNombre').value.trim();
    const telefono = document.getElementById('ppTelefono').value.trim();
    const email    = document.getElementById('ppEmail').value.trim();
    const empresa  = document.getElementById('ppEmpresa').value.trim();
    const cuit     = document.getElementById('ppCuit').value.trim();
    if (!nombre || !telefono || !email) return;

    // Ítems con precio FINAL c/IVA (mismo criterio que el cotizador del CRM)
    const items = cart.map(p => ({ nombre: p.name, cantidad: p.qty, precioFinal: p.price || 0 }));
    const total = items.reduce((s, i) => s + i.precioFinal * i.cantidad, 0);
    const numero = 'P-' + String(Date.now()).slice(-6);
    const hoy = new Date(); const vence = new Date(hoy); vence.setDate(vence.getDate() + 7);
    const contacto = [telefono, email].filter(Boolean).join(' / ');

    // Mismo formato que presupuesto.html / cotizador del CRM
    const datos = {
        numero,
        fechaEmision: _ddmmaaaa(hoy),
        fechaVence: _ddmmaaaa(vence),
        cliente: { razon: empresa ? (nombre + ' — ' + empresa) : nombre, cuit, condIva: 'Consumidor Final', contacto, dom: '' },
        items, envio: 0, obs: ''
    };

    // recordar identidad para "Mi cuenta"
    localStorage.setItem('kl_email', email); localStorage.setItem('kl_name', nombre); localStorage.setItem('kl_phone', telefono);
    if (empresa) localStorage.setItem('kl_empresa', empresa);
    if (typeof actualizarBotonCuenta === 'function') actualizarBotonCuenta();

    // guardar el presupuesto para la pestaña que lo va a mostrar/imprimir
    try { localStorage.setItem('sanou_presupuesto', JSON.stringify(datos)); } catch (err) {}

    // guardar lead + presupuesto en el CRM (con los datos para regenerarlo igual)
    guardarClienteEnSheet({ nombre, email, telefono, empresa, origen: 'presupuesto web' });
    guardarCotizacionWeb({ datos, total });

    if (typeof gtag !== 'undefined') gtag('event', 'presupuesto_web', { value: total, currency: 'ARS' });
    if (typeof saveOrder === 'function') saveOrder(cart, total);
    cerrarPresupuesto();

    // abrir el presupuesto (misma plantilla que el CRM) → se descarga/imprime como PDF
    window.open('presupuesto.html', '_blank');
}
function guardarCotizacionWeb(d) {
    if (!CLIENTES_URL) return;
    try {
        const detalle = (d.datos.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
        const params = new URLSearchParams({
            action: 'add', tab: 'Cotizaciones',
            cliente:  (d.datos.cliente.razon || '').split(' — ')[0],
            telefono: (d.datos.cliente.contacto || '').replace(/[^\d]/g, ''),
            detalle:  detalle,
            monto:    String(Math.round(d.total)),
            estado:   'Abierta',
            notas:    'web|' + JSON.stringify(d.datos)   // datos completos para reabrir el mismo PDF desde el CRM
        });
        fetch(CLIENTES_URL + '?' + params.toString(), { mode: 'no-cors' });
    } catch (e) { /* silencioso */ }
}

function checkoutWhatsApp() {
    if (cart.length === 0) return;
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    let msg = '🛠 *Hola San Ou! Quiero cotizar los siguientes productos:*\n\n';
    cart.forEach(item => {
        msg += `▪ *${item.name}*\n`;
        msg += `  Cantidad: ${item.qty}\n`;
        msg += `  Precio unitario: ${fmt(item.price)}\n`;
        msg += `  Subtotal: ${fmt(item.price * item.qty)}\n\n`;
    });
    msg += `💰 *Total estimado: ${fmt(total)}*\n\n`;
    msg += '¿Pueden confirmar disponibilidad, stock y formas de pago? ¡Muchas gracias!';

    // Guardar en historial
    saveOrder(cart, total);

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');

    // Página de gracias (conversión Google Ads / Analytics)
    setTimeout(() => { window.location.href = 'gracias.html'; }, 500);
}

// ─── WHATSAPP: COMPRA RÁPIDA ─────────────────────────────────────
function quickBuy(id) {
    // Va directo a WhatsApp (sin frenar con captura de email),
    // así el redirect funciona en el celular sin que lo bloquee el navegador.
    _doQuickBuy(id);
}

function _doQuickBuy(id) {
    const p = products.find(x => x.id === id);
    // GA4 — compra rápida
    if (typeof gtag !== 'undefined') {
        gtag('event', 'compra_rapida', {
            currency: 'ARS',
            value: p.price || 0,
            items: [{ item_id: String(p.id), item_name: p.name, item_category: p.category, price: p.price || 0 }]
        });
    }
    let msg = `🛠 *Hola San Ou! Me interesa este producto:*\n\n`;
    msg += `▪ *${p.name}*\n`;
    msg += `  Categoría: ${CAT_NAMES[p.category]}\n`;
    msg += `  Precio de referencia: ${fmt(p.price)}\n\n`;
    msg += '¿Pueden confirmar disponibilidad, stock y formas de pago? ¡Muchas gracias!';

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');

    // Página de gracias (conversión Google Ads / Analytics)
    setTimeout(() => { window.location.href = 'gracias.html'; }, 500);
}

// ─── MENÚ MOBILE ────────────────────────────────────────────────
function toggleMenu() {
    const nav = document.getElementById('nav');
    const header = document.querySelector('.header');
    const icon = document.getElementById('menuToggle').querySelector('i');
    nav.classList.toggle('open');
    icon.className = nav.classList.contains('open') ? 'fas fa-times' : 'fas fa-bars';
    if (nav.classList.contains('open')) {
        nav.style.top = header.getBoundingClientRect().bottom + 'px';
    }
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        document.getElementById('nav').classList.remove('open');
        document.getElementById('menuToggle').querySelector('i').className = 'fas fa-bars';
    });
});

// ─── HEADER SCROLL ──────────────────────────────────────────────
// Botón volver arriba
window.addEventListener('scroll', () => {
    const btn = document.getElementById('backToTop');
    if (btn) btn.classList.toggle('visible', window.scrollY > 400);
});

window.addEventListener('scroll', () => {
    document.getElementById('header').style.padding = '0';
});

// ─── PRECIOS DESDE GOOGLE SHEETS ─────────────────────────────────
// Parser de una línea CSV (respeta campos entre comillas con comas adentro)
function parseCsvLine(line) {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; } }
            else cur += c;
        } else {
            if (c === '"') inQ = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
    }
    out.push(cur);
    return out;
}

async function loadPricesFromSheet() {
    if (!PRICES_CSV_URL) return;
    try {
        // Timeout: si el Sheet no responde en 7s, abortamos para NO colgar
        // el arranque del catálogo (antes esto dejaba la página muerta).
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 7000);
        const res = await fetch(PRICES_CSV_URL, { signal: ctrl.signal });
        clearTimeout(t);
        const text = await res.text();
        const rows = text.trim().split('\n').slice(1); // saltar encabezado
        // Columnas fijas: 0=Nombre, 1=Precios, 2=Stock, 3=Precio mercado libre, 4=DESTACADO
        rows.forEach(row => {
            if (!row.trim()) return;
            const f = parseCsvLine(row);
            const nombre = (f[0] || '').trim().replace(/^"|"$/g, '');
            if (!nombre) return;
            const product = products.find(p => (p.sheetName || p.name).toLowerCase() === nombre.toLowerCase());
            if (!product) return;

            const precio      = (f[1] || '').trim();
            const stockRaw    = (f[2] || '').trim().toLowerCase();
            const oldPriceRaw = (f[3] || '').trim();
            const destRaw     = (f[4] || '').trim().toLowerCase();

            const priceVal    = precio      ? parseInt(precio.replace(/[$\.,]/g, ''))      : 0;
            const oldPriceVal = oldPriceRaw ? parseInt(oldPriceRaw.replace(/[$\.,]/g, '')) : 0;
            if (priceVal > 0 && oldPriceVal > 0)      { product.price = priceVal;    product.oldPrice = oldPriceVal; }
            else if (priceVal > 0)                    { product.price = priceVal;    product.oldPrice = 0; }
            else if (oldPriceVal > 0)                 { product.price = oldPriceVal; product.oldPrice = 0; }

            if (stockRaw) product.inStock = (stockRaw === 'true' || stockRaw === 'si');
            product.featured = (destRaw === 'true' || destRaw === 'si');
        });
    } catch (e) {
        console.warn('No se pudieron cargar precios desde Google Sheets:', e);
    }
}

// ─── PRODUCTOS DESTACADOS ────────────────────────────────────────
const FEATURED_IDS = [1, 3, 8];
let featuredCurrent = 0;
let featuredTimer = null;
let featuredCount = 0;

// Destacados = productos marcados en el Sheet (columna DESTACADO).
// Si todavía no hay ninguno marcado, usa los fijos como respaldo.
function getDestacados() {
    const feat = products.filter(p => p.featured);
    if (feat.length) return feat;
    return FEATURED_IDS.map(id => products.find(p => p.id === id)).filter(Boolean);
}

function featuredPrev() { if (featuredCount > 0) featuredGo((featuredCurrent - 1 + featuredCount) % featuredCount); }
function featuredNext() { if (featuredCount > 0) featuredGo((featuredCurrent + 1) % featuredCount); }

function renderFeatured() {
    const track = document.getElementById('featuredTrack');
    const dotsEl = document.getElementById('featuredDots');
    if (!track || !dotsEl) return;
    if (featuredTimer) clearInterval(featuredTimer);

    const items = getDestacados();
    featuredCount = items.length;

    track.innerHTML = items.map((p, i) => {
        const imgs = getImgs(p);
        const imgHTML = imgs.length
            ? `<img src="${imgs[0]}" alt="${p.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas ${p.icon} featured-icon\\'></i>'">`
            : `<i class="fas ${p.icon} featured-icon"></i>`;
        const specsHTML = p.specs.filter(s => s.l).map(s =>
            `<div class="featured-spec-row"><span>${s.l}</span><span>${s.v}</span></div>`
        ).join('');
        return `
        <div class="featured-slide${i === 0 ? ' active' : ''}" data-id="${p.id}" style="cursor:pointer">
            <div class="featured-media">${imgHTML}</div>
            <div class="featured-info">
                <span class="featured-badge">${p.badge || ''}</span>
                <h3 class="featured-name">${p.name}</h3>
                <div class="featured-specs">${specsHTML}</div>
                <button class="featured-cta" onclick="event.stopPropagation();openModal(${p.id})">
                    <i class="fas fa-eye"></i> Ver más detalles
                </button>
            </div>
        </div>`;
    }).join('');

    dotsEl.innerHTML = items.map((_, i) =>
        `<button class="featured-dot${i === 0 ? ' active' : ''}" onclick="featuredGo(${i})"></button>`
    ).join('');

    featuredTimer = setInterval(() => featuredGo((featuredCurrent + 1) % items.length), 15000);

    // Swipe táctil
    let touchStartX = 0;
    let featuredSwiped = false;
    track.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        featuredSwiped = false;
    }, { passive: true });
    track.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) < 40) return;
        featuredSwiped = true;
        const total = featuredCount;
        if (diff > 0) featuredGo((featuredCurrent + 1) % total);
        else featuredGo((featuredCurrent - 1 + total) % total);
    }, { passive: true });
    track.addEventListener('click', e => {
        if (featuredSwiped) { featuredSwiped = false; return; }
        const slide = e.target.closest('.featured-slide');
        if (slide) {
            const id = parseInt(slide.dataset.id);
            if (id) openModal(id);
        }
    });
}

function featuredGo(idx) {
    const track = document.getElementById('featuredTrack');
    const dotsEl = document.getElementById('featuredDots');
    if (!track) return;
    track.querySelectorAll('.featured-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
    dotsEl.querySelectorAll('.featured-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    featuredCurrent = idx;
}

// Destacados: carrusel arriba + un botón que despliega/cierra la grilla completa.
// Cerrado: solo el botón "Ver todos los productos destacados".
// Abierto: se muestran todos + botón "Cerrar productos destacados" debajo.
let destacadosOpen = false;
function renderDestacadosGrid() {
    const grid = document.getElementById('destacadosGrid');
    const wrap = document.getElementById('verMasDestacadosWrap');
    const btn  = document.getElementById('btnDestacados');
    if (!grid || !wrap || !btn) return;
    const list = getDestacados();
    if (list.length === 0) { grid.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    if (destacadosOpen) {
        grid.innerHTML = list.map(productCardHTML).join('');
        btn.innerHTML = 'Cerrar productos destacados <i class="fas fa-chevron-up"></i>';
    } else {
        grid.innerHTML = '';
        btn.innerHTML = 'Ver todos los productos destacados <i class="fas fa-chevron-down"></i>';
    }
}

function toggleDestacados() {
    destacadosOpen = !destacadosOpen;
    renderDestacadosGrid();
    // Al cerrar, volver al inicio de la sección destacados
    if (!destacadosOpen) {
        document.getElementById('destacados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ─── FILTER DROPDOWN ─────────────────────────────────────────────
function toggleFilterDropdown() {
    const menu  = document.getElementById('filterDropdownMenu');
    const btn   = document.getElementById('filterDropdownBtn');
    const arrow = document.getElementById('filterArrow');
    const open  = menu.classList.toggle('open');
    btn.classList.toggle('open', open);
    arrow.classList.toggle('open', open);
}

function selectFilter(cat, label) {
    document.getElementById('filterDropdownLabel').textContent = label;
    document.querySelectorAll('.filter-option').forEach(o => o.classList.toggle('active', o.dataset.filter === cat));
    toggleFilterDropdown();
    // Actualizar URL con la categoría seleccionada
    if (cat === 'all') {
        history.replaceState(null, '', window.location.pathname);
    } else {
        history.replaceState(null, '', '#categoria-' + cat);
    }
    filterProducts(cat);
}

// Cerrar al hacer click fuera
document.addEventListener('click', e => {
    const wrap = document.getElementById('filterBar');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('filterDropdownMenu')?.classList.remove('open');
        document.getElementById('filterDropdownBtn')?.classList.remove('open');
        document.getElementById('filterArrow')?.classList.remove('open');
    }
});

// ─── MAYORISTAS ──────────────────────────────────────────────────
function enviarMayorista() {
    const nombre    = document.getElementById('mayoristaNombre').value.trim();
    const localidad = document.getElementById('mayoristaLocalidad').value.trim();
    const rubro     = document.getElementById('mayoristaRubro').value.trim();
    const msg       = document.getElementById('mayoristaMsg').value.trim();

    let texto = `🏪 *Consulta de Revendedor / Mayorista*\n\n`;
    if (nombre)    texto += `👤 *Nombre:* ${nombre}\n`;
    if (localidad) texto += `📍 *Localidad:* ${localidad}\n`;
    if (rubro)     texto += `🔧 *Rubro:* ${rubro}\n`;
    if (msg)       texto += `\n💬 *Mensaje:*\n${msg}\n`;
    texto += `\n¡Quiero más información sobre precios mayoristas y cómo ser revendedor de San Ou!`;

    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(texto), '_blank');
}

// ─── CATÁLOGO PDF ────────────────────────────────────────────────
function openCatalog() {
    const base = window.location.href.replace(/[^\/]*$/, '');

    function firstImg(p) {
        const catFolder = p.catFolder || p.category;
        const folder    = p.folder || p.name;
        if (Array.isArray(p.imgs)) return base + `productos/${catFolder}/${folder}/${p.imgs[0]}`;
        const ext = p.ext || 'jpg';
        return base + `productos/${catFolder}/${folder}/1.${ext}`;
    }

    const catOrder = ['pinzas','dobladoras','cortahierro','mordazas','bombas','sacabocados','cilindros','cortadoras','extractores','punzonadoras','motores'];

    let body = '';
    catOrder.forEach(cat => {
        const prods = products.filter(p => p.category === cat || (p.extraCategories || []).includes(cat));
        if (!prods.length) return;
        body += `<div class="cat-section">
            <div class="cat-header">${CAT_NAMES[cat] || cat}</div>
            <div class="prods-grid">`;
        prods.forEach(p => {
            const img = firstImg(p);
            const price = p.price ? `$${p.price.toLocaleString('es-AR')}` : 'Consultar precio';
            const allSpecsList = p.allSpecs || p.specs || [];
            const specs = allSpecsList.map(s =>
                `<tr><td class="sl">${s.l}</td><td class="sv">${s.v}</td></tr>`).join('');
            body += `<div class="pc">
                <div class="pi"><img src="${img}" alt="${p.name}" onerror="this.src='';this.parentElement.innerHTML='<div class=ni>⚙</div>'"></div>
                <div class="pd">
                    <span class="pb">${p.badge || CAT_NAMES[p.category] || ''}</span>
                    <h3 class="pn">${p.name}</h3>
                    ${p.desc ? `<p class="pdesc">${p.desc}</p>` : ''}
                    ${specs ? `<table class="st"><tbody>${specs}</tbody></table>` : ''}
                    <div class="pp">${price}</div>
                </div>
            </div>`;
        });
        body += `</div></div>`;
    });

    const logoUrl = base + 'Logo 2.png';
    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catálogo San Ou</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#f2f2f2;color:#111}
/* COVER */
.cover{background:#0D0D0D;color:#fff;padding:60px 24px;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cover img{height:140px;margin-bottom:10px}
.cover .slogan{font-size:1.3rem;font-weight:900;margin-bottom:24px;line-height:1.3}
.cover .slogan-white{color:#fff}
.cover .slogan-yellow{color:#FFD700;display:block}
.cover .line{width:60px;height:4px;background:#FFD700;margin:18px auto}
.cover h1{font-size:2.4rem;color:#FFD700;letter-spacing:4px;margin-bottom:6px}
.cover .sub{color:#aaa;font-size:0.9rem;margin-bottom:4px}
.cover .contact{margin-top:28px;width:100%;max-width:780px}
.cover .contact-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:left}
.cover .contact-item{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:14px 16px}
.cover .contact-icon{font-size:1.4rem;width:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.icon-wa{color:#25D366}
.icon-mail{color:#1a73e8}
.icon-web{color:#aaa}
.icon-loc{color:#ea4335}
.icon-ig{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.icon-tt{color:#fff}
.cover .contact-label{font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
.cover .contact-val{font-size:0.88rem;color:#fff;font-weight:700}
/* SECTION */
.cat-section{margin-bottom:4px}
.cat-header{background:#FFD700;color:#0D0D0D;font-size:0.95rem;font-weight:900;padding:9px 16px;text-transform:uppercase;letter-spacing:2px}
/* GRID */
.prods-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#ddd;margin-bottom:4px}
/* CARD */
.pc{background:#fff;display:flex;flex-direction:column}
.pi{width:100%;height:160px;overflow:hidden;background:#f5f5f5;display:flex;align-items:center;justify-content:center}
.pi img{width:100%;height:100%;object-fit:contain}
.ni{font-size:3rem;color:#ccc;display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.pd{padding:10px;display:flex;flex-direction:column;gap:5px;flex:1}
.pb{display:inline-block;background:#FFF8CC;color:#7a5c00;border:1px solid #FFD700;border-radius:3px;font-size:0.6rem;font-weight:700;padding:2px 6px;text-transform:uppercase;letter-spacing:1px}
.pn{font-size:0.85rem;font-weight:800;line-height:1.3;color:#111}
.pdesc{font-size:0.67rem;color:#777;line-height:1.4}
.st{width:100%;border-collapse:collapse;font-size:0.65rem;margin-top:2px}
.st tr{border-bottom:1px solid #f0f0f0}
.sl{color:#999;padding:3px 4px 3px 0;font-weight:600;width:52%}
.sv{color:#333;font-weight:700;text-align:right;padding:3px 0}
.pp{margin-top:auto;padding-top:6px;font-size:0.9rem;font-weight:900;color:#7a5c00;border-top:1px solid #f0f0f0}
/* FOOTER */
.cat-footer{background:#0D0D0D;color:#aaa;text-align:center;padding:18px;font-size:0.78rem;margin-top:4px}
.cat-footer b{color:#FFD700}
/* DOWNLOAD BAR */
.dl-bar{position:sticky;top:0;z-index:999;background:#FFD700;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;box-shadow:0 2px 12px rgba(0,0,0,0.2);flex-wrap:wrap}
.dl-bar p{font-size:0.8rem;font-weight:600;color:#0D0D0D;text-align:center}
.dl-btn{background:#0D0D0D;color:#FFD700;border:none;padding:9px 22px;border-radius:50px;font-size:0.9rem;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:8px;transition:opacity 0.2s;white-space:nowrap}
.dl-btn:hover{opacity:0.85}
/* MOBILE */
@media(max-width:640px){
    .cover{padding:40px 16px;min-height:auto}
    .cover img{height:90px}
    .cover .slogan{font-size:1rem}
    .cover h1{font-size:1.6rem;letter-spacing:2px}
    .cover .contact-grid{grid-template-columns:1fr 1fr;gap:8px}
    .cover .contact-val{font-size:0.78rem}
    .prods-grid{grid-template-columns:1fr 1fr;gap:3px}
    .pi{height:130px}
    .pn{font-size:0.78rem}
    .pd{padding:8px}
    .dl-bar p{display:none}
    .dl-btn{width:100%;justify-content:center}
}
@media(max-width:380px){
    .prods-grid{grid-template-columns:1fr}
    .pi{height:180px}
    .cover .contact-grid{grid-template-columns:1fr}
}
@media print{
    .dl-bar{display:none}
    body{background:#fff}
    .cover{page-break-after:always}
    .pc{page-break-inside:avoid}
}
</style></head><body>
<div class="cover">
    <img src="${logoUrl}" alt="San Ou" onerror="this.style.display='none'">
    <p class="slogan"><span class="slogan-white">Equipate con</span><span class="slogan-yellow">herramientas de verdad</span></p>
    <div class="line"></div>
    <h1>CATÁLOGO</h1>
    <p class="sub">Herramientas hidráulicas e industriales</p>
    <div class="line"></div>
    <div class="contact">
        <div class="contact-grid">
            <div class="contact-item">
                <span class="contact-icon"><i class="fab fa-whatsapp icon-wa"></i></span>
                <div><div class="contact-label">WhatsApp</div><div class="contact-val">+54 9 11 3175-1517</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fas fa-envelope icon-mail"></i></span>
                <div><div class="contact-label">Email</div><div class="contact-val">ventas@sanou.com.ar</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fas fa-globe icon-web"></i></span>
                <div><div class="contact-label">Web</div><div class="contact-val">sanou.com.ar</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fas fa-location-dot icon-loc"></i></span>
                <div><div class="contact-label">Dirección</div><div class="contact-val">Marcelo Camboa 6306, Bs. As.</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fab fa-instagram icon-ig"></i></span>
                <div><div class="contact-label">Instagram</div><div class="contact-val">@sanou.arg</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fab fa-tiktok icon-tt"></i></span>
                <div><div class="contact-label">TikTok</div><div class="contact-val">@san.ou</div></div>
            </div>
        </div>
    </div>
</div>
${body}
<div class="cat-footer"><b>San Ou</b> — Herramientas hidráulicas profesionales &nbsp;|&nbsp; sanou.com.ar &nbsp;|&nbsp; +54 9 11 3175-1517</div>
<script>
function descargarPDF() {
    const btn = document.getElementById('dlBtn');
    btn.textContent = '⏳ Generando...';
    btn.disabled = true;
    const bar = document.querySelector('.dl-bar');
    bar.style.display = 'none';
    html2pdf().set({
        margin: 0,
        filename: 'catalogo-sanou.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(document.body).save().then(() => {
        bar.style.display = 'flex';
        btn.textContent = '⬇ Descargar PDF';
        btn.disabled = false;
    });
}
<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}

// ─── WHATSAPP WIDGET ─────────────────────────────────────────────
(function() {
    const timeEl = document.getElementById('waBubbleTime');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    }
})();

let _waAutoCloseTimer = null;

function cancelarWaAutoClose() {
    if (_waAutoCloseTimer) { clearTimeout(_waAutoCloseTimer); _waAutoCloseTimer = null; }
}

function toggleWaWidget() {
    const popup = document.getElementById('waWidgetPopup');
    if (!popup) return;
    const isOpen = popup.classList.contains('open');
    if (isOpen) {
        cancelarWaAutoClose();
        popup.style.opacity = '0';
        popup.style.transform = 'scale(0.85) translateY(20px)';
        setTimeout(() => { popup.classList.remove('open'); }, 280);
    } else {
        popup.classList.add('open');
        // forzar reflow para que la transición funcione
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'scale(1) translateY(0)';
        });
        const input = document.getElementById('waWidgetInput');
        if (input) {
            input.focus();
            // Si el cliente empieza a escribir, no lo cerramos automáticamente
            input.addEventListener('input', cancelarWaAutoClose, { once: true });
        }
        // Auto-cerrar a los 15s si el cliente no lo cierra ni interactúa
        cancelarWaAutoClose();
        _waAutoCloseTimer = setTimeout(() => {
            if (popup.classList.contains('open')) toggleWaWidget();
        }, 15000);
    }
}

function sendWaMessage() {
    const input = document.getElementById('waWidgetInput');
    const msg = input.value.trim();
    // GA4 — mensaje por widget WhatsApp
    if (typeof gtag !== 'undefined') {
        gtag('event', 'whatsapp_widget', { event_category: 'contacto', event_label: msg || '(sin mensaje)' });
    }
    const prefix = 'Hola San Ou!! quisiera hacer una consulta.\n\n';
    const text = encodeURIComponent(msg ? prefix + msg : prefix);
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + text, '_blank');
    input.value = '';
}

// ─── INIT ────────────────────────────────────────────────────────
// ─── ARRANQUE DEL CATÁLOGO ───────────────────────────────────────
// IMPORTANTE: el catálogo NO debe depender de que carguen los precios.
// Si el fetch al Sheet se cuelga (red lenta/inestable), igual dibujamos
// todo, así los botones y productos SIEMPRE funcionan. Cuando llegan los
// precios, se refresca la vista con los valores reales.
let _catalogoDibujado = false;

function dibujarCatalogo() {
    if (_catalogoDibujado) return;
    _catalogoDibujado = true;
    try {
        // Copia MEZCLADA solo para la vista "Todas las categorías".
        productsShuffled = products.slice();
        for (let i = productsShuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [productsShuffled[i], productsShuffled[j]] = [productsShuffled[j], productsShuffled[i]];
        }

        const hash = window.location.hash;

        // Abrir categoría si viene en la URL (#categoria-XXX)
        const catMatch = hash.match(/^#categoria-(\w+)$/);
        if (catMatch && CAT_NAMES[catMatch[1]]) {
            const cat = catMatch[1];
            toggleGuiaBanner(cat);
            renderProducts(cat, true);
            renderFeatured();
            renderDestacadosGrid();
            const lbl = document.getElementById('filterDropdownLabel');
            if (lbl) lbl.textContent = CAT_NAMES[cat];
            document.querySelectorAll('.filter-option').forEach(o => o.classList.toggle('active', o.dataset.filter === cat));
            setTimeout(() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
            return;
        }

        renderProducts('all');
        renderFeatured();
        renderDestacadosGrid();

        // Abrir producto si viene en la URL (#producto-ID)
        const match = hash.match(/^#producto-(\d+)$/);
        if (match) {
            const id = parseInt(match[1]);
            setTimeout(() => openModal(id), 500);
        }
    } catch (e) {
        console.warn('Error dibujando el catálogo:', e);
    }
}

// Refresca la vista actual (para mostrar precios/stock reales al llegar el Sheet).
function refrescarCatalogo() {
    try {
        renderProducts(_currentFilter, _currentFilter !== 'all');
        renderFeatured();
        renderDestacadosGrid();
    } catch (e) { console.warn('Error refrescando el catálogo:', e); }
}

// Cargar precios y luego dibujar (o refrescar si la red de seguridad ya dibujó).
loadPricesFromSheet().finally(() => {
    if (_catalogoDibujado) refrescarCatalogo();
    else dibujarCatalogo();
});

// Red de seguridad: pase lo que pase, a los 4s el catálogo se muestra.
setTimeout(dibujarCatalogo, 4000);

// Abrir widget WhatsApp automáticamente al entrar (solo desktop)
window.addEventListener('load', () => {
    if (window.innerWidth >= 769) {
        setTimeout(() => {
            const popup = document.getElementById('waWidgetPopup');
            if (popup && !popup.classList.contains('open')) {
                toggleWaWidget();
            }
        }, 2500);
    }

    // Iniciar módulos nuevos
    initWishlist();
    initStagger();
    initStats();
    initScrollReveal();
    injectStructuredData();
});

// ─────────────────────────────────────────────────────────────────
// REVEAL SUAVE AL SCROLLEAR (secciones intermedias)
// ─────────────────────────────────────────────────────────────────
function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return; // sin soporte: todo visible, no tocar nada

    const selectors = [
        '.why-us-item', '.feature-card', '.review-card',
        '.about-split', '.cta-pedido-inner', '.ubicacion-card', '.mail-card',
        '.leave-review-cta'
    ];
    const els = document.querySelectorAll(selectors.join(','));
    if (!els.length) return;

    // Estado inicial oculto (con transición CSS como mecanismo de animación)
    els.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
    });

    let revealed = 0;
    // Seguridad: solo si el observer no reveló NADA en 3s (falló), mostrar todo
    const safety = setTimeout(() => {
        if (revealed === 0) {
            els.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
        }
    }, 3000);
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            // Pequeño escalonado entre elementos hermanos visibles a la vez
            const delay = (Array.prototype.indexOf.call(el.parentElement.children, el) % 4) * 90;
            setTimeout(() => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            }, delay);
            obs.unobserve(el);
            revealed++;
            if (revealed === els.length) clearTimeout(safety);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    els.forEach(el => obs.observe(el));
}

// ─────────────────────────────────────────────────────────────────
// 4. SHARE BUTTON
// ─────────────────────────────────────────────────────────────────
function shareProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const url = `${location.origin}${location.pathname}?p=${id}`;
    if (navigator.share) {
        navigator.share({ title: p.name, text: `Mirá este producto de San Ou: ${p.name}`, url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('🔗 Link copiado al portapapeles');
        });
    }
}

// Auto-abrir producto desde URL param ?p=ID
(function checkUrlProduct() {
    const params = new URLSearchParams(location.search);
    const pid = parseInt(params.get('p'));
    if (pid) {
        // Esperar a que los productos carguen
        const tryOpen = () => {
            if (products.length) {
                openModal(pid);
                history.replaceState(null, '', location.pathname);
            } else {
                setTimeout(tryOpen, 100);
            }
        };
        setTimeout(tryOpen, 300);
    }
})();

function showToast(msg) {
    let t = document.getElementById('sanouToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'sanouToast';
        t.className = 'sanou-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
}

// Inyectar botón compartir en el modal (se llama desde openModal)
const _origOpenModal = openModal;
openModal = function(id) {
    _origOpenModal(id);
    // Agregar botón share + corazón al modal luego de renderizar
    setTimeout(() => {
        const details = document.querySelector('.modal-details');
        if (!details || details.querySelector('.modal-share-row')) return;
        const p = products.find(x => x.id === id);
        const isFav = getFavs().includes(id);
        const row = document.createElement('div');
        row.className = 'modal-share-row';
        row.innerHTML = `
            <button class="btn-share-modal" onclick="shareProduct(${id})">
                <i class="fas fa-share-alt"></i> Compartir
            </button>
            <button class="btn-fav-modal ${isFav ? 'active' : ''}" id="favModalBtn-${id}" onclick="toggleFav(${id})">
                <i class="fas fa-heart"></i> ${isFav ? 'Guardado' : 'Guardar'}
            </button>`;
        const btns = details.querySelector('.modal-buttons');
        if (btns) btns.after(row);
    }, 50);
};

// ─────────────────────────────────────────────────────────────────
// 5. STAGGER ANIMACIONES (anime.js)
// ─────────────────────────────────────────────────────────────────
function initStagger() {
    if (typeof anime === 'undefined') return;

    // Stagger en category cards al entrar en viewport
    const catObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                catObserver.disconnect();
                const cats = document.querySelectorAll('.category-card');
                // Safety: asegurar visibilidad si la animación falla
                const safety = setTimeout(() => {
                    cats.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none'; });
                }, 2000);
                anime({
                    targets: '.category-card',
                    opacity: [0, 1],
                    translateY: [30, 0],
                    scale: [0.92, 1],
                    duration: 500,
                    easing: 'easeOutExpo',
                    delay: anime.stagger(70),
                    complete() { clearTimeout(safety); }
                });
            }
        });
    }, { threshold: 0.1 });

    const catGrid = document.querySelector('.categories-grid');
    if (catGrid) {
        catObserver.observe(catGrid);
    }

    // Stagger en product cards al filtrar (hook en renderProducts)
    const _origRender = window.renderProducts;
    if (typeof renderProducts !== 'undefined') {
        const origRenderProducts = renderProducts;
        window.renderProducts = function(...args) {
            origRenderProducts(...args);
            setTimeout(() => staggerProductCards(), 30);
        };
    }
}

function staggerProductCards() {
    const cards = document.querySelectorAll('.product-card');
    if (!cards.length) return;

    // Garantizar visibilidad siempre, incluso si anime.js falla
    cards.forEach(c => {
        c.style.opacity = '1';
        c.style.transform = 'none';
    });

    if (typeof anime === 'undefined') return;

    // Pre-set solo translateY (no opacity) para que las cards no queden invisibles si la animación falla
    cards.forEach(c => { c.style.transform = 'translateY(20px)'; });

    // Safety fallback: si anime no completa en 1500ms, forzar estado final
    const safety = setTimeout(() => {
        cards.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none'; });
    }, 1500);

    anime({
        targets: '.product-card',
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 400,
        easing: 'easeOutExpo',
        delay: anime.stagger(45),
        complete() { clearTimeout(safety); }
    });
}

// ─────────────────────────────────────────────────────────────────
// 6. CONTADORES ANIMADOS
// ─────────────────────────────────────────────────────────────────
function initStats() {
    const statsBar = document.querySelector('.stats-bar');
    if (!statsBar) return;

    let fired = false;

    function runCounters() {
        if (fired) return;
        fired = true;

        document.querySelectorAll('.stat-num').forEach(el => {
            const target = parseInt(el.dataset.target);
            if (typeof anime !== 'undefined') {
                anime({
                    targets: el,
                    innerHTML: [0, target],
                    duration: 1800,
                    easing: 'easeOutExpo',
                    round: 1
                });
            } else {
                // Fallback sin anime.js
                let current = 0;
                const step = Math.ceil(target / 40);
                const timer = setInterval(() => {
                    current = Math.min(current + step, target);
                    el.textContent = current;
                    if (current >= target) clearInterval(timer);
                }, 40);
            }
        });

        if (typeof anime !== 'undefined') {
            anime({
                targets: '.stat-item',
                opacity: [0, 1],
                translateY: [20, 0],
                duration: 600,
                easing: 'easeOutExpo',
                delay: anime.stagger(120)
            });
        }
    }

    // Observer con threshold bajo para que dispare fácil
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                runCounters();
                observer.disconnect();
            }
        });
    }, { threshold: 0.05 });

    observer.observe(statsBar);

    // Fallback: si después de 3s no disparó el observer, mostrar igual
    setTimeout(() => { if (!fired) runCounters(); }, 3000);
}

// ─────────────────────────────────────────────────────────────────
// 8. WISHLIST / FAVORITOS
// ─────────────────────────────────────────────────────────────────
function getFavs() {
    try { return JSON.parse(localStorage.getItem('sanou_favs') || '[]'); }
    catch(e) { return []; }
}
function saveFavs(arr) {
    localStorage.setItem('sanou_favs', JSON.stringify(arr));
    updateFavCount();
}
function updateFavCount() {
    const n = getFavs().length;
    const el = document.getElementById('favCount');
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
}
function toggleFav(id) {
    let favs = getFavs();
    const idx = favs.indexOf(id);
    if (idx === -1) {
        favs.push(id);
        showToast('❤️ Guardado en favoritos');
    } else {
        favs.splice(idx, 1);
        showToast('🤍 Eliminado de favoritos');
    }
    saveFavs(favs);
    // Actualizar botones de fav en cards
    document.querySelectorAll(`.fav-icon-btn[data-id="${id}"]`).forEach(btn => {
        btn.classList.toggle('active', favs.includes(id));
    });
    // Actualizar botón en modal si está abierto
    const favModalBtn = document.getElementById(`favModalBtn-${id}`);
    if (favModalBtn) {
        favModalBtn.classList.toggle('active', favs.includes(id));
        favModalBtn.innerHTML = `<i class="fas fa-heart"></i> ${favs.includes(id) ? 'Guardado' : 'Guardar'}`;
    }
}

function initWishlist() {
    updateFavCount();
    // Inyectar ícono fav en cards (se hace al renderizar)
    const origCardHTML = window._origCardHTML; // no existe aún, ver hook abajo
}

function openFavs() {
    const favs = getFavs();
    const panel = document.getElementById('favPanel');
    const body  = document.getElementById('favBody');
    const favProds = products.filter(p => favs.includes(p.id));
    if (favProds.length === 0) {
        body.innerHTML = '<div class="panel-empty"><i class="fas fa-heart-broken"></i><p>Todavía no guardaste favoritos.</p></div>';
    } else {
        body.innerHTML = favProds.map(p => {
            const imgs = getImgs(p);
            const imgSrc = imgs[0] || '';
            return `<div class="panel-product-row" onclick="openModal(${p.id}); closeFavs()">
                ${imgSrc ? `<img src="${imgSrc}" alt="${p.name}" class="panel-prod-img">` : `<div class="panel-prod-icon"><i class="fas ${p.icon}"></i></div>`}
                <div class="panel-prod-info">
                    <strong>${p.name}</strong>
                    <span>${p.price > 0 ? fmt(p.price) : 'Consultar precio'}</span>
                </div>
                <button class="panel-remove-btn" onclick="event.stopPropagation(); toggleFav(${p.id}); openFavs()">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        }).join('');
    }
    document.getElementById('favOverlay').classList.add('active');
    panel.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeFavs() {
    document.getElementById('favPanel').classList.remove('active');
    document.getElementById('favOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────────────────
// 10. HISTORIAL DE PEDIDOS
// ─────────────────────────────────────────────────────────────────
function saveOrder(cartItems, total) {
    const orders = JSON.parse(localStorage.getItem('sanou_orders') || '[]');
    orders.unshift({
        id: Date.now(),
        date: new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        items: cartItems.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
        total
    });
    // Guardar máximo 20 pedidos
    localStorage.setItem('sanou_orders', JSON.stringify(orders.slice(0, 20)));
}

function openOrders() {
    const orders = JSON.parse(localStorage.getItem('sanou_orders') || '[]');
    const body = document.getElementById('ordersBody');
    if (orders.length === 0) {
        body.innerHTML = '<div class="panel-empty"><i class="fas fa-inbox"></i><p>Todavía no enviaste pedidos.</p></div>';
    } else {
        body.innerHTML = orders.map(o => `
            <div class="order-card">
                <div class="order-card-header">
                    <span class="order-date"><i class="fas fa-clock"></i> ${o.date}</span>
                    <span class="order-total">${fmt(o.total)}</span>
                </div>
                <ul class="order-items">
                    ${o.items.map(i => `<li><span>${i.name}</span><span>x${i.qty} · ${fmt(i.price * i.qty)}</span></li>`).join('')}
                </ul>
            </div>`).join('');
    }
    document.getElementById('ordersOverlay').classList.add('active');
    document.getElementById('ordersPanel').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeOrders() {
    document.getElementById('ordersPanel').classList.remove('active');
    document.getElementById('ordersOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────────────────
// 11. STRUCTURED DATA (JSON-LD)
// ─────────────────────────────────────────────────────────────────
function injectStructuredData() {
    // La Organización/Store (nombre, dirección, horarios, redes) ya está en el <head>.
    // Acá inyectamos el schema de cada producto (con imágenes) para SEO / visibilidad en IA.
    const productSchemas = products.map(p => {
        const imgs = getImgs(p);
        const offer = {
            "@type": "Offer",
            "priceCurrency": "ARS",
            "availability": p.inStock === false
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            "url": `https://sanou.com.ar/?p=${p.id}`,
            "seller": { "@type": "Organization", "name": "San Ou" }
        };
        if (p.price > 0) offer.price = p.price;

        const prod = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": p.name,
            "description": p.desc || '',
            "category": CAT_NAMES[p.category] || '',
            "brand": { "@type": "Brand", "name": "San Ou" },
            "offers": offer
        };
        if (imgs.length) prod.image = imgs.map(src => 'https://sanou.com.ar/' + encodeURI(src));
        return prod;
    });

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(productSchemas);
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', () => {
    initHeroVideo();
});

// ─── VIDEO HERO ALEATORIO ─────────────────────────────────────────
function initHeroVideo() {
    const videos = [
        'video1 70mm.mp4',
        'video2.mp4',
        'video3.mp4',
        'video4.mp4'
    ];
    const video = document.getElementById('heroVideo');
    if (!video) return;

    const chosen = videos[Math.floor(Math.random() * videos.length)];

    // El video pesa varios MB. Se carga recién cuando la página ya terminó
    // de cargar lo importante (fotos, precios, textos), así no compite con eso.
    const cargar = () => {
        if (video.dataset.cargado) return;
        video.dataset.cargado = '1';
        video.src = chosen;
        video.load();
        video.play().catch(() => {});
    };

    if (document.readyState === 'complete') cargar();
    else window.addEventListener('load', cargar, { once: true });
}
