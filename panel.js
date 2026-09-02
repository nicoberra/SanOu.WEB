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
    navegar('panel');
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
    if (sec === 'panel') renderDashboard();
    else if (sec === 'clientes') renderClientes();
    else if (sec === 'productos') renderProductos();
    else if (sec === 'cotizaciones') renderCotizador();
    else if (sec === 'pedidos') renderPedidos();
    else if (sec === 'seguimientos') renderSeguimientos();
    else enConstruccion(sec);
}

// ─── PANEL / TABLERO ─────────────────────────────────────────────
let cotizaciones = [], _cotCargadas = false;
async function ensureCotizaciones(){ if(_cotCargadas) return; try{ const r=await crm({action:'list',tab:'Cotizaciones'}); cotizaciones=(r&&r.ok&&r.rows)||[]; _cotCargadas=true; }catch(e){} }
function sumaMontos(arr){ return arr.reduce((s,x)=>s+(parseInt(String(x.monto||'').replace(/[^\d]/g,''),10)||0),0); }
function fmtMoney(n){ return '$'+Number(n||0).toLocaleString('es-AR'); }

async function renderDashboard(){
    const v = document.getElementById('vista');
    v.innerHTML = `<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando panel…</div>`;
    await ensureClientes(); await ensurePedidos(); await ensureSeguimientos(); await ensureCotizaciones();
    if (seccionActual !== 'panel') return;

    const pend      = pedidos.filter(p => p.estado === 'Pendiente');
    const porCobrar = pedidos.filter(p => p.estado !== 'Cobrado');
    const cobrados  = pedidos.filter(p => p.estado === 'Cobrado');
    const segPend   = seguimientos.filter(s => s.estado !== 'Hecho');
    const segVenc   = seguimientos.filter(esVencido);
    const cotAbiertas = cotizaciones.filter(c => !c.estado || c.estado === 'Abierta');
    const web = clientes.filter(esWeb).length;

    const card = (tit, val, sub, icon, sec, chico) => `
        <div class="dash-card" onclick="navegar('${sec}')">
            <div class="dash-ic"><i class="fas ${icon}"></i></div>
            <div class="dash-val${chico ? ' dash-val-sm' : ''}">${esc(String(val))}</div>
            <div class="dash-tit">${esc(tit)}</div>
            ${sub ? `<div class="dash-sub">${esc(sub)}</div>` : ''}
        </div>`;

    const listaMini = (tit, items, sec) => !items.length ? '' : `
        <div class="dash-lista">
            <h4 onclick="navegar('${sec}')">${tit} <i class="fas fa-arrow-right"></i></h4>
            ${items.map(t => `<div class="dash-li">${esc(t)}</div>`).join('')}
        </div>`;

    v.innerHTML = `
        <div class="dash-cards">
            ${card('Clientes', clientes.length, web + ' desde la web', 'fa-users', 'clientes')}
            ${card('Pedidos pendientes', pend.length, 'sin entregar', 'fa-hourglass-half', 'pedidos')}
            ${card('Por cobrar', fmtMoney(sumaMontos(porCobrar)), porCobrar.length + ' pedidos', 'fa-hand-holding-dollar', 'pedidos', true)}
            ${card('Cobrado', fmtMoney(sumaMontos(cobrados)), cobrados.length + ' pedidos', 'fa-circle-check', 'pedidos', true)}
            ${card('Seguimientos', segPend.length, segVenc.length + ' vencidos', 'fa-bell', 'seguimientos')}
            ${card('Cotizaciones abiertas', cotAbiertas.length, '', 'fa-file-invoice-dollar', 'cotizaciones')}
        </div>
        ${listaMini('⚠️ Seguimientos vencidos', segVenc.slice(0, 5).map(s => `${s.cliente || '(sin cliente)'} — ${s.motivo || ''}`), 'seguimientos')}
        ${listaMini('💰 Pedidos por cobrar', porCobrar.slice(0, 5).map(p => `${p.cliente || '(sin cliente)'} · ${montoTxt(p.monto) || '-'} (${p.estado || 'Pendiente'})`), 'pedidos')}`;
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

let vistaClientes = 'mis';   // 'mis' (cargados por vos) o 'web' (registrados en la web)
let _pedidosCargados = false, _segCargados = false;

function norm(s){ s = String(s == null ? '' : s).trim().toLowerCase(); return s.normalize ? s.normalize('NFC') : s; }
function esWeb(c){ return c.origen === 'web' || (!c.origen && /web|registro|barra|popup/i.test(String(c.notas || ''))); }

async function ensurePedidos(){ if(_pedidosCargados) return; try{ const r=await crm({action:'list',tab:'Pedidos'}); pedidos=(r&&r.ok&&r.rows)||[]; _pedidosCargados=true; }catch(e){} }
async function ensureSeguimientos(){ if(_segCargados) return; try{ const r=await crm({action:'list',tab:'Seguimientos'}); seguimientos=(r&&r.ok&&r.rows)||[]; _segCargados=true; }catch(e){} }
function pedidosDeCliente(nombre){ const n=norm(nombre); return pedidos.filter(p=>norm(p.cliente)===n); }
function segsDeCliente(nombre){ const n=norm(nombre); return seguimientos.filter(s=>norm(s.cliente)===n); }

async function renderClientes() {
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="cli-tabs">
            <button class="cli-tab active" data-v="mis" onclick="cambiarVistaClientes('mis')">Mis clientes <span id="cntMis"></span></button>
            <button class="cli-tab" data-v="web" onclick="cambiarVistaClientes('web')">Clientes web <span id="cntWeb"></span></button>
        </div>
        <div class="panel-sec-head">
            <div class="panel-buscar">
                <i class="fas fa-search"></i>
                <input type="text" id="buscarCli" placeholder="Buscar por nombre, empresa, teléfono…" oninput="filtrarClientes()">
            </div>
            <button class="panel-btn-add" onclick="abrirFormCliente()"><i class="fas fa-plus"></i> Nuevo cliente</button>
        </div>
        <div class="panel-lista" id="listaClientes"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>`;
    document.querySelectorAll('.cli-tab').forEach(b => b.classList.toggle('active', b.dataset.v === vistaClientes));
    try {
        const r = await crm({ action: 'list', tab: 'Clientes' });
        clientes = (r && r.ok && r.rows) ? r.rows : [];
        actualizarContadores();
        filtrarClientes();
        ensurePedidos().then(() => { if (seccionActual === 'clientes') filtrarClientes(); }); // sumar contador de pedidos
    } catch (e) {
        document.getElementById('listaClientes').innerHTML =
            `<div class="panel-error">No se pudieron cargar los clientes. Revisá tu conexión.</div>`;
    }
}

function actualizarContadores() {
    const web = clientes.filter(esWeb).length, mis = clientes.length - web;
    const m = document.getElementById('cntMis'), w = document.getElementById('cntWeb');
    if (m) m.textContent = '(' + mis + ')';
    if (w) w.textContent = '(' + web + ')';
}

function cambiarVistaClientes(v) {
    vistaClientes = v;
    document.querySelectorAll('.cli-tab').forEach(b => b.classList.toggle('active', b.dataset.v === v));
    filtrarClientes();
}

function filtrarClientes() {
    const q = (document.getElementById('buscarCli')?.value || '').toLowerCase().trim();
    let base = clientes.filter(c => vistaClientes === 'web' ? esWeb(c) : !esWeb(c));
    if (q) base = base.filter(c =>
        (c.nombre + ' ' + c.empresa + ' ' + c.telefono + ' ' + c.ciudad + ' ' + c.email + ' ' + c.razon).toLowerCase().includes(q));
    pintarClientes(base);
}

function pintarClientes(lista) {
    const cont = document.getElementById('listaClientes');
    if (!cont) return;
    if (!lista.length) {
        cont.innerHTML = `<div class="panel-vacio-chico">${vistaClientes === 'web'
            ? 'Todavía no se registró nadie desde la web.'
            : 'No hay clientes cargados. Agregá el primero con "Nuevo cliente".'}</div>`;
        return;
    }
    cont.innerHTML = lista.map(c => {
        const tel = soloDigitos(c.telefono);
        const wa = tel ? `https://wa.me/${tel.length <= 11 ? '549' + tel : tel}?text=${encodeURIComponent('¡Hola ' + (c.nombre || '') + '! Te escribo de San Ou 🔧')}` : '';
        const sub = [c.empresa, c.ciudad].filter(Boolean).join(' · ');
        const nped = _pedidosCargados ? pedidosDeCliente(c.nombre).length : 0;
        return `
        <div class="cli-card" onclick="verCliente('${c.id}')">
            <div class="cli-avatar">${esc((c.nombre || '?').charAt(0).toUpperCase())}</div>
            <div class="cli-info">
                <div class="cli-nombre">${esc(c.nombre) || '(sin nombre)'}${nped ? `<span class="cli-ped-badge"><i class="fas fa-box"></i> ${nped}</span>` : ''}</div>
                ${sub ? `<div class="cli-sub">${esc(sub)}</div>` : ''}
                <div class="cli-contacto">
                    ${c.telefono ? `<span><i class="fas fa-phone"></i> ${esc(c.telefono)}</span>` : ''}
                    ${c.email ? `<span><i class="fas fa-envelope"></i> ${esc(c.email)}</span>` : ''}
                </div>
            </div>
            <div class="cli-acciones" onclick="event.stopPropagation()">
                ${wa ? `<a class="cli-btn cli-wa" href="${wa}" target="_blank" rel="noopener" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
                <button class="cli-btn" onclick="abrirFormCliente('${c.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="cli-btn cli-del" onclick="borrarCliente('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// ── Ficha del cliente con su historial (pedidos + seguimientos) ──
async function verCliente(id) {
    const c = clientes.find(x => x.id === id);
    if (!c) return;
    document.getElementById('modalTitulo').textContent = c.nombre || 'Cliente';
    document.getElementById('modalBody').innerHTML = `
        <div class="ficha-datos">
            ${c.razon ? `<div class="ficha-fila"><span>Razón social</span><b>${esc(c.razon)}</b></div>` : ''}
            ${c.cuit ? `<div class="ficha-fila"><span>CUIT</span><b>${esc(c.cuit)}</b></div>` : ''}
            ${c.telefono ? `<div class="ficha-fila"><span>Teléfono</span><b>${esc(c.telefono)}</b></div>` : ''}
            ${c.email ? `<div class="ficha-fila"><span>Email</span><b>${esc(c.email)}</b></div>` : ''}
            ${c.empresa ? `<div class="ficha-fila"><span>Empresa/Rubro</span><b>${esc(c.empresa)}</b></div>` : ''}
            ${c.ciudad ? `<div class="ficha-fila"><span>Ciudad</span><b>${esc(c.ciudad)}</b></div>` : ''}
            ${c.direccion ? `<div class="ficha-fila"><span>Dirección</span><b>${esc(c.direccion)}</b></div>` : ''}
            ${c.notas ? `<div class="ficha-fila"><span>Notas</span><b>${esc(c.notas)}</b></div>` : ''}
            <div class="ficha-origen">${esWeb(c) ? '🌐 Registrado desde la web' : '✍️ Cargado por vos'}</div>
        </div>
        <div class="ficha-acc">
            <button class="panel-btn-add" onclick="abrirFormPedidoDesde('${esc(c.nombre)}','${esc(c.telefono)}')"><i class="fas fa-plus"></i> Nuevo pedido</button>
            <button class="cli-btn" onclick="abrirFormCliente('${c.id}')" title="Editar"><i class="fas fa-pen"></i></button>
        </div>
        <h4 class="ficha-tit">Historial</h4>
        <div id="fichaHist" class="ficha-hist"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>`;
    abrirModal();
    await ensurePedidos();
    await ensureSeguimientos();
    await ensureCotizaciones();
    const n = norm(c.nombre);
    const peds = pedidosDeCliente(c.nombre), segs = segsDeCliente(c.nombre);
    const cots = cotizaciones.filter(x => norm(x.cliente) === n);
    const hist = document.getElementById('fichaHist');
    if (!hist) return;
    if (!peds.length && !segs.length && !cots.length) {
        hist.innerHTML = `<div class="panel-vacio-chico">Todavía no hay pedidos, cotizaciones ni seguimientos de este cliente.</div>`;
        return;
    }
    hist.innerHTML =
        cots.map(x => `<div class="hist-item"><span class="hist-tipo hist-cot"><i class="fas fa-file-invoice-dollar"></i></span>
            <div><div class="hist-det">${esc(x.detalle) || 'Cotización'}</div><div class="hist-sub">${montoTxt(x.monto)}${x.fecha ? ' · ' + fechaTxt(x.fecha) : ''}</div></div>
            ${badgeEstado(x.estado || 'Abierta')}</div>`).join('') +
        peds.map(p => `<div class="hist-item"><span class="hist-tipo hist-ped"><i class="fas fa-box"></i></span>
            <div><div class="hist-det">${esc(p.detalle) || 'Pedido'}</div><div class="hist-sub">${montoTxt(p.monto)}${p.fecha ? ' · ' + fechaTxt(p.fecha) : ''}</div></div>
            ${badgeEstado(p.estado)}</div>`).join('') +
        segs.map(s => `<div class="hist-item"><span class="hist-tipo hist-seg"><i class="fas fa-bell"></i></span>
            <div><div class="hist-det">${esc(s.motivo) || 'Seguimiento'}</div><div class="hist-sub">${s.objetivo ? fechaTxt(s.objetivo) : ''}</div></div>
            ${badgeEstado(s.estado)}</div>`).join('');
}

// Abrir el form de pedido con el cliente precargado (desde la ficha).
function abrirFormPedidoDesde(nombre, tel) {
    cerrarModal();
    setTimeout(() => {
        abrirFormPedido();
        setTimeout(() => {
            const c = document.getElementById('pdCliente'), t = document.getElementById('pdTel');
            if (c) c.value = nombre;
            if (t && tel) t.value = tel;
        }, 250);
    }, 150);
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
            datos.origen = 'panel';                     // cargado por vos (no web)
            const r = await crm({ action: 'add', tab: 'Clientes', ...datos });
            clientes.unshift({ id: (r && r.id) || ('tmp' + Date.now()), fecha: '', ...datos });
            vistaClientes = 'mis';                       // mostrarlo en "Mis clientes"
        }
        cerrarModal();
        actualizarContadores();
        document.querySelectorAll('.cli-tab').forEach(b => b.classList.toggle('active', b.dataset.v === vistaClientes));
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
    actualizarContadores();
    filtrarClientes();
    try { await crm({ action: 'delete', tab: 'Clientes', id }); }
    catch (e) { alert('No se pudo eliminar en el servidor. Recargá para verificar.'); }
}

// ─── PRODUCTOS ──────────────────────────────────────────────────
let productos = [];

async function renderProductos() {
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="panel-sec-head">
            <div class="panel-buscar">
                <i class="fas fa-search"></i>
                <input type="text" id="buscarProd" placeholder="Buscar producto…" oninput="filtrarProductos()">
            </div>
        </div>
        <p class="prod-ayuda">Cambiá precio, stock y destacado. Se guarda al instante en tu planilla. En la web se ve en unos minutos.</p>
        <div class="panel-lista" id="listaProd"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando productos…</div></div>`;
    try {
        const r = await crm({ action: 'productos_list', tab: 'Clientes' });
        productos = (r && r.ok && r.rows) ? r.rows : [];
        pintarProductos(productos);
    } catch (e) {
        document.getElementById('listaProd').innerHTML = `<div class="panel-error">No se pudieron cargar los productos.</div>`;
    }
}

function filtrarProductos() {
    const q = (document.getElementById('buscarProd').value || '').toLowerCase().trim();
    const lista = !q ? productos : productos.filter(p => p.nombre.toLowerCase().includes(q));
    pintarProductos(lista, q);
}

function precioTxt(v) {
    const n = String(v == null ? '' : v).replace(/[^\d]/g, '');
    return n ? '$' + parseInt(n, 10).toLocaleString('es-AR') : '';
}

function pintarProductos(lista, q) {
    const cont = document.getElementById('listaProd');
    if (!cont) return;
    if (!lista.length) {
        cont.innerHTML = `<div class="panel-vacio-chico">${q ? 'Sin resultados.' : 'No hay productos en la planilla.'}</div>`;
        return;
    }
    cont.innerHTML = lista.map(p => {
        const i = productos.indexOf(p);
        return `
        <div class="prod-card" id="prod-${i}">
            <div class="prod-top">
                <span class="prod-nombre">${esc(p.nombre)}</span>
                <span class="prod-ok" id="prodok-${i}"><i class="fas fa-check"></i> Guardado</span>
            </div>
            <div class="prod-campos">
                <label class="prod-num">Precio
                    <input type="text" inputmode="numeric" value="${esc(precioTxt(p.precio))}"
                        onchange="guardarProducto(${i},'precio',this.value)">
                </label>
                <label class="prod-num">Precio ML
                    <input type="text" inputmode="numeric" value="${esc(precioTxt(p.ml))}"
                        onchange="guardarProducto(${i},'ml',this.value)">
                </label>
                <label class="prod-sw">
                    <input type="checkbox" ${p.stock ? 'checked' : ''} onchange="guardarProducto(${i},'stock',this.checked)">
                    <span class="prod-sw-track"></span> En stock
                </label>
                <label class="prod-sw prod-sw-star">
                    <input type="checkbox" ${p.destacado ? 'checked' : ''} onchange="guardarProducto(${i},'destacado',this.checked)">
                    <span class="prod-sw-track"></span> Destacado
                </label>
            </div>
        </div>`;
    }).join('');
}

let _prodTimers = {};
async function guardarProducto(i, campo, valor) {
    const p = productos[i];
    if (!p) return;
    p[campo] = valor;
    try {
        await crm({ action: 'productos_save', tab: 'Clientes', nombre: p.nombre, [campo]: valor });
        const ok = document.getElementById('prodok-' + i);
        if (ok) {
            ok.classList.add('on');
            clearTimeout(_prodTimers[i]);
            _prodTimers[i] = setTimeout(() => ok.classList.remove('on'), 1800);
        }
    } catch (e) {
        alert('No se pudo guardar "' + p.nombre + '". Reintentá.');
    }
}

// ─── HELPERS PEDIDOS / SEGUIMIENTOS ─────────────────────────────
function val(id){ const e=document.getElementById(id); return e?e.value.trim():''; }
async function ensureClientes(){
    if (clientes.length) return;
    try { const r = await crm({ action:'list', tab:'Clientes' }); clientes = (r&&r.ok&&r.rows)||[]; } catch(e){}
}
function clientesDatalist(){
    return `<datalist id="dlClientes">${clientes.map(c=>`<option value="${esc(c.nombre)}"></option>`).join('')}</datalist>`;
}
function telDeCliente(nombre){ const n=norm(nombre); const c=clientes.find(x=>norm(x.nombre)===n); return c?c.telefono:''; }
function autoTel(pref){
    const tel = telDeCliente(document.getElementById(pref+'Cliente').value);
    const campo = document.getElementById(pref+'Tel');
    if (tel && campo && !campo.value) campo.value = tel;
}
function waLink(tel, texto){
    const t = soloDigitos(tel); if(!t) return '';
    return `https://wa.me/${t.length<=11?'549'+t:t}?text=${encodeURIComponent(texto)}`;
}
function badgeEstado(e){
    const cls = {'Pendiente':'est-pend','Entregado':'est-entr','Cobrado':'est-cobr','Hecho':'est-hecho',
                 'Abierta':'est-abierta','Ganada':'est-cobr','Perdida':'est-perd'}[e]||'est-pend';
    return `<span class="est ${cls}">${esc(e||'Pendiente')}</span>`;
}
function montoTxt(v){ const n=String(v==null?'':v).replace(/[^\d]/g,''); return n?'$'+parseInt(n,10).toLocaleString('es-AR'):''; }

async function cambiarEstadoRegistro(tab, id, valor){
    const arr = tab==='Pedidos'?pedidos:seguimientos;
    const r = arr.find(x=>x.id===id); if(!r) return;
    r.estado = valor;
    if (tab==='Pedidos') pintarPedidos(pedidos); else pintarSeguimientos(seguimientos);
    try { await crm({ action:'update', tab, id, estado:valor }); } catch(e){ alert('No se pudo actualizar el estado.'); }
}
async function borrarRegistro(tab, id){
    if(!confirm('¿Eliminar este registro? No se puede deshacer.')) return;
    const arr = tab==='Pedidos'?pedidos:seguimientos;
    const idx = arr.findIndex(x=>x.id===id); if(idx>=0) arr.splice(idx,1);
    if (tab==='Pedidos') pintarPedidos(pedidos); else pintarSeguimientos(seguimientos);
    try { await crm({ action:'delete', tab, id }); } catch(e){ alert('No se pudo eliminar en el servidor.'); }
}

// ─── PEDIDOS ────────────────────────────────────────────────────
let pedidos = [];
const PEDIDO_ESTADOS = ['Pendiente','Entregado','Cobrado'];

async function renderPedidos(){
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="panel-sec-head">
            <div class="panel-buscar"><i class="fas fa-search"></i>
                <input type="text" id="buscarPed" placeholder="Buscar por cliente, detalle…" oninput="filtrarPedidos()"></div>
            <button class="panel-btn-add" onclick="abrirFormPedido()"><i class="fas fa-plus"></i> Nuevo pedido</button>
        </div>
        <div class="panel-lista" id="listaPed"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>`;
    try {
        const r = await crm({ action:'list', tab:'Pedidos' });
        pedidos = (r&&r.ok&&r.rows)||[];
        pintarPedidos(pedidos);
    } catch(e){ document.getElementById('listaPed').innerHTML = `<div class="panel-error">No se pudieron cargar los pedidos.</div>`; }
}
function filtrarPedidos(){
    const q=(document.getElementById('buscarPed').value||'').toLowerCase().trim();
    pintarPedidos(!q?pedidos:pedidos.filter(p=>(p.cliente+' '+p.detalle+' '+p.telefono+' '+p.estado).toLowerCase().includes(q)));
}
function pintarPedidos(lista){
    const cont=document.getElementById('listaPed'); if(!cont) return;
    if(!lista.length){ cont.innerHTML=`<div class="panel-vacio-chico">No hay pedidos todavía.</div>`; return; }
    cont.innerHTML = lista.map(p=>{
        const wa = waLink(p.telefono, `¡Hola ${p.cliente||''}! Te escribo de San Ou 🔧 por tu pedido.`);
        return `<div class="rec-card">
            <div class="rec-top">
                <span class="rec-nombre">${esc(p.cliente)||'(sin cliente)'}</span>
                ${badgeEstado(p.estado)}
            </div>
            ${p.detalle?`<div class="rec-detalle">${esc(p.detalle)}</div>`:''}
            <div class="rec-meta">
                ${montoTxt(p.monto)?`<span class="rec-monto">${montoTxt(p.monto)}</span>`:''}
                ${p.telefono?`<span><i class="fas fa-phone"></i> ${esc(p.telefono)}</span>`:''}
            </div>
            <div class="rec-acciones">
                <select class="rec-estado" onchange="cambiarEstadoRegistro('Pedidos','${p.id}',this.value)">
                    ${PEDIDO_ESTADOS.map(e=>`<option ${e===(p.estado||'Pendiente')?'selected':''}>${e}</option>`).join('')}
                </select>
                ${wa?`<a class="cli-btn cli-wa" href="${wa}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i></a>`:''}
                <button class="cli-btn" onclick="abrirFormPedido('${p.id}')"><i class="fas fa-pen"></i></button>
                <button class="cli-btn cli-del" onclick="borrarRegistro('Pedidos','${p.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}
function abrirFormPedido(id){
    ensureClientes().then(()=>{
        const p = id?pedidos.find(x=>x.id===id):{};
        document.getElementById('modalTitulo').textContent = id?'Editar pedido':'Nuevo pedido';
        document.getElementById('modalBody').innerHTML = `
            <form class="panel-form" onsubmit="guardarPedido(event,'${id||''}')">
                <label>Cliente</label>
                <input type="text" id="pdCliente" list="dlClientes" value="${esc(p.cliente)}" onchange="autoTel('pd')" autocomplete="off">
                ${clientesDatalist()}
                <label>Teléfono</label>
                <input type="tel" id="pdTel" value="${esc(p.telefono)}">
                <label>Detalle del pedido</label>
                <textarea id="pdDetalle" rows="2" placeholder="Qué productos, cantidades…">${esc(p.detalle)}</textarea>
                <div class="panel-form-2">
                    <div><label>Monto</label><input type="text" id="pdMonto" inputmode="numeric" value="${esc(p.monto)}"></div>
                    <div><label>Estado</label><select id="pdEstado">${PEDIDO_ESTADOS.map(e=>`<option ${e===(p.estado||'Pendiente')?'selected':''}>${e}</option>`).join('')}</select></div>
                </div>
                <label>Notas</label>
                <textarea id="pdNotas" rows="2">${esc(p.notas)}</textarea>
                <button type="submit" class="panel-form-submit" id="btnGuardarPed">Guardar</button>
            </form>`;
        abrirModal();
        setTimeout(()=>document.getElementById('pdCliente').focus(),100);
    });
}
async function guardarPedido(e,id){
    e.preventDefault();
    const btn=document.getElementById('btnGuardarPed'); btn.disabled=true; btn.textContent='Guardando…';
    const datos={ cliente:val('pdCliente'), telefono:val('pdTel'), detalle:val('pdDetalle'), monto:val('pdMonto'), estado:val('pdEstado'), notas:val('pdNotas') };
    try {
        if(id){ await crm({action:'update',tab:'Pedidos',id,...datos}); const c=pedidos.find(x=>x.id===id); if(c)Object.assign(c,datos); }
        else { const r=await crm({action:'add',tab:'Pedidos',...datos}); pedidos.unshift({id:(r&&r.id)||'tmp'+Date.now(),fecha:'',...datos}); }
        cerrarModal(); filtrarPedidos();
    } catch(err){ btn.disabled=false; btn.textContent='Guardar'; alert('No se pudo guardar. Reintentá.'); }
}

// ─── SEGUIMIENTOS ───────────────────────────────────────────────
let seguimientos = [];
const SEG_ESTADOS = ['Pendiente','Hecho'];

async function renderSeguimientos(){
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="panel-sec-head">
            <div class="panel-buscar"><i class="fas fa-search"></i>
                <input type="text" id="buscarSeg" placeholder="Buscar seguimiento…" oninput="filtrarSeguimientos()"></div>
            <button class="panel-btn-add" onclick="abrirFormSeguimiento()"><i class="fas fa-plus"></i> Nuevo seguimiento</button>
        </div>
        <div class="panel-lista" id="listaSeg"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>`;
    try {
        const r = await crm({ action:'list', tab:'Seguimientos' });
        seguimientos = (r&&r.ok&&r.rows)||[];
        // ordenar por fecha objetivo (los sin fecha al final)
        seguimientos.sort((a,b)=>(a.objetivo||'9999').localeCompare(b.objetivo||'9999'));
        pintarSeguimientos(seguimientos);
    } catch(e){ document.getElementById('listaSeg').innerHTML = `<div class="panel-error">No se pudieron cargar los seguimientos.</div>`; }
}
function filtrarSeguimientos(){
    const q=(document.getElementById('buscarSeg').value||'').toLowerCase().trim();
    pintarSeguimientos(!q?seguimientos:seguimientos.filter(s=>(s.cliente+' '+s.motivo+' '+s.telefono+' '+s.estado).toLowerCase().includes(q)));
}
function fechaTxt(iso){
    if(!iso) return '';
    const p = String(iso).slice(0,10).split('-');
    return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function esVencido(s){
    if(!s.objetivo || s.estado==='Hecho') return false;
    return String(s.objetivo).slice(0,10) < new Date().toISOString().slice(0,10);
}
function pintarSeguimientos(lista){
    const cont=document.getElementById('listaSeg'); if(!cont) return;
    if(!lista.length){ cont.innerHTML=`<div class="panel-vacio-chico">No hay seguimientos. Agregá un recordatorio.</div>`; return; }
    cont.innerHTML = lista.map(s=>{
        const wa = waLink(s.telefono, `¡Hola ${s.cliente||''}! Te escribo de San Ou 🔧.`);
        const venc = esVencido(s);
        return `<div class="rec-card${venc?' rec-card-venc':''}">
            <div class="rec-top">
                <span class="rec-nombre">${esc(s.cliente)||'(sin cliente)'}</span>
                ${badgeEstado(s.estado)}
            </div>
            ${s.motivo?`<div class="rec-detalle">${esc(s.motivo)}</div>`:''}
            <div class="rec-meta">
                ${s.objetivo?`<span class="rec-fecha${venc?' venc':''}"><i class="fas fa-calendar-day"></i> ${fechaTxt(s.objetivo)}${venc?' · vencido':''}</span>`:''}
                ${s.telefono?`<span><i class="fas fa-phone"></i> ${esc(s.telefono)}</span>`:''}
            </div>
            <div class="rec-acciones">
                <select class="rec-estado" onchange="cambiarEstadoRegistro('Seguimientos','${s.id}',this.value)">
                    ${SEG_ESTADOS.map(e=>`<option ${e===(s.estado||'Pendiente')?'selected':''}>${e}</option>`).join('')}
                </select>
                ${wa?`<a class="cli-btn cli-wa" href="${wa}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i></a>`:''}
                <button class="cli-btn" onclick="abrirFormSeguimiento('${s.id}')"><i class="fas fa-pen"></i></button>
                <button class="cli-btn cli-del" onclick="borrarRegistro('Seguimientos','${s.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}
function abrirFormSeguimiento(id){
    ensureClientes().then(()=>{
        const s = id?seguimientos.find(x=>x.id===id):{};
        document.getElementById('modalTitulo').textContent = id?'Editar seguimiento':'Nuevo seguimiento';
        document.getElementById('modalBody').innerHTML = `
            <form class="panel-form" onsubmit="guardarSeguimiento(event,'${id||''}')">
                <label>Cliente</label>
                <input type="text" id="sgCliente" list="dlClientes" value="${esc(s.cliente)}" onchange="autoTel('sg')" autocomplete="off">
                ${clientesDatalist()}
                <label>Teléfono</label>
                <input type="tel" id="sgTel" value="${esc(s.telefono)}">
                <label>Motivo</label>
                <textarea id="sgMotivo" rows="2" placeholder="Ej: llamar por presupuesto, avisar que llegó stock…">${esc(s.motivo)}</textarea>
                <div class="panel-form-2">
                    <div><label>Fecha objetivo</label><input type="date" id="sgObjetivo" value="${esc(String(s.objetivo||'').slice(0,10))}"></div>
                    <div><label>Estado</label><select id="sgEstado">${SEG_ESTADOS.map(e=>`<option ${e===(s.estado||'Pendiente')?'selected':''}>${e}</option>`).join('')}</select></div>
                </div>
                <label>Notas</label>
                <textarea id="sgNotas" rows="2">${esc(s.notas)}</textarea>
                <button type="submit" class="panel-form-submit" id="btnGuardarSeg">Guardar</button>
            </form>`;
        abrirModal();
        setTimeout(()=>document.getElementById('sgCliente').focus(),100);
    });
}
async function guardarSeguimiento(e,id){
    e.preventDefault();
    const btn=document.getElementById('btnGuardarSeg'); btn.disabled=true; btn.textContent='Guardando…';
    const datos={ cliente:val('sgCliente'), telefono:val('sgTel'), motivo:val('sgMotivo'), objetivo:val('sgObjetivo'), estado:val('sgEstado'), notas:val('sgNotas') };
    try {
        if(id){ await crm({action:'update',tab:'Seguimientos',id,...datos}); const c=seguimientos.find(x=>x.id===id); if(c)Object.assign(c,datos); }
        else { const r=await crm({action:'add',tab:'Seguimientos',...datos}); seguimientos.unshift({id:(r&&r.id)||'tmp'+Date.now(),fecha:'',...datos}); }
        cerrarModal();
        seguimientos.sort((a,b)=>(a.objetivo||'9999').localeCompare(b.objetivo||'9999'));
        filtrarSeguimientos();
    } catch(err){ btn.disabled=false; btn.textContent='Guardar'; alert('No se pudo guardar. Reintentá.'); }
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
    if (accesoVigente()) { document.body.classList.remove('bloqueado'); navegar('panel'); }
    else {
        const input = document.getElementById('claveInput');
        input.addEventListener('keydown', e => {
            document.getElementById('claveError').classList.remove('on');
            if (e.key === 'Enter') probarClave();
        });
        setTimeout(() => input.focus(), 100);
    }
});
