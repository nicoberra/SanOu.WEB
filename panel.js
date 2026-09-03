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
    else if (sec === 'facturacion') renderFacturacion();
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

    const ahora = new Date();
    const iniSemana = lunesDe(ahora), iniMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const ventas = pedidos.map(p => ({ fecha: parseFechaCRM(p.fecha), monto: montoVenta(p) })).filter(x => x.fecha);
    const factSemana = ventas.filter(x => x.fecha >= iniSemana).reduce((s, x) => s + x.monto, 0);
    const factMes    = ventas.filter(x => x.fecha >= iniMes).reduce((s, x) => s + x.monto, 0);

    const pend      = pedidos.filter(p => p.estado === 'Pendiente');
    const porCobrar = pedidos.filter(p => p.estado !== 'Cobrado');
    const cobrados  = pedidos.filter(p => p.estado === 'Cobrado');
    const segPend   = seguimientos.filter(s => s.estado !== 'Hecho');
    const segVenc   = seguimientos.filter(esVencido);
    const cotAbiertas = cotizaciones.filter(c => !c.estado || c.estado === 'Abierta');
    const web = clientes.filter(esWeb).length;

    const compradores = new Set(pedidos.map(p => norm(p.cliente)).filter(Boolean));
    const nComp = compradores.size;
    const noComp = Math.max(0, clientes.length - nComp);

    // Agenda del día: lo que necesita acción hoy.
    const agenda = [];
    if (segVenc.length)     agenda.push({ t: `${segVenc.length} seguimiento${segVenc.length>1?'s':''} vencido${segVenc.length>1?'s':''}`, ic: 'fa-bell', sec: 'seguimientos' });
    if (porCobrar.length)   agenda.push({ t: `${porCobrar.length} pedido${porCobrar.length>1?'s':''} por cobrar`, ic: 'fa-hand-holding-dollar', sec: 'pedidos' });
    if (pend.length)        agenda.push({ t: `${pend.length} pedido${pend.length>1?'s':''} por entregar`, ic: 'fa-box', sec: 'pedidos' });
    if (cotAbiertas.length) agenda.push({ t: `${cotAbiertas.length} cotización${cotAbiertas.length>1?'es':''} sin respuesta`, ic: 'fa-file-invoice-dollar', sec: 'cotizaciones' });
    const agendaHTML = `
        <div class="dash-agenda">
            <h4>📌 Para hoy</h4>
            ${agenda.length
                ? `<div class="agenda-chips">${agenda.map(a=>`<button class="agenda-chip" onclick="navegar('${a.sec}')"><i class="fas ${a.ic}"></i> ${esc(a.t)}</button>`).join('')}</div>`
                : `<div class="agenda-ok">✅ Todo al día. ¡Buen trabajo!</div>`}
        </div>`;

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
        ${agendaHTML}

        <h4 class="dash-sec">💰 Facturación</h4>
        <div class="dash-cards">
            ${card('Esta semana', fmtMoney(factSemana), ventas.filter(x=>x.fecha>=iniSemana).length + ' ventas', 'fa-calendar-week', 'facturacion', true)}
            ${card('Este mes', fmtMoney(factMes), ventas.filter(x=>x.fecha>=iniMes).length + ' ventas', 'fa-calendar-days', 'facturacion', true)}
            <div class="dash-card" onclick="navegar('pedidos')" id="ganMesCard">
                <div class="dash-ic"><i class="fas fa-arrow-trend-up"></i></div>
                <div class="dash-val dash-val-sm" id="ganMesVal">—</div>
                <div class="dash-tit">Ganancia (mes)</div>
                <div class="dash-sub" id="ganMesSub">calculando…</div>
            </div>
        </div>

        <h4 class="dash-sec">📦 Ventas</h4>
        <div class="dash-cards">
            ${card('Pedidos pendientes', pend.length, 'sin entregar', 'fa-hourglass-half', 'pedidos')}
            ${card('Por cobrar', fmtMoney(sumaMontos(porCobrar)), porCobrar.length + ' pedidos', 'fa-hand-holding-dollar', 'pedidos', true)}
            ${card('Cobrado', fmtMoney(sumaMontos(cobrados)), cobrados.length + ' pedidos', 'fa-circle-check', 'pedidos', true)}
        </div>

        <h4 class="dash-sec">👥 Usuarios</h4>
        <div class="dash-cards">
            ${card('Usuarios', clientes.length, web + ' de la web', 'fa-users', 'clientes')}
            ${card('Compraron', nComp, 'hicieron pedidos', 'fa-cart-shopping', 'clientes')}
            ${card('No compraron', noComp, 'todavía', 'fa-user-clock', 'clientes')}
        </div>

        <h4 class="dash-sec">⏰ Pendientes</h4>
        <div class="dash-cards">
            ${card('Cotizaciones abiertas', cotAbiertas.length, '', 'fa-file-invoice-dollar', 'cotizaciones')}
            ${card('Seguimientos', segPend.length, segVenc.length + ' vencidos', 'fa-bell', 'seguimientos')}
        </div>

        ${listaMini('⚠️ Seguimientos vencidos', segVenc.slice(0, 5).map(s => `${s.cliente || '(sin usuario)'} — ${s.motivo || ''}`), 'seguimientos')}
        ${listaMini('💰 Pedidos por cobrar', porCobrar.slice(0, 5).map(p => `${p.cliente || '(sin usuario)'} · ${montoTxt(p.monto) || '-'} (${p.estado || 'Pendiente'})`), 'pedidos')}`;

    // Ganancia del mes (necesita costos USD + dólar): se calcula aparte para no demorar el panel.
    Promise.all([ensureProductosPrecios(), ensureDolar()]).then(() => {
        const val = document.getElementById('ganMesVal'), sub = document.getElementById('ganMesSub');
        if (!val || seccionActual !== 'panel') return;
        const pedMes = pedidos.filter(p => { const f = parseFechaCRM(p.fecha); return f && f >= iniMes; });
        let gan = 0, medibles = 0;
        pedMes.forEach(p => { const g = gananciaPedido(p); if (g.medible && g.venta > 0) { gan += g.ganancia; medibles++; } });
        if (!dolarValor()) { val.textContent = '—'; sub.textContent = 'sin cotización del dólar'; return; }
        val.textContent = fmtMoney(gan);
        sub.textContent = medibles ? `${medibles} de ${pedMes.length} con costo` : 'cargá el costo USD de los productos';
    });
}

function renderCotizador() {
    document.getElementById('vista').innerHTML =
        `<iframe class="panel-iframe" src="cotizar.html" title="Cotizador"></iframe>`;
}

// ─── FACTURACIÓN ─────────────────────────────────────────────────
function parseFechaCRM(f){
    if(!f) return null;
    const d = new Date(String(f).replace(' ', 'T'));
    return isNaN(d) ? null : d;
}
function hoyISO(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function montoVenta(p){
    let m = parseInt(String(p.monto || '').replace(/[^\d]/g, ''), 10) || 0;
    if (p.enviocobrado === 'Sí') m += parseInt(String(p.enviomonto || '').replace(/[^\d]/g, ''), 10) || 0;
    return m;
}
function lunesDe(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

async function renderFacturacion(){
    const v = document.getElementById('vista');
    v.innerHTML = `<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando facturación…</div>`;
    await ensurePedidos();
    await Promise.all([ensureProductosPrecios(), ensureDolar()]);   // costos + dólar para el beneficio
    if (seccionActual !== 'facturacion') return;

    // Cada venta: monto (facturación) + ganancia (facturación − costo). medible = tiene todos los costos cargados.
    const ventas = pedidos.map(p => {
        const g = gananciaPedido(p);
        return { fecha: parseFechaCRM(p.fecha), monto: montoVenta(p), ganancia: g.ganancia, medible: g.medible };
    }).filter(x => x.fecha);
    if (!ventas.length) {
        v.innerHTML = `<div class="panel-vacio"><i class="fas fa-coins"></i><h3>Sin ventas todavía</h3><p>Cargá pedidos y acá vas a ver la facturación y el beneficio por semana, mes y año.</p></div>`;
        return;
    }

    const ahora = new Date();
    const iniSemana = lunesDe(ahora);
    const iniMes  = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const iniAnio = new Date(ahora.getFullYear(), 0, 1);
    const enSemana = ventas.filter(x => x.fecha >= iniSemana);
    const enMes    = ventas.filter(x => x.fecha >= iniMes);
    const enAnio   = ventas.filter(x => x.fecha >= iniAnio);

    // Suma de facturación y de beneficio de un conjunto de ventas.
    const fact = arr => arr.reduce((s,x)=>s+x.monto, 0);
    const benef = arr => { let g=0, m=0; arr.forEach(x=>{ if(x.medible){ g+=x.ganancia; m++; } }); return { g, m, total: arr.length }; };
    const benSem = benef(enSemana), benMes = benef(enMes), benAnio = benef(enAnio);
    // Subtítulo de una tarjeta de beneficio: avisa si faltan costos.
    const benSub = b => b.total === 0 ? 'sin ventas' : (b.m === b.total ? 'facturación − costo' : `${b.m} de ${b.total} con costo`);

    // Promedios (sobre el tiempo transcurrido desde la primera venta)
    const primera = ventas.map(x => x.fecha).sort((a,b)=>a-b)[0];
    const semanasSpan = Math.max(1, Math.ceil((ahora - primera) / (7*864e5)));
    const mesesSpan   = Math.max(1, (ahora.getFullYear()-primera.getFullYear())*12 + (ahora.getMonth()-primera.getMonth()) + 1);
    const totalMonto  = ventas.reduce((s,x)=>s+x.monto, 0);
    const avgVSem = (ventas.length / semanasSpan), avgVMes = (ventas.length / mesesSpan);
    const avgMSem = (totalMonto / semanasSpan),    avgMMes = (totalMonto / mesesSpan);

    // Agrupar por año, por mes y por semana (con beneficio)
    const porAnio = {}, porMes = {}, porSem = {};
    ventas.forEach(x => {
        const ak = x.fecha.getFullYear();
        (porAnio[ak] = porAnio[ak] || {monto:0, ben:0, mb:0, n:0, d:new Date(ak,0,1)}); porAnio[ak].monto += x.monto; porAnio[ak].n++; if(x.medible){porAnio[ak].ben+=x.ganancia;porAnio[ak].mb++;}
        const mk = x.fecha.getFullYear()+'-'+x.fecha.getMonth();
        (porMes[mk] = porMes[mk] || {monto:0, ben:0, mb:0, n:0, d:x.fecha}); porMes[mk].monto += x.monto; porMes[mk].n++; if(x.medible){porMes[mk].ben+=x.ganancia;porMes[mk].mb++;}
        const lk = lunesDe(x.fecha); const sk = lk.getTime();
        (porSem[sk] = porSem[sk] || {monto:0, ben:0, mb:0, n:0, d:lk}); porSem[sk].monto += x.monto; porSem[sk].n++; if(x.medible){porSem[sk].ben+=x.ganancia;porSem[sk].mb++;}
    });
    const anios = Object.values(porAnio).sort((a,b)=>b.d-a.d);
    const meses = Object.values(porMes).sort((a,b)=>b.d-a.d).slice(0,6);
    const sems  = Object.values(porSem).sort((a,b)=>b.d-a.d).slice(0,6);
    const etAnio = d => String(d.getFullYear());
    const etMes = d => MESES[d.getMonth()]+' '+d.getFullYear();
    const etSem = d => { const f=new Date(d); f.setDate(f.getDate()+6); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} – ${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}`; };
    // Fila de la lista: facturación + beneficio (si hay costos cargados en ese período).
    const filaBen = (o, et) => `<div class="fact-fila"><span>${et(o.d)}</span>
        <span class="fact-cifras"><b>${fmtMoney(o.monto)}</b>${o.mb ? `<span class="fact-ben">↑ ${fmtMoney(o.ben)}</span>` : ''}</span></div>`;

    v.innerHTML = `
        <h4 class="dash-sec">💰 Facturación</h4>
        <div class="dash-cards">
            <div class="dash-card"><div class="dash-ic"><i class="fas fa-calendar-week"></i></div>
                <div class="dash-val dash-val-sm">${fmtMoney(fact(enSemana))}</div>
                <div class="dash-tit">Esta semana</div><div class="dash-sub">${enSemana.length} venta${enSemana.length!==1?'s':''}</div></div>
            <div class="dash-card"><div class="dash-ic"><i class="fas fa-calendar-days"></i></div>
                <div class="dash-val dash-val-sm">${fmtMoney(fact(enMes))}</div>
                <div class="dash-tit">Este mes</div><div class="dash-sub">${enMes.length} venta${enMes.length!==1?'s':''}</div></div>
            <div class="dash-card"><div class="dash-ic"><i class="fas fa-calendar"></i></div>
                <div class="dash-val dash-val-sm">${fmtMoney(fact(enAnio))}</div>
                <div class="dash-tit">Este año</div><div class="dash-sub">${enAnio.length} venta${enAnio.length!==1?'s':''}</div></div>
        </div>

        <h4 class="dash-sec">📈 Beneficio <small>(facturación − costo)</small></h4>
        <div class="dash-cards">
            <div class="dash-card fact-card-ben"><div class="dash-ic"><i class="fas fa-arrow-trend-up"></i></div>
                <div class="dash-val dash-val-sm">${fmtMoney(benSem.g)}</div>
                <div class="dash-tit">Esta semana</div><div class="dash-sub">${benSub(benSem)}</div></div>
            <div class="dash-card fact-card-ben"><div class="dash-ic"><i class="fas fa-arrow-trend-up"></i></div>
                <div class="dash-val dash-val-sm">${fmtMoney(benMes.g)}</div>
                <div class="dash-tit">Este mes</div><div class="dash-sub">${benSub(benMes)}</div></div>
            <div class="dash-card fact-card-ben"><div class="dash-ic"><i class="fas fa-arrow-trend-up"></i></div>
                <div class="dash-val dash-val-sm">${fmtMoney(benAnio.g)}</div>
                <div class="dash-tit">Este año</div><div class="dash-sub">${benSub(benAnio)}</div></div>
        </div>

        <div class="fact-prom">
            <h4>Promedios</h4>
            <div class="fact-prom-grid">
                <div><span>${avgVSem.toFixed(1)}</span> ventas / semana</div>
                <div><span>${avgVMes.toFixed(1)}</span> ventas / mes</div>
                <div><span>${fmtMoney(Math.round(avgMSem))}</span> por semana</div>
                <div><span>${fmtMoney(Math.round(avgMMes))}</span> por mes</div>
            </div>
        </div>

        <div class="dash-lista">
            <h4>📆 Por año <small>facturación · beneficio</small></h4>
            ${anios.map(a => filaBen(a, etAnio)).join('')}
        </div>
        <div class="dash-lista">
            <h4>📅 Por mes <small>facturación · beneficio</small></h4>
            ${meses.map(m => filaBen(m, etMes)).join('')}
        </div>
        <div class="dash-lista">
            <h4>🗓️ Por semana <small>facturación · beneficio</small></h4>
            ${sems.map(s => filaBen(s, etSem)).join('')}
        </div>`;
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
            <button class="cli-tab active" data-v="mis" onclick="cambiarVistaClientes('mis')">Mis usuarios <span id="cntMis"></span></button>
            <button class="cli-tab" data-v="web" onclick="cambiarVistaClientes('web')">Usuarios web <span id="cntWeb"></span></button>
        </div>
        <div class="panel-sec-head">
            <div class="panel-buscar">
                <i class="fas fa-search"></i>
                <input type="text" id="buscarCli" placeholder="Buscar por nombre, empresa, teléfono…" oninput="filtrarClientes()">
            </div>
            <button class="panel-btn-add" onclick="abrirFormCliente()"><i class="fas fa-plus"></i> Nuevo usuario</button>
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
            `<div class="panel-error">No se pudieron cargar los usuarios. Revisá tu conexión.</div>`;
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
            : 'No hay usuarios cargados. Agregá el primero con "Nuevo usuario".'}</div>`;
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
    document.getElementById('modalTitulo').textContent = c.nombre || 'Usuario';
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
            ${waLink(c.telefono, `¡Hola ${(c.nombre||'').split(' ')[0]}! Te escribo de San Ou 🔧.`) ? `<a class="cli-btn cli-wa" href="${waLink(c.telefono, `¡Hola ${(c.nombre||'').split(' ')[0]}! Te escribo de San Ou 🔧.`)}" target="_blank" rel="noopener" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
            <button class="cli-btn" onclick="abrirFormCliente('${c.id}')" title="Editar"><i class="fas fa-pen"></i></button>
            <button class="cli-btn cli-del" onclick="cerrarModal(); borrarCliente('${c.id}')" title="Eliminar usuario"><i class="fas fa-trash"></i></button>
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
        hist.innerHTML = `<div class="panel-vacio-chico">Todavía no hay pedidos, cotizaciones ni seguimientos de este usuario.</div>`;
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
    setTimeout(() => abrirFormPedido(null, { cliente: nombre, telefono: tel }), 200);
}

