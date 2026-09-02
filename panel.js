// ════════════════════════════════════════════════════════════════
//  PANEL / CRM SAN OU
// ════════════════════════════════════════════════════════════════

// URL del Apps Script del CRM (backend en Google Sheets)
const CRM_URL = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';

// ─── CLAVE DE ACCESO (misma que el cotizador) ───────────────────
const CLAVE_HASH = 'cee92583f674a5ef9fa78953f4d1483eb1aa1f9eeba27612ec72abb0063fd52a';
const PBKDF2_VUELTAS = 250000;
const PBKDF2_SAL = 'sanou::cotizador::v2';
const DIAS_RECORDAR = 30;

async function huella(txt) {
    const enc = new TextEncoder();
    const clave = await crypto.subtle.importKey('raw', enc.encode(txt), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(PBKDF2_SAL), iterations: PBKDF2_VUELTAS, hash: 'SHA-256' },
        clave, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function accesoVigente() {
    try { return parseInt(localStorage.getItem('sanou_panel_ok') || '0', 10) > Date.now(); }
    catch (e) { return false; }
}
function desbloquear() {
    try { localStorage.setItem('sanou_panel_ok', String(Date.now() + DIAS_RECORDAR * 864e5)); } catch (e) {}
    document.body.classList.remove('bloqueado');
    navegar('clientes');
}
function cerrarSesionPanel() {
    try { localStorage.removeItem('sanou_panel_ok'); } catch (e) {}
    location.reload();
}
let _verificando = false;
async function probarClave() {
    if (_verificando) return;
    const input = document.getElementById('claveInput');
    const err = document.getElementById('claveError');
    const btn = document.getElementById('claveBtn');
    if (!input.value.trim()) return;
    _verificando = true; btn.disabled = true; btn.textContent = 'Verificando…';
    try {
        if (await huella(input.value) === CLAVE_HASH) desbloquear();
        else { err.textContent = 'Clave incorrecta.'; err.classList.add('on'); input.value = ''; input.focus(); }
    } finally { _verificando = false; btn.disabled = false; btn.textContent = 'Entrar'; }
}

// ─── CONEXIÓN AL BACKEND (JSONP, con anti-caché) ────────────────
function crm(params) {
    return new Promise((resolve, reject) => {
        const cb = 'crmcb_' + Date.now() + Math.floor(Math.random() * 1e6);
        const qs = new URLSearchParams({ ...params, callback: cb, _: Date.now() });
        const s = document.createElement('script');
        const limpiar = () => { delete window[cb]; s.remove(); };
        const to = setTimeout(() => { limpiar(); reject(new Error('timeout')); }, 20000);
        window[cb] = (data) => { clearTimeout(to); limpiar(); resolve(data); };
        s.onerror = () => { clearTimeout(to); limpiar(); reject(new Error('red')); };
        s.src = CRM_URL + '?' + qs.toString();
        document.body.appendChild(s);
    });
}

// ─── ESTADO / NAVEGACIÓN ────────────────────────────────────────
let seccionActual = 'clientes';
let clientes = [];

function navegar(sec) {
    seccionActual = sec;
    document.querySelectorAll('.panel-nav-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.sec === sec));
    if (sec === 'clientes') renderClientes();
    else if (sec === 'cotizaciones') renderCotizador();
    else enConstruccion(sec);
}

function renderCotizador() {
    document.getElementById('vista').innerHTML =
        `<iframe class="panel-iframe" src="cotizar.html" title="Cotizador"></iframe>`;
}

function enConstruccion(sec) {
    const nombres = { cotizaciones: 'Cotizaciones', pedidos: 'Pedidos', seguimientos: 'Seguimientos' };
    document.getElementById('vista').innerHTML = `
        <div class="panel-vacio">
            <i class="fas fa-screwdriver-wrench"></i>
            <h3>${nombres[sec] || sec}</h3>
            <p>Esta sección la sumamos en la próxima etapa.</p>
        </div>`;
}

// ─── CLIENTES ───────────────────────────────────────────────────
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function soloDigitos(t) { return String(t || '').replace(/\D/g, ''); }

async function renderClientes() {
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="panel-sec-head">
            <div class="panel-buscar">
                <i class="fas fa-search"></i>
                <input type="text" id="buscarCli" placeholder="Buscar por nombre, empresa, teléfono…" oninput="filtrarClientes()">
            </div>
            <button class="panel-btn-add" onclick="abrirFormCliente()"><i class="fas fa-plus"></i> Nuevo cliente</button>
        </div>
        <div class="panel-lista" id="listaClientes"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>`;
    try {
        const r = await crm({ action: 'list', tab: 'Clientes' });
        clientes = (r && r.ok && r.rows) ? r.rows : [];
        pintarClientes(clientes);
    } catch (e) {
        document.getElementById('listaClientes').innerHTML =
            `<div class="panel-error">No se pudieron cargar los clientes. Revisá tu conexión.</div>`;
    }
}

function filtrarClientes() {
    const q = (document.getElementById('buscarCli').value || '').toLowerCase().trim();
    if (!q) { pintarClientes(clientes); return; }
    pintarClientes(clientes.filter(c =>
        (c.nombre + ' ' + c.empresa + ' ' + c.telefono + ' ' + c.ciudad + ' ' + c.email).toLowerCase().includes(q)));
}

function pintarClientes(lista) {
    const cont = document.getElementById('listaClientes');
    if (!cont) return;
    if (!lista.length) {
        cont.innerHTML = `<div class="panel-vacio-chico">No hay clientes todavía. Agregá el primero con "Nuevo cliente".</div>`;
        return;
    }
    cont.innerHTML = lista.map(c => {
        const tel = soloDigitos(c.telefono);
        const wa = tel ? `https://wa.me/${tel.length <= 11 ? '549' + tel : tel}?text=${encodeURIComponent('¡Hola ' + (c.nombre || '') + '! Te escribo de San Ou 🔧')}` : '';
        const sub = [c.empresa, c.ciudad].filter(Boolean).join(' · ');
        return `
        <div class="cli-card">
            <div class="cli-avatar">${esc((c.nombre || '?').charAt(0).toUpperCase())}</div>
            <div class="cli-info">
                <div class="cli-nombre">${esc(c.nombre) || '(sin nombre)'}</div>
                ${sub ? `<div class="cli-sub">${esc(sub)}</div>` : ''}
                <div class="cli-contacto">
                    ${c.telefono ? `<span><i class="fas fa-phone"></i> ${esc(c.telefono)}</span>` : ''}
                    ${c.email ? `<span><i class="fas fa-envelope"></i> ${esc(c.email)}</span>` : ''}
                </div>
            </div>
            <div class="cli-acciones">
                ${wa ? `<a class="cli-btn cli-wa" href="${wa}" target="_blank" rel="noopener" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
                <button class="cli-btn" onclick="abrirFormCliente('${c.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="cli-btn cli-del" onclick="borrarCliente('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function abrirFormCliente(id) {
    const c = id ? clientes.find(x => x.id === id) : {};
    document.getElementById('modalTitulo').textContent = id ? 'Editar cliente' : 'Nuevo cliente';
    document.getElementById('modalBody').innerHTML = `
        <form class="panel-form" onsubmit="guardarCliente(event, '${id || ''}')">
            <label>Nombre *</label>
            <input type="text" id="fNombre" value="${esc(c.nombre)}" required>
            <div class="panel-form-2">
                <div><label>Razón social</label><input type="text" id="fRazon" value="${esc(c.razon)}"></div>
                <div><label>CUIT</label><input type="text" id="fCuit" value="${esc(c.cuit)}" inputmode="numeric"></div>
            </div>
            <label>Teléfono / WhatsApp</label>
            <input type="tel" id="fTel" value="${esc(c.telefono)}" inputmode="tel">
            <label>Email</label>
            <input type="email" id="fEmail" value="${esc(c.email)}">
            <div class="panel-form-2">
                <div><label>Empresa / Rubro</label><input type="text" id="fEmpresa" value="${esc(c.empresa)}"></div>
                <div><label>Ciudad</label><input type="text" id="fCiudad" value="${esc(c.ciudad)}"></div>
            </div>
            <label>Dirección</label>
            <input type="text" id="fDireccion" value="${esc(c.direccion)}">
            <label>Notas</label>
            <textarea id="fNotas" rows="2">${esc(c.notas)}</textarea>
            <button type="submit" class="panel-form-submit" id="btnGuardarCli">Guardar</button>
        </form>`;
    abrirModal();
    setTimeout(() => document.getElementById('fNombre').focus(), 100);
}

async function guardarCliente(e, id) {
    e.preventDefault();
    const btn = document.getElementById('btnGuardarCli');
    const datos = {
        nombre:    document.getElementById('fNombre').value.trim(),
        razon:     document.getElementById('fRazon').value.trim(),
        cuit:      document.getElementById('fCuit').value.trim(),
        telefono:  document.getElementById('fTel').value.trim(),
        email:     document.getElementById('fEmail').value.trim(),
        empresa:   document.getElementById('fEmpresa').value.trim(),
        ciudad:    document.getElementById('fCiudad').value.trim(),
        direccion: document.getElementById('fDireccion').value.trim(),
        notas:     document.getElementById('fNotas').value.trim()
    };
    if (!datos.nombre) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
        if (id) {
            await crm({ action: 'update', tab: 'Clientes', id, ...datos });
            const c = clientes.find(x => x.id === id);
            if (c) Object.assign(c, datos);            // actualizar en el acto
        } else {
            const r = await crm({ action: 'add', tab: 'Clientes', ...datos });
            clientes.unshift({ id: (r && r.id) || ('tmp' + Date.now()), fecha: '', ...datos });
        }
        cerrarModal();
        filtrarClientes();                              // re-pinta desde el estado local
    } catch (err) {
        btn.disabled = false; btn.textContent = 'Guardar';
        alert('No se pudo guardar. Revisá la conexión e intentá de nuevo.');
    }
}

async function borrarCliente(id) {
    const c = clientes.find(x => x.id === id);
    if (!confirm(`¿Eliminar a ${c ? c.nombre : 'este cliente'}? No se puede deshacer.`)) return;
    clientes = clientes.filter(x => x.id !== id);       // sacarlo en el acto
    filtrarClientes();
    try { await crm({ action: 'delete', tab: 'Clientes', id }); }
    catch (e) { alert('No se pudo eliminar en el servidor. Recargá para verificar.'); }
}

// ─── MODAL ──────────────────────────────────────────────────────
function abrirModal() {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('modalForm').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function cerrarModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('modalForm').classList.remove('active');
    document.body.style.overflow = '';
}

// ─── ARRANQUE ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (accesoVigente()) { document.body.classList.remove('bloqueado'); navegar('clientes'); }
    else {
        const input = document.getElementById('claveInput');
        input.addEventListener('keydown', e => {
            document.getElementById('claveError').classList.remove('on');
            if (e.key === 'Enter') probarClave();
        });
        setTimeout(() => input.focus(), 100);
    }
});