function abrirFormCliente(id) {
    const c = id ? clientes.find(x => x.id === id) : {};
    document.getElementById('modalTitulo').textContent = id ? 'Editar usuario' : 'Nuevo usuario';
    document.getElementById('modalBody').innerHTML = `
        <form class="panel-form" onsubmit="guardarCliente(event, '${id || ''}')">
            <div class="panel-form-2">
                <div><label>Nombre *</label><input type="text" id="fNombre" value="${esc(c.nombre)}" required></div>
                <div><label>Fecha (alta / venta)</label><input type="date" id="fFecha" value="${id && c.fecha ? String(c.fecha).slice(0,10) : hoyISO()}"></div>
            </div>
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
        fecha:     document.getElementById('fFecha').value.trim(),
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
    if (!confirm(`¿Eliminar a ${c ? c.nombre : 'este usuario'}? No se puede deshacer.`)) return;
    clientes = clientes.filter(x => x.id !== id);       // sacarlo en el acto
    actualizarContadores();
    filtrarClientes();
    try { await crm({ action: 'delete', tab: 'Clientes', id }); }
    catch (e) { alert('No se pudo eliminar en el servidor. Recargá para verificar.'); }
}

// ─── PRODUCTOS ──────────────────────────────────────────────────
let productos = [];
let dolar = { blue: 0, oficial: 0, tipo: 'blue', hora: '' };

async function ensureDolar(force){
    if (dolar.blue && !force) return;
    try {
        const [b, o] = await Promise.all([
            fetch('https://dolarapi.com/v1/dolares/blue').then(r=>r.json()),
            fetch('https://dolarapi.com/v1/dolares/oficial').then(r=>r.json())
        ]);
        dolar.blue = b.venta || 0; dolar.oficial = o.venta || 0;
        dolar.hora = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
    } catch(e){}
}
function dolarValor(){ return dolar[dolar.tipo] || 0; }
function pintarBarraDolar(){
    const el = document.getElementById('barraDolar'); if(!el) return;
    el.innerHTML = dolarValor() ? `
        <div class="dol-tipo">
            <button class="${dolar.tipo==='blue'?'active':''}" onclick="cambiarDolarTipo('blue')">Blue</button>
            <button class="${dolar.tipo==='oficial'?'active':''}" onclick="cambiarDolarTipo('oficial')">Oficial</button>
        </div>
        <div class="dol-val">US$1 = <b>${fmtMoney(dolarValor())}</b>${dolar.hora?` <span>· ${dolar.hora}</span>`:''}</div>
        <button class="dol-refresh" onclick="refrescarDolar()" title="Actualizar"><i class="fas fa-rotate"></i></button>`
        : `<span class="dol-off">Sin cotización del dólar (revisá tu conexión)</span>`;
}
function cambiarDolarTipo(t){ dolar.tipo=t; pintarBarraDolar(); filtrarProductos(); }
async function refrescarDolar(){ const el=document.getElementById('barraDolar'); if(el)el.innerHTML='<i class="fas fa-rotate fa-spin"></i>'; await ensureDolar(true); pintarBarraDolar(); filtrarProductos(); }

async function renderProductos() {
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="dol-bar" id="barraDolar"></div>
        <div class="panel-sec-head">
            <div class="panel-buscar">
                <i class="fas fa-search"></i>
                <input type="text" id="buscarProd" placeholder="Buscar producto…" oninput="filtrarProductos()">
            </div>
        </div>
        <p class="prod-ayuda">Precio, stock, destacado y costo en USD. Se guarda al instante. El costo se convierte a pesos al dólar actual.</p>
        <div class="panel-lista" id="listaProd"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando productos…</div></div>`;
    ensureDolar().then(pintarBarraDolar);
    try {
        const r = await crm({ action: 'productos_list', tab: 'Clientes' });
        productos = (r && r.ok && r.rows) ? r.rows : [];
        _preciosCargados = true;
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
        <div class="prod-card${p.stock ? '' : ' prod-card-sinstock'}" id="prod-${i}">
            <div class="prod-top">
                <span class="prod-nombre">${esc(p.nombre)}${p.stock ? '' : ' <span class="prod-badge-sinstock">Sin stock</span>'}</span>
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
            ${bloqueCosto(p, i)}
        </div>`;
    }).join('');
}

function bloqueCosto(p, i){
    const costo = parseFloat(String(p.costousd||'').replace(/[^\d.]/g,'')) || 0;
    const rate = dolarValor();
    const costoPesos = Math.round(costo * rate);
    const precioNum = parseInt(String(p.precio).replace(/[^\d]/g,''), 10) || 0;
    const ganancia = precioNum - costoPesos;
    const margen = (precioNum>0 && costoPesos>0) ? Math.round((ganancia/precioNum)*100) : null;
    return `
        <div class="prod-costo">
            <label class="prod-num">Costo (USD)
                <input type="text" inputmode="decimal" value="${esc(p.costousd||'')}" placeholder="0"
                    onchange="guardarProducto(${i},'costousd',this.value)">
            </label>
            <div class="prod-costo-info">
                ${costo && rate ? `<div class="prod-costo-pesos">≈ ${fmtMoney(costoPesos)}</div>` : (costo && !rate ? '<div class="prod-costo-pesos">—</div>' : '')}
                ${(costo && rate && precioNum) ? `<div class="prod-margen ${ganancia<0?'neg':''}">Ganancia ${fmtMoney(ganancia)}${margen!=null?` · ${margen}%`:''}</div>` : ''}
            </div>
        </div>`;
}

let _prodTimers = {};
async function guardarProducto(i, campo, valor) {
    const p = productos[i];
    if (!p) return;
    p[campo] = valor;
    if (campo === 'costousd' || campo === 'stock') filtrarProductos();   // actualizar pesos/ganancia o el cartel "Sin stock"
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
                <input type="text" id="buscarPed" placeholder="Buscar por usuario, detalle…" oninput="filtrarPedidos()"></div>
            <button class="panel-btn-add" onclick="abrirFormPedido()"><i class="fas fa-plus"></i> Nuevo pedido</button>
        </div>
        <div class="panel-lista" id="listaPed"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>`;
    try {
        const r = await crm({ action:'list', tab:'Pedidos' });
        pedidos = (r&&r.ok&&r.rows)||[];
        pintarPedidos(pedidos);
        // Costos + dólar en segundo plano: al llegar, repintar con la ganancia.
        Promise.all([ensureProductosPrecios(), ensureDolar()]).then(()=>pintarPedidos(pedidos));
    } catch(e){ document.getElementById('listaPed').innerHTML = `<div class="panel-error">No se pudieron cargar los pedidos.</div>`; }
}
// Mensaje de WhatsApp según el estado del pedido.
function msgPedido(p){
    const nom = p.cliente ? ' ' + String(p.cliente).split(' ')[0] : '';
    if (p.estado === 'Entregado' && montoTxt(p.monto))
        return `¡Hola${nom}! Te escribo de San Ou 🔧. Te paso que quedó pendiente el pago de tu pedido${montoTxt(p.monto)?' por '+montoTxt(p.monto):''}. ¡Gracias!`;
    if (p.estado === 'Cobrado')
        return `¡Hola${nom}! Gracias por tu compra en San Ou 🔧. Cualquier cosa que necesites, quedo a disposición.`;
    return `¡Hola${nom}! Te escribo de San Ou 🔧 por tu pedido${p.detalle?': '+p.detalle:''}. ¡Ya lo estamos preparando!`;
}
function filtrarPedidos(){
    const q=(document.getElementById('buscarPed').value||'').toLowerCase().trim();
    pintarPedidos(!q?pedidos:pedidos.filter(p=>(p.cliente+' '+p.detalle+' '+p.telefono+' '+p.estado).toLowerCase().includes(q)));
}
function pintarPedidos(lista){
    const cont=document.getElementById('listaPed'); if(!cont) return;
    if(!lista.length){ cont.innerHTML=`<div class="panel-vacio-chico">No hay pedidos todavía.</div>`; return; }
    cont.innerHTML = lista.map(p=>{
        const wa = waLink(p.telefono, msgPedido(p));
        const g = gananciaPedido(p);
        return `<div class="rec-card">
            <div class="rec-top">
                <span class="rec-nombre">${esc(p.cliente)||'(sin usuario)'}</span>
                ${badgeEstado(p.estado)}
            </div>
            ${p.detalle?`<div class="rec-detalle">${esc(p.detalle)}</div>`:''}
            <div class="rec-meta">
                ${montoTxt(p.monto)?`<span class="rec-monto">${montoTxt(p.monto)}</span>`:''}
                ${g.medible&&g.costo>0?`<span class="rec-gan ${g.ganancia>=0?'gan-pos':'gan-neg'}"><i class="fas fa-arrow-trend-up"></i> ${fmtMoney(g.ganancia)} · ${g.pct}%</span>`:''}
                ${p.envio==='Sí'?`<span><i class="fas fa-truck"></i> Envío${p.enviocobrado==='Sí'?(montoTxt(p.enviomonto)?' '+montoTxt(p.enviomonto):' cobrado'):' sin cobrar'}</span>`:''}
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
// ── Catálogo (fotos + categorías) y precios ──
function catProds(){ return window.SANOU_PRODUCTOS || []; }
function catNombres(){ return window.SANOU_CAT_NAMES || {}; }
let _preciosCargados = false;
async function ensureProductosPrecios(){
    if(_preciosCargados) return;
    try{ const r=await crm({action:'productos_list',tab:'Clientes'}); productos=(r&&r.ok&&r.rows)||[]; _preciosCargados=true; }catch(e){}
}
function precioDe(nombre){ const n=norm(nombre); const p=(productos||[]).find(x=>norm(x.nombre)===n); return p?(parseInt(String(p.precio).replace(/[^\d]/g,''),10)||0):0; }
function costoUsdDe(nombre){ const n=norm(nombre); const p=(productos||[]).find(x=>norm(x.nombre)===n); return p?(parseFloat(String(p.costousd||'').replace(/[^\d.]/g,''))||0):0; }
// Stock de un producto según la planilla: true / false, o null si no está en la planilla (no lo marcamos).
function stockDe(nombre){ const n=norm(nombre); const p=(productos||[]).find(x=>norm(x.nombre)===n); return p ? !!p.stock : null; }
// Ganancia de un pedido: venta − costo (costo USD × dólar × cantidad). medible=false si falta algún costo.
function gananciaPedido(p){
    const dv = dolarValor();
    const items = parseDetalle(p.detalle);
    let costo = 0, medible = items.length > 0 && dv > 0;
    items.forEach(it => { const cu = costoUsdDe(it.nombre); if (!cu) medible = false; costo += cu * dv * (it.cantidad || 1); });
    const venta = montoVenta(p);
    const gan = venta - costo;
    return { costo, ganancia: gan, pct: venta > 0 ? Math.round(gan / venta * 100) : 0, medible, venta };
}
function getImgsPanel(p){
    if(!p||!p.imgs||p.imgs===0) return [];
    const cf=p.catFolder||p.category, fo=p.folder||p.name;
    if(Array.isArray(p.imgs)) return p.imgs.map(f=>`productos/${cf}/${fo}/${f}`);
    const ext=p.ext||'jpg';
    return Array.from({length:p.imgs},(_,i)=>`productos/${cf}/${fo}/${i+1}.${ext}`);
}
function imgTag(p, cls){
    const im=getImgsPanel(p);
    return im.length
        ? `<img src="${im[0]}" class="${cls}" loading="lazy" onerror="this.outerHTML='<div class=\\'${cls} pk-ic\\'><i class=\\'fas ${p.icon||'fa-box'}\\'></i></div>'">`
        : `<div class="${cls} pk-ic"><i class="fas ${p.icon||'fa-box'}"></i></div>`;
}

// ── Selector de productos (con categorías y fotos) ──
let pedidoItems = [];   // {nombre, cantidad}
let pickerCat = 'all';

function abrirPicker(){
    ensureProductosPrecios().then(()=>{
        pickerCat='all';
        renderPickerCats();
        renderPicker();
        document.getElementById('pickerOverlay').classList.add('active');
        document.getElementById('pickerModal').classList.add('active');
    });
}
function cerrarPicker(){
    document.getElementById('pickerOverlay').classList.remove('active');
    document.getElementById('pickerModal').classList.remove('active');
}
function renderPickerCats(){
    const cats=catNombres();
    const chips=['all', ...Object.keys(cats).filter(k=>catProds().some(p=>p.category===k))];
    document.getElementById('pickerCats').innerHTML = chips.map(k=>
        `<button class="pk-cat${k===pickerCat?' active':''}" onclick="pickerCategoria('${k}')">${k==='all'?'Todas':esc(cats[k]||k)}</button>`).join('');
}
function pickerCategoria(k){ pickerCat=k; renderPickerCats(); renderPicker(); }
function renderPicker(){
    const q=(document.getElementById('pickerBuscar').value||'').toLowerCase().trim();
    let lista=catProds();
    if(pickerCat!=='all') lista=lista.filter(p=>p.category===pickerCat);
    if(q) lista=lista.filter(p=>p.name.toLowerCase().includes(q));
    document.getElementById('pickerBody').innerHTML = lista.map(p=>{
        const gi=catProds().indexOf(p), pr=precioDe(p.name);
        const enPed=pedidoItems.find(x=>norm(x.nombre)===norm(p.name));
        const sinStock = stockDe(p.name) === false;
        return `<div class="pk-card${sinStock?' pk-card-sinstock':''}" onclick="agregarAlPedido(${gi})">
            <div class="pk-img-wrap">${imgTag(p,'pk-img')}${sinStock?'<span class="pk-sinstock">Sin stock</span>':''}</div>
            <div class="pk-info"><div class="pk-nombre">${esc(p.name)}</div><div class="pk-precio">${pr?fmtMoney(pr):'consultar'}</div></div>
            ${enPed?`<span class="pk-qty">${enPed.cantidad}</span>`:`<span class="pk-add"><i class="fas fa-plus"></i></span>`}
        </div>`;
    }).join('') || '<div class="panel-vacio-chico">Sin productos.</div>';
}
function agregarAlPedido(gi){
    const p=catProds()[gi]; if(!p) return;
    const it=pedidoItems.find(x=>norm(x.nombre)===norm(p.name));
    if(it) it.cantidad++; else pedidoItems.push({nombre:p.name, cantidad:1});
    renderPicker(); renderPedidoItems();
}
function cambiarCantItem(i,d){ if(!pedidoItems[i])return; pedidoItems[i].cantidad=Math.max(1,pedidoItems[i].cantidad+d); renderPedidoItems(); renderPicker(); }
function quitarItemPedido(i){ pedidoItems.splice(i,1); renderPedidoItems(); renderPicker(); }
function renderPedidoItems(){
    const cont=document.getElementById('pdItems'); if(!cont) return;
    if(!pedidoItems.length){ cont.innerHTML='<div class="pd-items-vacio">Sin productos. Tocá "Agregar productos".</div>'; }
    else cont.innerHTML = pedidoItems.map((it,i)=>{
        const pr=precioDe(it.nombre);
        return `<div class="pd-item">
            <span class="pd-item-nom">${esc(it.nombre)}</span>
            <div class="pd-item-qty">
                <button type="button" onclick="cambiarCantItem(${i},-1)">−</button>
                <span>${it.cantidad}</span>
                <button type="button" onclick="cambiarCantItem(${i},1)">+</button>
            </div>
            <span class="pd-item-sub">${pr?fmtMoney(pr*it.cantidad):'-'}</span>
            <button type="button" class="pd-item-del" onclick="quitarItemPedido(${i})">×</button>
        </div>`;
    }).join('');
    const monto = pedidoItems.reduce((s,it)=>s+precioDe(it.nombre)*it.cantidad,0);
    const mEl=document.getElementById('pdMontoTxt'); if(mEl) mEl.textContent = fmtMoney(monto);
}
function parseDetalle(det){
    if(!det) return [];
    return String(det).split(',').map(s=>{ const m=s.trim().match(/^(\d+)x\s+(.+)$/); return m?{nombre:m[2].trim(),cantidad:parseInt(m[1],10)}:null; }).filter(Boolean);
}
function toggleEnvio(){ document.getElementById('pdEnvioDet').style.display = document.getElementById('pdEnvio').checked?'block':'none'; }
function toggleEnvioCobr(){ document.getElementById('pdEnvioMontoWrap').style.display = document.getElementById('pdEnvioCobr').checked?'block':'none'; }

function abrirFormPedido(id, prefill){
    ensureClientes().then(async ()=>{
        await ensureProductosPrecios();
        const p = id?pedidos.find(x=>x.id===id):(prefill||{});
        pedidoItems = parseDetalle(p.detalle);
        const conEnvio=(p.envio==='Sí'), envCobr=(p.enviocobrado==='Sí');
        document.getElementById('modalTitulo').textContent = id?'Editar pedido':'Nuevo pedido';
        document.getElementById('modalBody').innerHTML = `
            <form class="panel-form" onsubmit="guardarPedido(event,'${id||''}')">
                <label>Usuario</label>
                <input type="text" id="pdCliente" list="dlClientes" value="${esc(p.cliente)}" onchange="autoTel('pd')" autocomplete="off">
                ${clientesDatalist()}
                <label>Teléfono</label>
                <input type="tel" id="pdTel" value="${esc(p.telefono)}">
                <label>Productos</label>
                <div class="pd-items" id="pdItems"></div>
                <button type="button" class="pd-add-prod" onclick="abrirPicker()"><i class="fas fa-plus"></i> Agregar productos</button>
                <div class="pd-monto-row">Total productos: <b id="pdMontoTxt">$0</b></div>
                <div class="pd-envio">
                    <label class="pd-check"><input type="checkbox" id="pdEnvio" ${conEnvio?'checked':''} onchange="toggleEnvio()"> Con envío</label>
                    <div id="pdEnvioDet" style="display:${conEnvio?'block':'none'}">
                        <label class="pd-check"><input type="checkbox" id="pdEnvioCobr" ${envCobr?'checked':''} onchange="toggleEnvioCobr()"> Envío cobrado</label>
                        <div id="pdEnvioMontoWrap" style="display:${envCobr?'block':'none'}">
                            <label>Monto del envío</label>
                            <input type="text" id="pdEnvioMonto" inputmode="numeric" value="${esc(p.enviomonto)}">
                        </div>
                    </div>
                </div>
                <label>Estado</label>
                <select id="pdEstado">${PEDIDO_ESTADOS.map(e=>`<option ${e===(p.estado||'Pendiente')?'selected':''}>${e}</option>`).join('')}</select>
                <label>Notas</label>
                <textarea id="pdNotas" rows="2">${esc(p.notas)}</textarea>
                <button type="submit" class="panel-form-submit" id="btnGuardarPed">Guardar</button>
            </form>`;
        renderPedidoItems();
        abrirModal();
    });
}
async function guardarPedido(e,id){
    e.preventDefault();
    const btn=document.getElementById('btnGuardarPed'); btn.disabled=true; btn.textContent='Guardando…';
    const detalle = pedidoItems.map(it=>it.cantidad+'x '+it.nombre).join(', ');
    const monto = pedidoItems.reduce((s,it)=>s+precioDe(it.nombre)*it.cantidad,0);
    const envio = document.getElementById('pdEnvio').checked?'Sí':'No';
    const envCobr = (envio==='Sí' && document.getElementById('pdEnvioCobr').checked)?'Sí':'No';
    const envMonto = envCobr==='Sí' ? String(val('pdEnvioMonto').replace(/[^\d]/g,'')) : '';
    const datos={ cliente:val('pdCliente'), telefono:val('pdTel'), detalle, monto:String(monto), estado:val('pdEstado'), notas:val('pdNotas'), envio, enviocobrado:envCobr, enviomonto:envMonto };
    try {
        if(id){ await crm({action:'update',tab:'Pedidos',id,...datos}); const c=pedidos.find(x=>x.id===id); if(c)Object.assign(c,datos); }
        else { const r=await crm({action:'add',tab:'Pedidos',...datos}); pedidos.unshift({id:(r&&r.id)||'tmp'+Date.now(),fecha:'',...datos}); }
        cerrarModal(); if(seccionActual==='pedidos') filtrarPedidos();
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
                <span class="rec-nombre">${esc(s.cliente)||'(sin usuario)'}</span>
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
                <label>Usuario</label>
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
