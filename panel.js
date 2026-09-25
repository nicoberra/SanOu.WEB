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
    else if (sec === 'mayorista') renderMayorista();
    else if (sec === 'estadisticas') renderEstadisticas();
    else if (sec === 'cotizaciones') renderCotizador();
    else if (sec === 'pedidos') renderPedidos();
    else if (sec === 'marketing') renderMarketing();
    else enConstruccion(sec);
}

// ─── PANEL / TABLERO ─────────────────────────────────────────────
let cotizaciones = [], _cotCargadas = false;
async function ensureCotizaciones(force){ if(_cotCargadas && !force) return; try{ const r=await crm({action:'list',tab:'Cotizaciones'}); if(r&&r.ok&&r.rows){ cotizaciones=r.rows; cacheSet('cotizaciones',cotizaciones);} _cotCargadas=true; }catch(e){} }
function sumaMontos(arr){ return arr.reduce((s,x)=>s+(parseInt(String(x.monto||'').replace(/[^\d]/g,''),10)||0),0); }
function fmtMoney(n){ return '$'+Number(n||0).toLocaleString('es-AR'); }

// ── Caché local (para abrir al instante y refrescar en 2do plano) ──
function cacheGet(k){ try{ const v=localStorage.getItem('sanou_c_'+k); return v?JSON.parse(v):null; }catch(e){ return null; } }
function cacheSet(k,d){ try{ localStorage.setItem('sanou_c_'+k, JSON.stringify(d)); localStorage.setItem('sanou_t_'+k, String(Date.now())); }catch(e){} }
// ¿Los datos de esta tabla se trajeron hace poco? Evita re-descargar de Google
// en cada pantalla (esa era la causa principal de las trabas al cambiar de sección).
function cacheFresco(k, seg){ try{ const t=parseInt(localStorage.getItem('sanou_t_'+k)||'0',10); return (Date.now()-t) < (seg||40)*1000; }catch(e){ return false; } }
function stale(k){ return !cacheFresco(k); }
function hidratarCache(){
    clientes     = cacheGet('clientes')     || clientes;
    pedidos      = cacheGet('pedidos')      || pedidos;
    seguimientos = cacheGet('seguimientos') || seguimientos;
    cotizaciones = cacheGet('cotizaciones') || cotizaciones;
    productos    = cacheGet('productos')    || productos;
}

async function renderDashboard(){
    const hayDatos = clientes.length || pedidos.length || seguimientos.length || cotizaciones.length;
    if (hayDatos) pintarDashboard();     // instantáneo con lo que haya en memoria/caché
    else document.getElementById('vista').innerHTML = `<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando panel…</div>`;
    // refrescar los 4 en paralelo y repintar
    await Promise.all([ensureClientes(stale('clientes')), ensurePedidos(stale('pedidos')), ensureSeguimientos(stale('seguimientos')), ensureCotizaciones(stale('cotizaciones'))]);
    if (seccionActual === 'panel') pintarDashboard();
}

function pintarDashboard(){
    const v = document.getElementById('vista');
    if (!v || seccionActual !== 'panel') return;

    const ahora = new Date();
    const iniSemana = lunesDe(ahora), iniMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1), iniAnio = new Date(ahora.getFullYear(), 0, 1);
    const ventas = pedidos.map(p => ({ fecha: parseFechaCRM(p.fecha), monto: montoVenta(p) })).filter(x => x.fecha);
    const nVentasSemana = ventas.filter(x => x.fecha >= iniSemana).length;
    const nVentasMes    = ventas.filter(x => x.fecha >= iniMes).length;
    const nVentasAnio   = ventas.filter(x => x.fecha >= iniAnio).length;
    const factSemana = ventas.filter(x => x.fecha >= iniSemana).reduce((s, x) => s + x.monto, 0);
    const factMes    = ventas.filter(x => x.fecha >= iniMes).reduce((s, x) => s + x.monto, 0);

    const pend      = pedidos.filter(p => p.estado === 'Pendiente');
    const porCobrar = pedidos.filter(p => estPed(p.estado) !== 'Entregado');
    const cobrados  = pedidos.filter(p => estPed(p.estado) === 'Entregado');
    const segPend   = seguimientos.filter(s => s.estado !== 'Hecho');
    const segVenc   = seguimientos.filter(esVencido);
    const cotAbiertas = cotizaciones.filter(c => !c.estado || c.estado === 'Abierta');
    const web = clientes.filter(esWeb).length;

    const compradores = new Set(pedidos.map(p => norm(p.cliente)).filter(Boolean));
    const nComp = compradores.size;
    const noComp = Math.max(0, clientes.length - nComp);

    // Agenda del día: lo que necesita acción hoy.
    const agenda = [];
    if (porCobrar.length)   agenda.push({ t: `${porCobrar.length} pedido${porCobrar.length>1?'s':''} por cobrar`, ic: 'fa-hand-holding-dollar', sec: 'pedidos' });
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
            ${card('Esta semana', nVentasSemana, nVentasSemana === 1 ? 'venta' : 'ventas', 'fa-calendar-week', 'pedidos')}
            ${card('Este mes', nVentasMes, nVentasMes === 1 ? 'venta' : 'ventas', 'fa-calendar-days', 'pedidos')}
            ${card('Este año', nVentasAnio, nVentasAnio === 1 ? 'venta' : 'ventas', 'fa-calendar', 'pedidos')}
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
        </div>

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

async function renderCotizador() {
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="panel-sec-head">
            <div class="panel-buscar"><i class="fas fa-search"></i>
                <input type="text" id="buscarCot" placeholder="Buscar presupuesto…" oninput="filtrarCotizaciones()"></div>
            <button class="panel-btn-add" onclick="window.open('cotizar.html','_blank')"><i class="fas fa-plus"></i> Nuevo presupuesto</button>
        </div>
        <div class="panel-lista" id="listaCot">${cotizaciones.length ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>'}</div>`;
    if (cotizaciones.length) pintarCotizaciones(cotizaciones);
    // Cargar usuarios (si falta) para poder resolver el WhatsApp por nombre.
    ensureClientes().then(() => { if (seccionActual === 'cotizaciones') pintarCotizaciones(cotizaciones); });
    try {
        const r = await crm({ action: 'list', tab: 'Cotizaciones' });
        if (r && r.ok && r.rows) { cotizaciones = r.rows; cacheSet('cotizaciones', cotizaciones); _cotCargadas = true; }
        if (seccionActual === 'cotizaciones') pintarCotizaciones(cotizaciones);
    } catch (e) { if (!cotizaciones.length) document.getElementById('listaCot').innerHTML = `<div class="panel-error">No se pudieron cargar los presupuestos.</div>`; }
}
function filtrarCotizaciones() {
    const q = (document.getElementById('buscarCot').value || '').toLowerCase().trim();
    pintarCotizaciones(!q ? cotizaciones : cotizaciones.filter(c => (c.cliente + ' ' + c.detalle + ' ' + c.telefono).toLowerCase().includes(q)));
}
function esCotWeb(c) { return String(c.notas || '').startsWith('web|'); }
function pintarCotizaciones(lista) {
    const cont = document.getElementById('listaCot'); if (!cont) return;
    lista = [...lista].sort((a, b) => (parseFechaCRM(b.fecha) || 0) - (parseFechaCRM(a.fecha) || 0));  // nuevas arriba
    if (!lista.length) { cont.innerHTML = `<div class="panel-vacio-chico">Todavía no hay presupuestos.</div>`; return; }
    cont.innerHTML = lista.map(c => {
        const web = esCotWeb(c);
        // Si la cotización no guardó teléfono, lo buscamos en los usuarios por nombre.
        const tel = c.telefono || telDeCliente(c.cliente);
        const wa = waLink(tel, `¡Hola ${(c.cliente || '').split(' ')[0]}! Te escribo de San Ou 🔧 por tu presupuesto.`);
        return `<div class="rec-card">
            <div class="rec-top">
                <span class="rec-nombre">${esc(c.cliente) || '(sin nombre)'}</span>
                ${web ? '<span class="est est-abierta">🌐 Web</span>' : badgeEstado(c.estado || 'Abierta')}
            </div>
            ${c.detalle ? `<div class="rec-detalle">${esc(c.detalle)}</div>` : ''}
            <div class="rec-meta">
                ${montoTxt(c.monto) ? `<span class="rec-monto">${montoTxt(c.monto)}</span>` : ''}
                ${c.fecha ? `<span><i class="fas fa-calendar"></i> ${fechaTxt(c.fecha)}</span>` : ''}
                ${tel ? `<span><i class="fas fa-phone"></i> ${esc(tel)}</span>` : ''}
            </div>
            <div class="rec-acciones">
                ${web ? `<button class="cli-btn cli-verpdf" onclick="verPresupuestoWeb('${c.id}')"><i class="fas fa-file-arrow-down"></i> Ver PDF</button>` : ''}
                <button class="cli-btn cli-topedido" onclick="pasarCotizacionAPedido('${c.id}')"><i class="fas fa-box"></i> A pedido</button>
                ${wa ? `<a class="cli-btn cli-wa" href="${wa}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i></a>` : ''}
                <button class="cli-btn cli-del" onclick="borrarCotizacion('${c.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}
function verPresupuestoWeb(id) {
    const c = cotizaciones.find(x => x.id === id); if (!c) return;
    try {
        const datos = JSON.parse(String(c.notas).slice(4)); // saca el prefijo 'web|'
        localStorage.setItem('sanou_presupuesto', JSON.stringify(datos));
        window.open('presupuesto.html', '_blank');
    } catch (e) { alert('No se pudo abrir el presupuesto (datos incompletos).'); }
}
async function borrarCotizacion(id) {
    if (!(await confirmar('¿Eliminar este presupuesto? No se puede deshacer.'))) return;
    cotizaciones = cotizaciones.filter(x => x.id !== id);
    cacheSet('cotizaciones', cotizaciones);
    pintarCotizaciones(cotizaciones);
    try { await crm({ action: 'delete', tab: 'Cotizaciones', id }); } catch (e) {}
}

// ─── MARKETING ──────────────────────────────────────────────────
let _marketingData = null;
async function renderMarketing(){
    const v = document.getElementById('vista');
    const cache = _marketingData || cacheGet('marketing');
    if (cache) pintarMarketing(cache);
    else v.innerHTML = `<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>`;
    try {
        // Reintenta hasta 3 veces: un bache de 4G ya no rompe la sección.
        let data = null;
        for (let i = 0; i < 3 && !data; i++) {
            try {
                const r = await fetch('marketing.json?_=' + Date.now(), { cache: 'no-store' });
                if (r.ok) data = await r.json();
            } catch(_) {}
            if (!data && i < 2) await new Promise(res => setTimeout(res, 700));
        }
        if (!data) throw new Error('marketing');
        _marketingData = data; cacheSet('marketing', data);
        if (seccionActual === 'marketing') pintarMarketing(data);
    } catch(e){
        if (!cache) v.innerHTML = `<div class="panel-error">No se pudo cargar el resumen de marketing.<br><button class="panel-reintentar" onclick="renderMarketing()"><i class="fas fa-rotate"></i> Reintentar</button></div>`;
    }
}
// ── Acciones: se reinician cada semana (lunes) y queda registro de lo hecho ──
function semMktKey(){ return String(lunesDe(new Date()).getTime()); }
function semMktLabel(ts){ const l=new Date(+ts), f=new Date(l); f.setDate(f.getDate()+6); const p=n=>String(n).padStart(2,'0');
    return `${p(l.getDate())}/${p(l.getMonth()+1)} – ${p(f.getDate())}/${p(f.getMonth()+1)}`; }
function mktDone(){ try{ return JSON.parse(localStorage.getItem('mkt_done_'+semMktKey())||'[]'); }catch(e){ return []; } }
function mktSetDone(arr){
    try{ localStorage.setItem('mkt_done_'+semMktKey(), JSON.stringify(arr)); }catch(e){}
    // Registro histórico por semana (lo que quedó marcado).
    try{ const reg=JSON.parse(localStorage.getItem('mkt_registro')||'{}');
        if(arr.length) reg[semMktKey()]={ label: semMktLabel(semMktKey()), hechas: arr };
        else delete reg[semMktKey()];
        localStorage.setItem('mkt_registro', JSON.stringify(reg)); }catch(e){}
}
function toggleAccion(i, el){
    const a = _marketingData && _marketingData.acciones && _marketingData.acciones[i];
    const texto = a ? a.texto : null; if(!texto) return;
    const arr = mktDone(); const j = arr.indexOf(texto);
    if(el.checked && j<0) arr.push(texto); else if(!el.checked && j>=0) arr.splice(j,1);
    mktSetDone(arr);
    el.closest('.mkt-accion').classList.toggle('hecha', el.checked);
}
function registroMktHTML(){
    let reg={}; try{ reg=JSON.parse(localStorage.getItem('mkt_registro')||'{}'); }catch(e){}
    const wkNow = semMktKey();
    const claves = Object.keys(reg).filter(k => k!==wkNow && (reg[k].hechas||[]).length).sort((a,b)=>b-a);
    if(!claves.length) return '';
    return `<h4 class="dash-sec">🗓️ Registro semanal</h4>` + claves.map(k=>`
        <div class="mkt-reg">
            <div class="mkt-reg-sem">${esc(reg[k].label||'')} <span>${reg[k].hechas.length} ${reg[k].hechas.length===1?'hecha':'hechas'}</span></div>
            <ul class="mkt-reg-list">${reg[k].hechas.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
        </div>`).join('');
}
function pintarMarketing(d){
    const v = document.getElementById('vista'); if(!v || seccionActual!=='marketing') return;
    _marketingData = d;   // asegura que toggleAccion pueda leer el texto de la acción
    const comp = (d.competidores||[]).map(c => `
        <div class="mkt-card">
            <div class="mkt-nombre">${esc(c.nombre)}</div>
            <div class="mkt-handle">${esc(c.handle||'')}${c.tipo?' · '+esc(c.tipo):''}</div>
            <div class="mkt-links">
                ${c.instagram?`<a href="${esc(c.instagram)}" target="_blank" rel="noopener"><i class="fab fa-instagram"></i> Instagram</a>`:''}
                ${c.youtube?`<a href="${esc(c.youtube)}" target="_blank" rel="noopener"><i class="fab fa-youtube"></i> YouTube</a>`:''}
                ${c.web?`<a href="${esc(c.web)}" target="_blank" rel="noopener"><i class="fas fa-globe"></i> Web</a>`:''}
            </div>
            <div class="mkt-bloque"><b>Estrategia:</b> ${esc(c.estrategia||'')}</div>
            ${c.productosEstrella&&c.productosEstrella.length?`<div class="mkt-bloque"><b>Productos estrella:</b> ${c.productosEstrella.map(esc).join(' · ')}</div>`:''}
            ${c.aprender?`<div class="mkt-aprender"><i class="fas fa-lightbulb"></i> ${esc(c.aprender)}</div>`:''}
        </div>`).join('');
    const otros = (d.otrosParaVigilar||[]).map(o=>`<a class="mkt-otro" href="${esc(o.web||o.instagram||'#')}" target="_blank" rel="noopener">${esc(o.nombre)}</a>`).join('');
    const replicar = (d.replicar||[]).map(r=>`
        <div class="mkt-idea">
            <div class="mkt-idea-tit"><i class="fas fa-film"></i> ${esc(r.idea)}${r.formato?` <span>${esc(r.formato)}</span>`:''}</div>
            <div class="mkt-idea-guion">${esc(r.guion||'')}</div>
            ${r.referencia?`<div class="mkt-idea-ref"><i class="fas fa-link"></i> ${esc(r.referencia)}</div>`:''}
        </div>`).join('');
    const hechas = mktDone();
    const acciones = (d.acciones||[]).map((a,i)=>{
        const done = hechas.includes(a.texto);
        return `<label class="mkt-accion${done?' hecha':''}">
            <input type="checkbox" ${done?'checked':''} onchange="toggleAccion(${i},this)">
            <span class="mkt-accion-txt">${esc(a.texto)}</span>
            ${a.prioridad?`<span class="mkt-prio mkt-prio-${esc(a.prioridad)}">${esc(a.prioridad)}</span>`:''}
        </label>`;
    }).join('');
    v.innerHTML = `
        <div class="mkt-head">
            <div class="mkt-fecha"><i class="fas fa-bullhorn"></i> Competencia · <b>${esc(d.actualizado||'')}</b></div>
            ${d.resumen?`<div class="mkt-resumen">${esc(d.resumen)}</div>`:''}
        </div>
        <h4 class="dash-sec">🎯 Competidores</h4>
        ${comp}
        ${otros?`<div class="mkt-otros"><span>También seguí:</span> ${otros}</div>`:''}
        <h4 class="dash-sec">🎬 Contenido para replicar</h4>
        ${replicar}
        <h4 class="dash-sec">✅ Acciones de la semana <small class="mkt-sem-lbl">${semMktLabel(semMktKey())}</small></h4>
        <p class="mkt-sem-nota">Se reinician cada lunes. Lo que marques queda en el registro.</p>
        <div class="mkt-acciones">${acciones}</div>
        ${registroMktHTML()}`;
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
        return { fecha: parseFechaCRM(p.fecha), monto: montoVenta(p), ganancia: g.ganancia, medible: g.medible, items: parseDetalle(p.detalle), cliente: p.cliente };
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
        (porAnio[ak] = porAnio[ak] || {monto:0, ben:0, mb:0, n:0, d:new Date(ak,0,1), vs:[]}); porAnio[ak].monto += x.monto; porAnio[ak].n++; porAnio[ak].vs.push(x); if(x.medible){porAnio[ak].ben+=x.ganancia;porAnio[ak].mb++;}
        const mk = x.fecha.getFullYear()+'-'+x.fecha.getMonth();
        (porMes[mk] = porMes[mk] || {monto:0, ben:0, mb:0, n:0, d:x.fecha, vs:[]}); porMes[mk].monto += x.monto; porMes[mk].n++; porMes[mk].vs.push(x); if(x.medible){porMes[mk].ben+=x.ganancia;porMes[mk].mb++;}
        const lk = lunesDe(x.fecha); const sk = lk.getTime();
        (porSem[sk] = porSem[sk] || {monto:0, ben:0, mb:0, n:0, d:lk, vs:[]}); porSem[sk].monto += x.monto; porSem[sk].n++; porSem[sk].vs.push(x); if(x.medible){porSem[sk].ben+=x.ganancia;porSem[sk].mb++;}
    });
    const anios = Object.values(porAnio).sort((a,b)=>b.d-a.d);
    const meses = Object.values(porMes).sort((a,b)=>b.d-a.d).slice(0,6);
    const sems  = Object.values(porSem).sort((a,b)=>b.d-a.d).slice(0,6);
    const etAnio = d => String(d.getFullYear());
    const etMes = d => MESES[d.getMonth()]+' '+d.getFullYear();
    const etSem = d => { const f=new Date(d); f.setDate(f.getDate()+6); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} – ${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}`; };
    // Fila de la lista: facturación + beneficio (si hay costos cargados en ese período).
    // Es clickeable: se despliega y muestra los productos vendidos en ese período.
    const filaBen = (o, et) => {
        const prods = factProductos(o.vs);
        const unid = prods.reduce((s,pr)=>s+pr.n,0);
        const det = prods.length
            ? `<div class="fact-det-tit">Productos vendidos <small>(${unid} unidad${unid!==1?'es':''})</small></div>`
              + prods.map(pr=>`<div class="fact-prod-fila"><span class="fact-prod-nom">${esc(pr.nombre)}</span><span class="fact-prod-cif"><b>×${pr.n}</b>${pr.importe?`<small class="fact-prod-imp">${fmtMoney(pr.importe)}</small>`:''}</span></div>`).join('')
            : `<div class="fact-prod-vacio">Los pedidos de este período no tienen el detalle de productos cargado.</div>`;
        return `<div class="fact-fila fact-fila-exp" onclick="toggleFactDet(this)"><span class="fact-et"><span class="fact-et-tit"><i class="fas fa-chevron-right fact-chev"></i>${et(o.d)}</span><small class="fact-nv">${o.n} ${o.n===1?'venta':'ventas'}</small></span>
        <span class="fact-cifras"><b>${fmtMoney(o.monto)}</b>${o.mb ? `<span class="fact-ben">↑ ${fmtMoney(o.ben)}</span>` : ''}</span></div>
        <div class="fact-det" style="display:none">${det}</div>`;
    };

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

// Suma los productos vendidos de un conjunto de ventas (para el desglose por período).
// n = unidades; importe = facturado estimado (precio unitario de la planilla × cantidad).
function factProductos(vs){
    const cont = {};
    (vs||[]).forEach(v => (v.items||[]).forEach(it => {
        const k = it.nombre; if(!k) return;
        const c = it.cantidad||1;
        if(!cont[k]) cont[k] = {n:0, importe:0};
        cont[k].n += c;
        cont[k].importe += (precioDe(k)||0) * c;
    }));
    return Object.keys(cont).map(k=>({nombre:k, n:cont[k].n, importe:cont[k].importe})).sort((a,b)=>b.importe-a.importe || b.n-a.n);
}
// Despliega/oculta el detalle de productos de una fila de facturación.
function toggleFactDet(el){
    const d = el.nextElementSibling;
    if(!d || !d.classList.contains('fact-det')) return;
    const abierto = d.style.display !== 'none';
    d.style.display = abierto ? 'none' : 'block';
    el.classList.toggle('abierto', !abierto);
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
// Limpia el teléfono al guardar: saca caracteres invisibles que vienen al copiar
// de WhatsApp (espacios raros, marcas de dirección) y deja solo lo válido de un
// teléfono. Así podés pegar el número tal cual y no tira error.
function limpiarTel(raw){
    return String(raw || '')
        .replace(/[​-‏‪-‮⁠﻿]/g, '')  // ancho cero / marcas bidi
        .replace(/[    ]/g, ' ')               // espacios especiales → normal
        .replace(/[^\d+()\-\s]/g, '')                              // solo dígitos + ( ) - espacios
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[+\-=@]+\s*/, '');   // sin "+"/"="/"-"/"@" al inicio: Sheets lo tomaría como fórmula (#ERROR!)
}

let vistaClientes = 'mis';   // 'mis' (cargados por vos) o 'web' (registrados en la web)
let _pedidosCargados = false, _segCargados = false;

function norm(s){ s = String(s == null ? '' : s).trim().toLowerCase(); return s.normalize ? s.normalize('NFC') : s; }
function esWeb(c){ return c.origen === 'web' || (!c.origen && /web|registro|barra|popup/i.test(String(c.notas || ''))); }

async function ensurePedidos(force){ if(_pedidosCargados && !force) return; try{ const r=await crm({action:'list',tab:'Pedidos'}); if(r&&r.ok&&r.rows){ pedidos=r.rows; cacheSet('pedidos',pedidos);} _pedidosCargados=true; }catch(e){} }
async function ensureSeguimientos(force){ if(_segCargados && !force) return; try{ const r=await crm({action:'list',tab:'Seguimientos'}); if(r&&r.ok&&r.rows){ seguimientos=r.rows; cacheSet('seguimientos',seguimientos);} _segCargados=true; }catch(e){} }
// Pedidos de un cliente: matchea por ID permanente (lo más seguro), y por nombre/teléfono
// como respaldo para pedidos viejos. Así editar nombre/teléfono NUNCA desconecta un pedido.
function pedidosDeCliente(nombre, tel, cid){
    const n=norm(nombre), td=tel?soloDigitos(tel):'';
    return pedidos.filter(p=>
        (cid && p.clienteid && String(p.clienteid)===String(cid)) ||
        norm(p.cliente)===n ||
        (td && td.length>=6 && soloDigitos(p.telefono)===td)
    );
}
function segsDeCliente(nombre){ const n=norm(nombre); return seguimientos.filter(s=>norm(s.cliente)===n); }
// Al renombrar un cliente, cambia su nombre en pedidos/cotizaciones/seguimientos (match por nombre viejo o teléfono).
// Así nunca se "desconecta" un pedido por editar el nombre. Silencioso; no frena el guardado del cliente.
async function renombrarEnRegistros(viejo, tel, nuevo, cid){
    try {
        await ensurePedidos();
        try { await ensureCotizaciones(); } catch(e){}
        try { await ensureSeguimientos(); } catch(e){}
        const nv = norm(viejo), td = tel ? soloDigitos(tel) : '';
        const coincide = r => (cid && r.clienteid && String(r.clienteid)===String(cid)) ||
                              norm(r.cliente)===nv || (td && td.length>=6 && soloDigitos(r.telefono)===td);
        const tareas = [];
        const barrer = (arr, tab) => (arr||[]).forEach(r => {
            if (!coincide(r)) return;
            const cambios = {};
            if (norm(r.cliente)!==norm(nuevo)) { r.cliente = nuevo; cambios.cliente = nuevo; }
            if (cid && String(r.clienteid||'')!==String(cid)) { r.clienteid = cid; cambios.clienteid = cid; }  // dejarlo atado para siempre
            if (Object.keys(cambios).length) tareas.push(crm({ action:'update', tab:tab, id:r.id, ...cambios }));
        });
        barrer(pedidos, 'Pedidos');
        barrer(cotizaciones, 'Cotizaciones');
        barrer(seguimientos, 'Seguimientos');
        if (tareas.length) {
            await Promise.all(tareas);
            cacheSet('pedidos', pedidos);
            if (seccionActual==='pedidos') filtrarPedidos();
        }
    } catch(e){ /* si algo falla, el pedido igual sigue existiendo; el match por ID/teléfono lo muestra */ }
}

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
        <div class="panel-lista" id="listaClientes">${clientes.length ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>'}</div>`;
    document.querySelectorAll('.cli-tab').forEach(b => b.classList.toggle('active', b.dataset.v === vistaClientes));
    if (clientes.length) { actualizarContadores(); filtrarClientes(); }   // pintar al instante desde caché/memoria
    try {
        // Solo re-descargamos si no está cargado o si pasaron +40s (TTL): evita el
        // tironeo de pedir la planilla cada vez que entrás a Usuarios.
        if (!_clientesCargados || stale('clientes')) {
            const r = await crm({ action: 'list', tab: 'Clientes' });
            if (r && r.ok && r.rows) { clientes = r.rows; cacheSet('clientes', clientes); _clientesCargados = true; }
        }
        if (seccionActual !== 'clientes') return;
        actualizarContadores();
        filtrarClientes();
        ensurePedidos().then(() => { if (seccionActual === 'clientes') filtrarClientes(); }); // sumar contador de pedidos
    } catch (e) {
        if (!clientes.length) document.getElementById('listaClientes').innerHTML =
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
    // Por fecha: el más reciente arriba y el más antiguo al final.
    lista = [...lista].sort((a,b)=>(parseFechaCRM(b.fecha)?.getTime() || 0) - (parseFechaCRM(a.fecha)?.getTime() || 0));
    cont.innerHTML = lista.map(c => {
        const tel = soloDigitos(c.telefono);
        const wa = tel ? `https://wa.me/${tel.length <= 11 ? '549' + tel : tel}?text=${encodeURIComponent('¡Hola ' + (c.nombre || '') + '! Te escribo de San Ou 🔧')}` : '';
        const sub = [c.empresa, c.ciudad].filter(Boolean).join(' · ');
        const nped = _pedidosCargados ? pedidosDeCliente(c.nombre, c.telefono, c.id).length : 0;
        return `
        <div class="cli-card" onclick="verCliente('${c.id}')">
            <div class="cli-avatar">${esc((c.nombre || '?').charAt(0).toUpperCase())}</div>
            <div class="cli-info">
                <div class="cli-nombre">${esc(c.nombre) || '(sin nombre)'}<span class="cli-ped-badge${nped ? '' : ' cli-ped-0'}" title="Compras (pedidos) hechas"><i class="fas fa-bag-shopping"></i> ${nped} ${nped === 1 ? 'compra' : 'compras'}</span></div>
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
    await ensureCotizaciones();
    const n = norm(c.nombre), td = soloDigitos(c.telefono);
    const coincide = x => (x.clienteid && String(x.clienteid)===String(c.id)) || norm(x.cliente)===n || (td && td.length>=6 && soloDigitos(x.telefono)===td);
    const peds = pedidosDeCliente(c.nombre, c.telefono, c.id);
    const cots = cotizaciones.filter(coincide);
    const hist = document.getElementById('fichaHist');
    if (!hist) return;
    if (!peds.length && !cots.length) {
        hist.innerHTML = `<div class="panel-vacio-chico">Todavía no hay pedidos ni cotizaciones de este usuario.</div>`;
        return;
    }
    hist.innerHTML =
        cots.map(x => `<div class="hist-item hist-click" onclick="pasarCotizacionAPedido('${x.id}')">
            <span class="hist-tipo hist-cot"><i class="fas fa-file-invoice-dollar"></i></span>
            <div><div class="hist-det">${esc(x.detalle) || 'Cotización'}</div><div class="hist-sub">${montoTxt(x.monto)}${x.fecha ? ' · ' + fechaTxt(x.fecha) : ''}</div></div>
            <span class="hist-topedido"><i class="fas fa-arrow-right"></i> Pedido</span></div>`).join('') +
        peds.map(p => `<div class="hist-item hist-click" onclick="cerrarModal(); setTimeout(()=>abrirFormPedido('${p.id}'),200)">
            <span class="hist-tipo hist-ped"><i class="fas fa-box"></i></span>
            <div><div class="hist-det">${esc(p.detalle) || 'Pedido'}</div><div class="hist-sub">${montoTxt(p.monto)}${p.fecha ? ' · ' + fechaTxt(p.fecha) : ''}</div></div>
            ${badgeEstado(estPed(p.estado))}</div>`).join('');
}

// Pasa una cotización a un pedido nuevo (precarga usuario, teléfono, productos y monto).
function pasarCotizacionAPedido(id){
    const x = cotizaciones.find(c => c.id === id); if(!x) return;
    const tel = x.telefono || telDeCliente(x.cliente) || '';
    cerrarModal();
    setTimeout(()=>abrirFormPedido(null, { cliente:x.cliente, telefono:tel, detalle:x.detalle, monto:x.monto }), 200);
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
        telefono:  limpiarTel(document.getElementById('fTel').value),
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
            const c = clientes.find(x => x.id === id);
            const nombreViejo = c ? c.nombre : '';
            const telViejo = c ? c.telefono : '';
            await crm({ action: 'update', tab: 'Clientes', id, ...datos });
            if (c) Object.assign(c, datos);            // actualizar en el acto
            cacheSet('clientes', clientes);
            // Si cambió el nombre, arrastrar el cambio a TODOS sus registros (así no se "pierden").
            if (nombreViejo && norm(nombreViejo) !== norm(datos.nombre)) {
                renombrarEnRegistros(nombreViejo, telViejo || datos.telefono, datos.nombre, id);
            }
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
    if (!(await confirmar(`¿Eliminar a ${c ? c.nombre : 'este usuario'}? No se puede deshacer.`))) return;
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
function repintarPreciosSec(){ if(seccionActual==='mayorista') filtrarMayorista(); else if(seccionActual==='productos') filtrarProductos(); }
function cambiarDolarTipo(t){ dolar.tipo=t; pintarBarraDolar(); repintarPreciosSec(); }
async function refrescarDolar(){ const el=document.getElementById('barraDolar'); if(el)el.innerHTML='<i class="fas fa-rotate fa-spin"></i>'; await ensureDolar(true); pintarBarraDolar(); repintarPreciosSec(); }

async function renderProductos() {
    prodCat = 'all';
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
        <div class="prod-cats" id="prodCats"></div>
        <div class="panel-lista" id="listaProd">${productos.length ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando productos…</div>'}</div>`;
    ensureDolar().then(()=>{ pintarBarraDolar(); if(seccionActual==='productos') filtrarProductos(); });
    if (productos.length) { renderProdCats(); filtrarProductos(); }   // instantáneo desde caché/memoria
    try {
        const r = await crm({ action: 'productos_list', tab: 'Clientes' });
        if (r && r.ok && r.rows) { productos = r.rows; cacheSet('productos', productos); _preciosCargados = true; }
        if (seccionActual !== 'productos') return;
        renderProdCats();
        filtrarProductos();
    } catch (e) {
        if (!productos.length) document.getElementById('listaProd').innerHTML = `<div class="panel-error">No se pudieron cargar los productos.<br><button class="panel-reintentar" onclick="renderProductos()"><i class="fas fa-rotate"></i> Reintentar</button></div>`;
    }
}

// Categoría de un producto de la planilla (según el catálogo, por nombre o sheetName).
function catDeProducto(nombre){
    const n = norm(nombre);
    const cat = (window.SANOU_PRODUCTOS||[]).find(p => norm(p.name)===n || (p.sheetName && norm(p.sheetName)===n));
    return cat ? cat.category : 'otros';   // los que no están en el catálogo van a "Otros"
}
// Producto del catálogo (para saber en qué carpeta están sus fotos).
function catalogoDe(nombre){
    const n = norm(nombre);
    return (window.SANOU_PRODUCTOS||[]).find(p => norm(p.name)===n || (p.sheetName && norm(p.sheetName)===n)) || null;
}
let prodCat = 'all';
function renderProdCats(){
    const cont = document.getElementById('prodCats'); if(!cont) return;
    const nombres = catNombres();
    const conProd = {};
    productos.forEach(p => { conProd[catDeProducto(p.nombre)] = true; });
    // categorías conocidas con productos + cualquier otra suelta que aparezca
    const orden = Object.keys(nombres).filter(k => conProd[k]);
    Object.keys(conProd).forEach(k => { if(!orden.includes(k)) orden.push(k); });
    const claves = ['all', ...orden];
    cont.innerHTML = claves.map(k =>
        `<button class="prod-cat${k===prodCat?' active':''}" onclick="prodCategoria('${k}')">${k==='all'?'Todas':esc(nombres[k]||k)}</button>`).join('');
}
function prodCategoria(k){ prodCat = k; renderProdCats(); filtrarProductos(); }

function filtrarProductos() {
    const q = (document.getElementById('buscarProd').value || '').toLowerCase().trim();
    let lista = productos;
    if (prodCat !== 'all') lista = lista.filter(p => catDeProducto(p.nombre) === prodCat);
    if (q) lista = lista.filter(p => p.nombre.toLowerCase().includes(q));
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
        const cp = catalogoDe(p.nombre);
        const fo = cp ? (cp.folder || cp.name) : '';
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
            ${cp ? `<div class="prod-rec rec-cargando" id="rec-${i}" data-folder="${esc(fo)}"><i class="fas fa-spinner fa-spin"></i> Buscando recorte…</div>
            <div class="prod-btns">
                <button class="prod-fotos-btn" onclick="abrirFotos('${esc(p.nombre).replace(/'/g,"\\'")}')"><i class="fas fa-camera"></i> Fotos</button>
                <button class="prod-fotos-btn prod-enc-btn" onclick="abrirEncuadre('${esc(p.nombre).replace(/'/g,"\\'")}')"><i class="fas fa-crop-simple"></i> Encuadre 3D</button>
            </div>` : ''}
        </div>`;
    }).join('');
    marcarRecortes();
}
// Marca en cada tarjeta si el producto ya tiene recorte PNG (recortes/<folder>.png).
// Chequea con un HEAD liviano (no baja la imagen); si falla, prueba cargándola.
function marcarRecortes(){
    document.querySelectorAll('.prod-rec[data-folder]').forEach(el => {
        const folder = el.getAttribute('data-folder');
        if(!folder) return;
        const url = REC_BASE + encodeURIComponent(folder) + '.png';
        fetch(url, { method:'HEAD', cache:'no-store' })
            .then(r => pintarRecBadge(el, r.ok))
            .catch(() => {
                const img = new Image();
                img.onload = () => pintarRecBadge(el, true);
                img.onerror = () => pintarRecBadge(el, false);
                img.src = url + '?_=' + Date.now();
            });
    });
}
function pintarRecBadge(el, tiene){
    el.classList.remove('rec-cargando');
    if(tiene){ el.classList.add('rec-si'); el.innerHTML = '<i class="fas fa-cube"></i> Con recorte 3D'; }
    else { el.classList.add('rec-no'); el.innerHTML = '<i class="fas fa-circle-xmark"></i> Sin recorte PNG'; }
}

function bloqueCosto(p, i){
    const costo = parseFloat(String(p.costousd||'').replace(/[^\d.]/g,'')) || 0;
    const rate = dolarValor();
    const costoPesos = Math.round(costo * rate);
    const precioNum = (parseInt(String(p.precio).replace(/[^\d]/g,''), 10) || 0) || (parseInt(String(p.ml).replace(/[^\d]/g,''), 10) || 0);
    const ganancia = precioNum - costoPesos;
    const margen = (precioNum>0 && costoPesos>0) ? Math.round((ganancia/precioNum)*100) : null;
    const hayInfo = costo && rate;
    return `
        <div class="prod-costo${hayInfo ? '' : ' prod-costo-solo'}">
            <label class="prod-num">Costo (USD)
                <input type="text" inputmode="decimal" value="${esc(p.costousd||'')}" placeholder="0"
                    onchange="guardarProducto(${i},'costousd',this.value)">
            </label>
            ${hayInfo ? `<div class="prod-costo-info">
                <div class="prod-costo-pesos">≈ ${fmtMoney(costoPesos)} <span>en pesos</span></div>
                ${precioNum ? `<div class="prod-margen ${ganancia<0?'neg':''}">Ganancia ${fmtMoney(ganancia)}${margen!=null?` · ${margen}%`:''}</div>` : ''}
            </div>` : (costo ? '<div class="prod-costo-info"><div class="prod-costo-pesos">—</div></div>' : '')}
        </div>`;
}

let _prodTimers = {};
async function guardarProducto(i, campo, valor) {
    const p = productos[i];
    if (!p) return;
    p[campo] = valor;
    if (campo === 'costousd' || campo === 'stock') filtrarProductos();   // actualizar pesos/ganancia o el cartel "Sin stock"
    if (campo === 'precio') sincronizarPrecioAMayorista(p.nombre, valor);  // conectado con el unitario del mayorista
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

// ─── FOTOS DE PRODUCTO (ver / subir / borrar, se guardan en la web) ──
const FOTOS_BASE = 'https://sanou.com.ar/productos/';
let _fotosProd = null;
function abrirFotos(nombre){
    const cp = catalogoDe(nombre);
    if(!cp){ alert('Este producto no está en el catálogo, no puedo ubicar su carpeta de fotos.'); return; }
    _fotosProd = { nombre: nombre, cf: cp.catFolder || cp.category, fo: cp.folder || cp.name, lista: [] };
    document.getElementById('modalTitulo').textContent = 'Fotos — ' + nombre;
    document.getElementById('modalBody').innerHTML = `
        <div class="fotos-wrap">
            <label class="fotos-subir"><i class="fas fa-camera"></i> Subir foto
                <input type="file" accept="image/*" onchange="subirFoto(this)" hidden>
            </label>
            <div class="fotos-tip"><i class="fas fa-hand-pointer"></i> Mantené apretada una foto y arrastrala para cambiar el orden. La <b>★ Principal</b> es la que se ve primero.</div>
            <div class="fotos-msg" id="fotosMsg"></div>
            <div class="fotos-grid" id="fotosGrid"><div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div></div>
        </div>`;
    abrirModal();
    cargarFotos();
}
async function cargarFotos(msg){
    if(!_fotosProd) return;
    const grid = document.getElementById('fotosGrid'), m = document.getElementById('fotosMsg');
    if(m) m.textContent = msg || '';
    try {
        const r = await crm({ action:'fotos_list', tab:'Clientes', catFolder:_fotosProd.cf, folder:_fotosProd.fo });
        const fotos = (r && r.fotos) || [];
        _fotosProd.lista = fotos;
        if(!grid) return;
        grid.innerHTML = fotos.length ? fotos.map((fn,i)=>{
            const url = `${FOTOS_BASE}${encodeURIComponent(_fotosProd.cf)}/${encodeURIComponent(_fotosProd.fo)}/${encodeURIComponent(fn)}?_=${Date.now()}`;
            return `<div class="foto-item" data-fn="${esc(fn)}"><img src="${url}" loading="lazy" draggable="false" onerror="this.style.opacity=.25">
                <span class="foto-orden">${i===0?'★ Principal':(i+1)}</span>
                <button class="foto-del" onclick="borrarFoto('${esc(fn).replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i></button></div>`;
        }).join('') : '<div class="panel-vacio-chico">Este producto no tiene fotos todavía. Subí la primera con el botón de arriba.</div>';
        if(fotos.length > 1) habilitarReordenFotos(grid);
    } catch(e){ if(m) m.textContent = 'No se pudieron cargar las fotos.'; }
}
// Reordenar fotos arrastrando con el dedo (o el mouse). Mantener apretado ~una décima y mover.
function habilitarReordenFotos(grid){
    let dragEl=null, ph=null, offX=0, offY=0, timer=null, activo=false, sx=0, sy=0, fromEl=null;
    const items = ()=>[...grid.querySelectorAll('.foto-item')];
    function numerar(){
        let n=1;
        items().forEach(el=>{
            if(el===dragEl) return;
            const b=el.querySelector('.foto-orden'); if(b) b.textContent = n===1 ? '★ Principal' : n;
            n++;
        });
    }
    function pos(e){ const t=e.touches&&e.touches[0]; return t?{x:t.clientX,y:t.clientY}:{x:e.clientX,y:e.clientY}; }
    function bajoPunto(x,y){
        for(const el of items()){
            if(el===dragEl) continue;
            const r=el.getBoundingClientRect();
            if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return el;
        }
        return null;
    }
    function iniciar(el,p){
        activo=true; dragEl=el;
        const r=el.getBoundingClientRect(); offX=p.x-r.left; offY=p.y-r.top;
        ph=document.createElement('div'); ph.className='foto-ph'; ph.style.width=r.width+'px'; ph.style.height=r.height+'px';
        el.parentNode.insertBefore(ph, el);
        el.classList.add('foto-drag');
        el.style.width=r.width+'px'; el.style.height=r.height+'px';
        mover(p);
        numerar();
        if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
    }
    function mover(p){
        dragEl.style.left=(p.x-offX)+'px'; dragEl.style.top=(p.y-offY)+'px';
        const sobre=bajoPunto(p.x,p.y);
        if(sobre && sobre!==ph){
            const r=sobre.getBoundingClientRect();
            const antes = p.x < r.left + r.width/2;
            grid.insertBefore(ph, antes ? sobre : sobre.nextSibling);
            numerar();
        }
    }
    function onDown(e){
        const el=e.target.closest('.foto-item');
        if(!el || e.target.closest('.foto-del')) return;
        const p=pos(e); sx=p.x; sy=p.y; fromEl=el;
        timer=setTimeout(()=>iniciar(el,p), 130);
    }
    function onMove(e){
        const p=pos(e);
        if(activo){ e.preventDefault(); mover(p); return; }
        // si se movió mucho antes de activar, era un scroll: cancelar
        if(timer && (Math.abs(p.x-sx)>10 || Math.abs(p.y-sy)>10)){ clearTimeout(timer); timer=null; }
    }
    function onUp(){
        if(timer){ clearTimeout(timer); timer=null; }
        if(!activo){ return; }
        activo=false;
        ph.parentNode.insertBefore(dragEl, ph); ph.remove();
        dragEl.classList.remove('foto-drag'); dragEl.style.cssText='';
        dragEl=null; ph=null;
        numerar();
        guardarOrdenFotos();
    }
    grid.addEventListener('touchstart', onDown, {passive:true});
    grid.addEventListener('touchmove', onMove, {passive:false});
    grid.addEventListener('touchend', onUp);
    grid.addEventListener('touchcancel', onUp);
    grid.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}
// Guarda en el backend el orden actual (el que muestra el grid).
async function guardarOrdenFotos(){
    if(!_fotosProd) return;
    const orden = [...document.querySelectorAll('#fotosGrid .foto-item')].map(el=>el.dataset.fn).filter(Boolean);
    if(!orden.length) return;
    _fotosProd.lista = orden;
    const m = document.getElementById('fotosMsg'); if(m) m.textContent = 'Guardando orden…';
    try {
        await crm({ action:'fotos_orden', tab:'Clientes', catFolder:_fotosProd.cf, folder:_fotosProd.fo, orden: orden.join(',') });
        if(m) m.textContent = '✓ Orden guardado. Puede tardar ~1 min en verse en la web.';
    } catch(e){ if(m) m.textContent = 'No se pudo guardar el orden. Reintentá.'; }
}
// Redimensiona a máx 1600px y exporta webp (buena calidad, poco peso).
function redimensionarImg(file, maxLado, calidad){
    return new Promise((resolve, reject)=>{
        const img = new Image();
        img.onload = ()=>{
            let w = img.naturalWidth, h = img.naturalHeight;
            if(Math.max(w,h) > maxLado){ const r = maxLado/Math.max(w,h); w = Math.round(w*r); h = Math.round(h*r); }
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(img.src);
            resolve(c.toDataURL('image/webp', calidad || 0.85));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
async function subirFoto(input){
    const file = input.files && input.files[0]; if(!file || !_fotosProd) return;
    const m = document.getElementById('fotosMsg'); if(m) m.textContent = 'Procesando imagen…';
    try {
        const dataUrl = await redimensionarImg(file, 1600, 0.85);
        const b64 = dataUrl.replace(/^data:[^,]*,/, '');
        if(m) m.textContent = 'Subiendo…';
        const params = new URLSearchParams({ action:'foto_subir', tab:'Clientes', catFolder:_fotosProd.cf, folder:_fotosProd.fo, data:b64 });
        await fetch(CRM_URL, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString() });
        input.value = '';
        setTimeout(()=>cargarFotos('✓ Subida. Puede tardar ~1 min en verse en la web.'), 4500);
    } catch(e){ if(m) m.textContent = 'No se pudo subir la foto. Reintentá.'; }
}
async function borrarFoto(fn){
    if(!_fotosProd) return;
    if(!(await confirmar('¿Borrar esta foto? No se puede deshacer.','Borrar'))) return;
    const m = document.getElementById('fotosMsg'); if(m) m.textContent = 'Borrando…';
    try {
        await crm({ action:'foto_borrar', tab:'Clientes', catFolder:_fotosProd.cf, folder:_fotosProd.fo, filename:fn });
        setTimeout(()=>cargarFotos('✓ Borrada.'), 1500);
    } catch(e){ if(m) m.textContent = 'No se pudo borrar. Reintentá.'; }
}

// ─── ENCUADRE 3D (qué parte del recorte PNG se ve, por producto) ─────────
// Edita recortes.json (vía backend/GitHub) sin tocar el PNG: elige el punto (x/y en %)
// y el tamaño (escala) con que la herramienta "sale" del marco en la web.
let _encFolder = '', _encRecUrl = '';
const REC_BASE = 'https://sanou.com.ar/recortes/';
async function abrirEncuadre(nombre){
    const cp = catalogoDe(nombre);
    if(!cp){ alert('Este producto no está en el catálogo, no puedo ubicar su recorte.'); return; }
    _encFolder = cp.folder || cp.name;
    _encRecUrl = REC_BASE + encodeURIComponent(_encFolder) + '.png';
    document.getElementById('modalTitulo').textContent = 'Encuadre 3D — ' + nombre;
    document.getElementById('modalBody').innerHTML = `
        <div class="enc-wrap">
            <div class="enc-preview">
                <div class="enc-marco" id="encMarco">
                    <img class="enc-pop" id="encPop" alt="" draggable="false"
                        onload="document.getElementById('encFalta').style.display='none'"
                        onerror="this.style.display='none';document.getElementById('encFalta').style.display='flex'">
                    <div class="enc-falta" id="encFalta"><i class="fas fa-image"></i> Este producto todavía no tiene recorte PNG.</div>
                </div>
                <div class="enc-linea"></div>
                <div class="enc-linea-lbl">línea del título (así se ve en la web)</div>
            </div>
            <div class="enc-ctrls">
                <div class="enc-fila"><label>◀ Izquierda / Derecha ▶</label><span id="encXv">50%</span></div>
                <input type="range" id="encX" min="0" max="100" value="50" oninput="encActualizar()">
                <div class="enc-fila"><label>▲ Arriba / Abajo ▼</label><span id="encYv">100%</span></div>
                <input type="range" id="encY" min="0" max="100" value="100" oninput="encActualizar()">
                <div class="enc-fila"><label>Tamaño (cuánto sobresale)</label><span id="encEv">140%</span></div>
                <input type="range" id="encE" min="100" max="220" value="140" oninput="encActualizar()">
                <div class="enc-msg" id="encMsg"></div>
                <div class="enc-acciones">
                    <button class="enc-guardar" onclick="encGuardar()"><i class="fas fa-check"></i> Guardar</button>
                    <button class="enc-reset" onclick="encReset()"><i class="fas fa-rotate-left"></i> Centrar</button>
                </div>
                <p class="enc-nota">Movés el encuadre sin tocar el PNG: elegís qué parte se ve y por dónde sobresale. Después de guardar puede tardar 1–2 min en verse en la web.</p>
            </div>
        </div>`;
    abrirModal();
    document.getElementById('encPop').src = _encRecUrl;
    // Cargar los valores actuales desde recortes.json del sitio (si existen).
    try {
        const r = await fetch('https://sanou.com.ar/recortes.json?_=' + Date.now());
        const j = r.ok ? await r.json() : {};
        const c = j[_encFolder];
        if(c && typeof c.x === 'number'){
            document.getElementById('encX').value = c.x;
            document.getElementById('encY').value = c.y;
            document.getElementById('encE').value = Math.round((c.escala||1.4)*100);
        }
    } catch(e){}
    encActualizar();
}
function encActualizar(){
    const x = +document.getElementById('encX').value;
    const y = +document.getElementById('encY').value;
    const e = +document.getElementById('encE').value / 100;
    document.getElementById('encXv').textContent = x + '%';
    document.getElementById('encYv').textContent = y + '%';
    document.getElementById('encEv').textContent = Math.round(e*100) + '%';
    const pop = document.getElementById('encPop');
    if(pop){
        pop.style.objectPosition = x + '% ' + y + '%';
        pop.style.transformOrigin = x + '% ' + y + '%';
        pop.style.transform = 'scale(' + e + ')';
    }
}
function encReset(){
    document.getElementById('encX').value = 50;
    document.getElementById('encY').value = 100;
    document.getElementById('encE').value = 140;
    encActualizar();
}
async function encGuardar(){
    const x = +document.getElementById('encX').value;
    const y = +document.getElementById('encY').value;
    const e = +document.getElementById('encE').value / 100;
    const m = document.getElementById('encMsg');
    if(m){ m.className = 'enc-msg'; m.textContent = 'Guardando…'; }
    try {
        await crm({ action:'recorte_save', tab:'Clientes', folder:_encFolder, x:x, y:y, escala:e });
        if(m){ m.classList.add('ok'); m.textContent = '✓ Guardado. Se va a ver en la web en 1–2 minutos.'; }
    } catch(err){
        if(m){ m.classList.add('err'); m.textContent = 'No se pudo guardar. Reintentá.'; }
    }
}

// ─── MAYORISTA (sheet aparte que se manda a clientes) ───────────
// Mismo sistema que Productos: chips de categoría (Todas / por categoría) + búsqueda.
let mayorista = [], _mayoristaCargado = false, mayCat = 'all';
// Asigna a cada producto la categoría (fila amarilla) que tiene arriba y devuelve el orden de categorías.
function prepararMayorista(){
    let actual = 'Otros'; const orden = [];
    mayorista.forEach(m => {
        if (m.tipo === 'cat') { actual = m.producto; if(!orden.includes(actual)) orden.push(actual); }
        else m._cat = actual;
    });
    return orden;
}
async function renderMayorista(){
    mayCat = 'all';
    const v = document.getElementById('vista');
    const cache = mayorista.length ? mayorista : (cacheGet('mayorista') || []);
    if (cache.length) mayorista = cache;
    v.innerHTML = `
        <div class="dol-bar" id="barraDolar"></div>
        <div class="panel-sec-head">
            <div class="panel-buscar"><i class="fas fa-search"></i>
                <input type="text" id="buscarMay" placeholder="Buscar producto…" oninput="filtrarMayorista()"></div>
        </div>
        <p class="prod-ayuda">Precios mayoristas (se guardan en tu planilla, la que mandás a clientes). El costo sale de Productos, al dólar actual.</p>
        <div class="prod-cats" id="mayCats"></div>
        <div class="panel-lista" id="listaMay">${mayorista.length ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>'}</div>`;
    // Dólar + costos (desde Productos) para mostrar costo USD / pesos y ganancia.
    Promise.all([ensureDolar(), ensureProductosPrecios()]).then(()=>{ if(seccionActual==='mayorista'){ pintarBarraDolar(); filtrarMayorista(); } });
    if (mayorista.length) { renderMayCats(); filtrarMayorista(); }
    if (_mayoristaCargado && !stale('mayorista')) return;   // recién traído: no re-descargar
    try {
        const r = await crm({ action:'mayorista_list', tab:'Clientes' });
        if (r && r.ok && r.rows) { mayorista = r.rows; cacheSet('mayorista', mayorista); _mayoristaCargado = true; }
        if (seccionActual !== 'mayorista') return;
        renderMayCats(); filtrarMayorista();
    } catch(e){
        if (!mayorista.length) document.getElementById('listaMay').innerHTML =
            `<div class="panel-error">No se pudo cargar el mayorista.<br><button class="panel-reintentar" onclick="renderMayorista()"><i class="fas fa-rotate"></i> Reintentar</button></div>`;
    }
}
function renderMayCats(){
    const cont = document.getElementById('mayCats'); if(!cont) return;
    const orden = prepararMayorista();
    const claves = ['all', ...orden];
    cont.innerHTML = claves.map(k =>
        `<button class="prod-cat${k===mayCat?' active':''}" onclick="mayCategoria('${esc(k).replace(/'/g,"\\'")}')">${k==='all'?'Todas':esc(k)}</button>`).join('');
}
function mayCategoria(k){ mayCat = k; renderMayCats(); filtrarMayorista(); }
function filtrarMayorista(){
    prepararMayorista();
    const q = (document.getElementById('buscarMay')?.value || '').toLowerCase().trim();
    let lista = mayorista.filter(m => m.tipo === 'prod');
    if (mayCat !== 'all') lista = lista.filter(m => m._cat === mayCat);
    if (q) lista = lista.filter(m => m.producto.toLowerCase().includes(q));
    pintarMayorista(lista, q);
}
function pintarMayorista(lista, q){
    const cont = document.getElementById('listaMay'); if(!cont) return;
    if(!lista.length){ cont.innerHTML = `<div class="panel-vacio-chico">${q ? 'Sin resultados.' : 'No hay productos.'}</div>`; return; }
    cont.innerHTML = lista.map(m => {
        return `
        <div class="prod-card" id="may-${m.row}">
            <div class="prod-top">
                <span class="prod-nombre">${esc(m.producto)}</span>
                <span class="prod-ok" id="mayok-${m.row}"><i class="fas fa-check"></i> Guardado</span>
            </div>
            <div class="prod-campos">
                <label class="prod-num">Precio mayorista
                    <input type="text" inputmode="numeric" value="${esc(/\d/.test(m.mayorista) ? precioTxt(m.mayorista) : m.mayorista)}"
                        onchange="guardarMayorista(${m.row},'mayorista',this.value)">
                </label>
                <label class="prod-num">Precio unitario
                    <input type="text" inputmode="numeric" value="${esc(/\d/.test(m.unitario) ? precioTxt(m.unitario) : m.unitario)}"
                        onchange="guardarMayorista(${m.row},'unitario',this.value)">
                </label>
                <label class="prod-num">Cantidad mínima
                    <input type="text" value="${esc(m.minimo)}" placeholder="Ej: >6 unidades"
                        onchange="guardarMayorista(${m.row},'minimo',this.value)">
                </label>
                <label class="prod-num">Nota
                    <input type="text" value="${esc(m.nota)}" placeholder="Ej: sin stock"
                        onchange="guardarMayorista(${m.row},'nota',this.value)">
                </label>
            </div>
            ${bloqueCostoMay(m)}
        </div>`;
    }).join('');
}
// Fila de la planilla Productos para un producto del mayorista (tolera el sufijo "(6–50 mm²)").
function filaProdMay(nombre){
    let p = filaProd(nombre);
    if (!p) { const b = baseNombre(nombre); p = (productos||[]).find(x => baseNombre(x.nombre) === b); }
    return p || null;
}
// Costo (USD) EDITABLE + pesos + ganancia sobre el precio mayorista. Se guarda en la planilla de Productos.
function bloqueCostoMay(m){
    const fila = filaProdMay(m.producto);
    if (!fila) return '';   // sin match en Productos: no hay dónde guardar el costo
    const rate = dolarValor();
    const costo = parseFloat(String(fila.costousd||'').replace(/[^\d.]/g,'')) || 0;
    const costoPesos = (costo && rate) ? Math.round(costo * rate) : 0;
    const may = parseInt(String(m.mayorista).replace(/[^\d]/g,''),10) || 0;
    const gan = may - costoPesos;
    const margen = (may>0 && costoPesos>0) ? Math.round((gan/may)*100) : null;
    const nombreEsc = esc(fila.nombre).replace(/'/g,"\\'");
    return `
        <div class="may-costo">
            <label class="prod-num may-costo-input">Costo (USD)
                <input type="text" inputmode="decimal" value="${esc(fila.costousd||'')}" placeholder="0"
                    onchange="guardarCostoMay('${nombreEsc}', this.value)">
            </label>
            ${costoPesos ? `<span class="may-costo-item">≈ <b>${fmtMoney(costoPesos)}</b> en pesos</span>` : ''}
            ${(may && costoPesos) ? `<span class="prod-margen ${gan<0?'neg':''}">Ganancia ${fmtMoney(gan)}${margen!=null?` · ${margen}%`:''}</span>` : ''}
        </div>`;
}
// Busca la fila de Productos para un nombre del mayorista (tolera el sufijo "(6–50 mm²)").
function baseNombre(n){ return norm(String(n).replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim()); }
function costoUsdFlex(nombre){
    let p = filaProd(nombre);                          // match exacto (catálogo → sheetName)
    if (!p) { const b = baseNombre(nombre); p = (productos||[]).find(x => baseNombre(x.nombre) === b); }
    return p ? (parseFloat(String(p.costousd||'').replace(/[^\d.]/g,'')) || 0) : 0;
}
let _mayTimers = {};
async function guardarMayorista(row, campo, valor){
    const m = mayorista.find(x => x.row === row); if(!m) return;
    m[campo] = valor;
    try {
        await crm({ action:'mayorista_save', tab:'Clientes', row, producto: m.producto, [campo]: valor });
        cacheSet('mayorista', mayorista);
        // El precio UNITARIO del mayorista está conectado con el PRECIO de Productos: se sincroniza.
        if (campo === 'unitario') {
            const fila = filaProdMay(m.producto);
            if (fila) { fila.precio = valor; cacheSet('productos', productos); crm({ action:'productos_save', tab:'Clientes', nombre: fila.nombre, precio: valor }); }
        }
        const ok = document.getElementById('mayok-' + row);
        if (ok) { ok.classList.add('on'); clearTimeout(_mayTimers[row]); _mayTimers[row] = setTimeout(()=>ok.classList.remove('on'), 1800); }
        if (campo === 'mayorista' || campo === 'unitario') filtrarMayorista();   // refrescar la ganancia
    } catch(e){ alert('No se pudo guardar "' + m.producto + '". Reintentá.'); }
}
// Guarda el costo (USD) del producto en la planilla de Productos, desde la sección Mayorista.
async function guardarCostoMay(nombreProd, valor){
    const fila = (productos||[]).find(x => x.nombre === nombreProd);
    if (fila) { fila.costousd = valor; cacheSet('productos', productos); }
    try {
        await crm({ action:'productos_save', tab:'Clientes', nombre: nombreProd, costousd: valor });
        filtrarMayorista();   // recomputar ganancia con el costo nuevo
    } catch(e){ alert('No se pudo guardar el costo. Reintentá.'); }
}
// Sincroniza el precio de Productos hacia el "precio unitario" del mayorista (mismo producto).
async function sincronizarPrecioAMayorista(nombreProd, valor){
    try {
        if (!mayorista.length) { const r = await crm({ action:'mayorista_list', tab:'Clientes' }); if (r && r.rows) { mayorista = r.rows; cacheSet('mayorista', mayorista); } }
        const b = baseNombre(nombreProd);
        const m = (mayorista||[]).find(x => x.tipo === 'prod' && baseNombre(x.producto) === b);
        if (m) { m.unitario = valor; cacheSet('mayorista', mayorista); crm({ action:'mayorista_save', tab:'Clientes', row: m.row, producto: m.producto, unitario: valor }); }
    } catch(e){ /* silencioso */ }
}

// ─── ESTADÍSTICAS (eventos de la web) ───────────────────────────
let _statsData = null, _abandonos = [], _statsCargado = false;
// Productos más vendidos: sale de los pedidos del CRM (suma de cantidades).
function masVendidos(){
    const cont = {};
    (pedidos||[]).forEach(p => parseDetalle(p.detalle).forEach(it => {
        const k = it.nombre; if(k) cont[k] = (cont[k]||0) + (it.cantidad||1);
    }));
    return Object.keys(cont).map(k=>({nombre:k, n:cont[k]})).sort((a,b)=>b.n-a.n).slice(0,10);
}
async function renderEstadisticas(){
    const v = document.getElementById('vista');
    const cache = _statsData || cacheGet('stats');
    if (cache) _statsData = cache;
    v.innerHTML = `<div id="statsWrap">${_statsData ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando estadísticas…</div>'}</div>`;
    ensurePedidos().then(()=>{ if(seccionActual==='estadisticas' && _statsData) pintarEstadisticas(); });
    if (_statsData) pintarEstadisticas();
    if (_statsCargado && !stale('stats')) return;
    try {
        const [s, a] = await Promise.all([
            crm({ action:'eventos_stats', tab:'Clientes' }),
            crm({ action:'abandonos_list', tab:'Clientes' })
        ]);
        if (s && s.ok) { _statsData = s.stats; cacheSet('stats', s.stats); _statsCargado = true; }
        if (a && a.ok) _abandonos = a.rows || [];
        if (seccionActual === 'estadisticas') pintarEstadisticas();
    } catch(e){
        if (!_statsData) document.getElementById('statsWrap').innerHTML =
            `<div class="panel-error">No se pudieron cargar las estadísticas.<br><button class="panel-reintentar" onclick="renderEstadisticas()"><i class="fas fa-rotate"></i> Reintentar</button></div>`;
    }
}
function pintarEstadisticas(){
    const w = document.getElementById('statsWrap'); if(!w || seccionActual!=='estadisticas') return;
    const s = _statsData || {};
    const vis = s.visitas || {hoy:0,semana:0,mes:0,total:0};
    const vendidos = masVendidos();
    const rank = (arr, unidad) => (arr && arr.length)
        ? arr.map(x=>`<div class="st-rank"><span class="st-rank-n">${esc(x.nombre)}</span><b>${x.n}${unidad?' '+unidad:''}</b></div>`).join('')
        : '<div class="panel-vacio-chico">Todavía sin datos.</div>';
    // Mini gráfico de visitas (últimos 14 días)
    const pd = s.porDia || [];
    const maxD = Math.max(1, ...pd.map(x=>x.n));
    const barras = pd.map(x=>{
        const h = Math.round((x.n/maxD)*100);
        const dd = x.d.slice(8,10)+'/'+x.d.slice(5,7);
        return `<div class="st-bar" title="${dd}: ${x.n}"><div class="st-bar-fill" style="height:${h}%"></div><span class="st-bar-lbl">${x.d.slice(8,10)}</span></div>`;
    }).join('');
    // Barras con % (mismo estilo que "de dónde vienen"). Sirve para geo y dispositivos.
    const barrasPct = (arr) => {
        arr = arr || [];
        const tot = arr.reduce((a,b)=>a+b.n,0) || 1;
        return arr.length ? arr.map(f=>{
            const pct = Math.round(f.n/tot*100);
            return `<div class="st-fuente"><span>${esc(f.nombre)}</span><div class="st-fuente-bar"><div style="width:${pct}%"></div></div><b>${f.n}</b></div>`;
        }).join('') : '<div class="panel-vacio-chico">Todavía sin datos.</div>';
    };
    const fuentesHTML = barrasPct(s.fuentes);
    const abLista = (_abandonos||[]).slice(0,20).map(a=>`
        <div class="rec-card">
            <div class="rec-top"><span class="rec-nombre">${a.contacto ? esc(a.contacto) : 'Anónimo (sin datos)'}</span>
                ${a.monto?`<span class="rec-monto">${montoTxt(a.monto)}</span>`:''}</div>
            <div class="rec-detalle">${esc(a.item)||'-'}</div>
            <div class="rec-meta"><span><i class="fas fa-clock"></i> ${esc(a.fecha)}</span></div>
        </div>`).join('') || '<div class="panel-vacio-chico">Sin carritos abandonados. 🎉</div>';

    w.innerHTML = `
        <div class="st-cards">
            <div class="st-card"><span class="st-num">${vis.hoy}</span><span class="st-lbl">visitas hoy</span></div>
            <div class="st-card"><span class="st-num">${vis.semana}</span><span class="st-lbl">esta semana</span></div>
            <div class="st-card"><span class="st-num">${vis.mes}</span><span class="st-lbl">este mes</span></div>
            <div class="st-card"><span class="st-num">${vis.total}</span><span class="st-lbl">total</span></div>
        </div>
        <h4 class="dash-sec">📈 Visitas (últimos 14 días)</h4>
        <div class="st-chart">${barras || '<div class="panel-vacio-chico">Todavía sin datos.</div>'}</div>
        <h4 class="dash-sec">🌐 De dónde vienen (fuente)</h4>
        <div class="st-box">${fuentesHTML}</div>
        <h4 class="dash-sec">🇦🇷 País</h4>
        <div class="st-box">${barrasPct(s.paises)}</div>
        <h4 class="dash-sec">📍 Provincia / Región</h4>
        <div class="st-box">${barrasPct(s.regiones)}</div>
        <h4 class="dash-sec">🏙️ Ciudad</h4>
        <div class="st-box">${barrasPct(s.ciudades)}</div>
        <h4 class="dash-sec">📱 Dispositivo</h4>
        <div class="st-box">${barrasPct(s.dispositivos)}</div>
        <h4 class="dash-sec">💻 Sistema operativo</h4>
        <div class="st-box">${barrasPct(s.sistemas)}</div>
        <h4 class="dash-sec">🌍 Navegador</h4>
        <div class="st-box">${barrasPct(s.navegadores)}</div>
        <h4 class="dash-sec">🗣️ Idioma</h4>
        <div class="st-box">${barrasPct(s.idiomas)}</div>
        <div class="st-nota"><i class="fas fa-circle-info"></i> El <b>sexo (hombres/mujeres) y la edad</b> no se pueden saber de una visita web: solo los estima Google Analytics con Google Signals, y de forma aproximada. Todo lo demás (país, zona, dispositivo, etc.) se registra acá con datos reales.</div>
        <h4 class="dash-sec">🏆 Más vendidos</h4>
        <div class="st-box">${rank(vendidos,'u')}</div>
        <h4 class="dash-sec">🔍 Más vistos</h4>
        <div class="st-box">${rank(s.topProductos)}</div>
        <h4 class="dash-sec">🗂️ Categorías más tocadas</h4>
        <div class="st-box">${rank(s.topCategorias)}</div>
        <h4 class="dash-sec">🛒 Carritos abandonados <small class="mkt-sem-lbl">${(_abandonos||[]).length}</small></h4>
        ${abLista}`;
}

// ─── HELPERS PEDIDOS / SEGUIMIENTOS ─────────────────────────────
function val(id){ const e=document.getElementById(id); return e?e.value.trim():''; }
let _clientesCargados = false;
async function ensureClientes(force){
    if (_clientesCargados && !force) return;
    try { const r = await crm({ action:'list', tab:'Clientes' }); if(r&&r.ok&&r.rows){ clientes = r.rows; cacheSet('clientes',clientes);} _clientesCargados=true; } catch(e){}
}
function clientesDatalist(){
    return `<datalist id="dlClientes">${clientes.map(c=>`<option value="${esc(c.nombre)}"></option>`).join('')}</datalist>`;
}
// Lista desplegable de usuarios (para el pedido: se elige, no se escribe).
function clientesSelect(selected){
    const sel = selected || '';
    let opts = clientes.map(c=>`<option value="${esc(c.nombre)}" ${norm(c.nombre)===norm(sel)?'selected':''}>${esc(c.nombre)}</option>`).join('');
    if (sel && !clientes.some(c=>norm(c.nombre)===norm(sel)))
        opts = `<option value="${esc(sel)}" selected>${esc(sel)}</option>` + opts;
    return `<select id="pdCliente" onchange="autoTel('pd')"><option value="">— Elegí un usuario —</option>${opts}</select>`;
}
function telDeCliente(nombre){ const n=norm(nombre); const c=clientes.find(x=>norm(x.nombre)===n); return c?c.telefono:''; }
function autoTel(pref){
    const tel = telDeCliente(document.getElementById(pref+'Cliente').value);
    const campo = document.getElementById(pref+'Tel');
    if (!campo) return;
    if (campo.readOnly) campo.value = tel || '';        // pedido: refleja el del usuario, no se edita
    else if (tel && !campo.value) campo.value = tel;    // seguimiento: completa si está vacío
}
function waLink(tel, texto){
    const t = soloDigitos(tel); if(!t) return '';
    return `https://wa.me/${t.length<=11?'549'+t:t}?text=${encodeURIComponent(texto)}`;
}
function badgeEstado(e){
    const cls = {'Pendiente':'est-pend','Entregado':'est-cobr','Cobrado':'est-cobr','Hecho':'est-hecho',
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
    const q = tab==='Pedidos' ? '¿Eliminar este pedido? No se puede deshacer.' : '¿Eliminar este seguimiento? No se puede deshacer.';
    if(!(await confirmar(q))) return;
    const arr = tab==='Pedidos'?pedidos:seguimientos;
    const idx = arr.findIndex(x=>x.id===id); if(idx>=0) arr.splice(idx,1);
    if (tab==='Pedidos') pintarPedidos(pedidos); else pintarSeguimientos(seguimientos);
    try { await crm({ action:'delete', tab, id }); } catch(e){ alert('No se pudo eliminar en el servidor.'); }
}

// ─── PEDIDOS ────────────────────────────────────────────────────
let pedidos = [];
const PEDIDO_ESTADOS = ['Pendiente','Entregado'];
// Entregado = entregado y cobrado. Los pedidos viejos con "Cobrado" se muestran como "Entregado".
function estPed(e){ return e === 'Cobrado' ? 'Entregado' : (e || 'Pendiente'); }

async function renderPedidos(){
    const v = document.getElementById('vista');
    v.innerHTML = `
        <div class="panel-sec-head">
            <div class="panel-buscar"><i class="fas fa-search"></i>
                <input type="text" id="buscarPed" placeholder="Buscar por usuario, detalle…" oninput="filtrarPedidos()"></div>
            <button class="panel-btn-add" onclick="abrirFormPedido()"><i class="fas fa-plus"></i> Nuevo pedido</button>
        </div>
        <div class="panel-lista" id="listaPed">${pedidos.length ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>'}</div>`;
    if (pedidos.length) pintarPedidos(pedidos);              // instantáneo desde caché/memoria
    // Costos + dólar en segundo plano: al llegar, repintar con la ganancia.
    Promise.all([ensureProductosPrecios(), ensureDolar()]).then(()=>{ if(seccionActual==='pedidos') pintarPedidos(pedidos); });
    try {
        const r = await crm({ action:'list', tab:'Pedidos' });
        if (r&&r.ok&&r.rows){ pedidos = r.rows; cacheSet('pedidos',pedidos); _pedidosCargados=true; }
        if (seccionActual==='pedidos') pintarPedidos(pedidos);
    } catch(e){ if(!pedidos.length) document.getElementById('listaPed').innerHTML = `<div class="panel-error">No se pudieron cargar los pedidos.</div>`; }
}
// Mensaje de WhatsApp según el estado del pedido.
function msgPedido(p){
    const nom = p.cliente ? ' ' + String(p.cliente).split(' ')[0] : '';
    if (estPed(p.estado) === 'Entregado')
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
    // Pendientes siempre arriba y, dentro de cada grupo, por fecha: el más reciente
    // primero y el más antiguo al final.
    lista = [...lista].sort((a,b)=>{
        const ep = (estPed(a.estado)==='Entregado'?1:0) - (estPed(b.estado)==='Entregado'?1:0);
        if(ep) return ep;
        return (parseFechaCRM(b.fecha)?.getTime() || 0) - (parseFechaCRM(a.fecha)?.getTime() || 0);
    });
    cont.innerHTML = lista.map(p=>{
        const wa = waLink(p.telefono, msgPedido(p));
        const g = gananciaPedido(p);
        return `<div class="rec-card">
            <div class="rec-top">
                <span class="rec-nombre">${esc(p.cliente)||'(sin usuario)'}</span>
                ${badgeEstado(estPed(p.estado))}
            </div>
            ${p.detalle?`<div class="rec-detalle">${esc(p.detalle)}</div>`:''}
            <div class="rec-meta">
                ${montoTxt(p.monto)?`<span class="rec-monto">${montoTxt(p.monto)}</span>`:''}
                ${g.medible&&g.costo>0?`<span class="rec-gan ${g.ganancia>=0?'gan-pos':'gan-neg'}"><i class="fas fa-arrow-trend-up"></i> ${fmtMoney(g.ganancia)} · ${g.pct}%</span>`:''}
                ${p.envio==='Sí'?`<span><i class="fas fa-truck"></i> Envío${p.enviocobrado==='Sí'?(montoTxt(p.enviomonto)?' '+montoTxt(p.enviomonto):' cobrado'):' sin cobrar'}</span>`:''}
                ${p.telefono?`<span><i class="fas fa-phone"></i> ${esc(p.telefono)}</span>`:''}
            </div>
            <div class="rec-acciones">
                <select class="rec-estado ${estPed(p.estado)==='Entregado'?'est-entregado':'est-pendiente'}" onchange="cambiarEstadoRegistro('Pedidos','${p.id}',this.value)">
                    ${PEDIDO_ESTADOS.map(e=>`<option value="${e}" ${e===estPed(p.estado)?'selected':''}>${e==='Entregado'?'✓ ':''}${e}</option>`).join('')}
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
async function ensureProductosPrecios(force){
    if(_preciosCargados && !force) return;
    try{ const r=await crm({action:'productos_list',tab:'Clientes'}); if(r&&r.ok&&r.rows){ productos=r.rows; cacheSet('productos',productos);} _preciosCargados=true; }catch(e){}
}
// Traduce el nombre del catálogo al nombre exacto de la planilla (sheetName) si difieren.
function sheetKeyDe(nombre){ const n=norm(nombre); const cat=(window.SANOU_PRODUCTOS||[]).find(p=>norm(p.name)===n); return cat&&cat.sheetName?norm(cat.sheetName):n; }
function filaProd(nombre){ const k=sheetKeyDe(nombre); return (productos||[]).find(x=>norm(x.nombre)===k); }
// Precio de venta: usa el Precio normal; si está en 0/vacío, cae al Precio ML.
function precioDe(nombre){ const p=filaProd(nombre); if(!p) return 0; return (parseInt(String(p.precio).replace(/[^\d]/g,''),10)||0) || (parseInt(String(p.ml).replace(/[^\d]/g,''),10)||0); }
function costoUsdDe(nombre){ const p=filaProd(nombre); return p?(parseFloat(String(p.costousd||'').replace(/[^\d.]/g,''))||0):0; }
// Stock de un producto según la planilla: true / false, o null si no está en la planilla (no lo marcamos).
function stockDe(nombre){ const p=filaProd(nombre); return p ? !!p.stock : null; }
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
    // Autocompletar el "Total a cobrar" con el subtotal mientras no lo hayan editado a mano.
    const tot=document.getElementById('pdMontoInput');
    if(tot && !pedidoMontoManual) tot.value = monto ? montoTxt(monto) : '';
    actualizarDescuento();
}
let pedidoMontoManual = false;
function montoEditadoManual(){
    pedidoMontoManual = true;
    const inp=document.getElementById('pdMontoInput'); if(!inp) return;
    const dig=inp.value.replace(/[^\d]/g,'');
    inp.value = dig ? montoTxt(dig) : '';
    actualizarDescuento();
}
// Muestra el descuento total ($ y %) y cuánto menos por producto (proporcional).
function actualizarDescuento(){
    const cont=document.getElementById('pdDescuento'); if(!cont) return;
    const subtotal = pedidoItems.reduce((s,it)=>s+precioDe(it.nombre)*it.cantidad,0);
    const inp=document.getElementById('pdMontoInput');
    const total = inp ? (parseInt(inp.value.replace(/[^\d]/g,''),10)||0) : 0;
    if(!subtotal || !total || total>=subtotal){ cont.innerHTML=''; return; }
    const desc = subtotal - total;
    const factor = desc/subtotal;
    const pct = (factor*100).toFixed(1).replace('.',',');
    const filas = pedidoItems.filter(it=>precioDe(it.nombre)).map(it=>{
        const line = precioDe(it.nombre)*it.cantidad;
        const d = Math.round(line*factor);
        return `<div class="pd-desc-fila"><span>${esc(it.nombre)}</span><b>−${fmtMoney(d)}</b></div>`;
    }).join('');
    cont.innerHTML = `
        <div class="pd-desc-top"><i class="fas fa-tag"></i> Descuento <b>−${fmtMoney(desc)}</b> <span>· ${pct}%</span></div>
        <div class="pd-desc-list">${filas}</div>`;
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
        pedidoMontoManual = !!(id && p.monto);   // al editar, respetar el total guardado (puede tener descuento)
        const conEnvio=(p.envio==='Sí'), envCobr=(p.enviocobrado==='Sí');
        document.getElementById('modalTitulo').textContent = id?'Editar pedido':'Nuevo pedido';
        document.getElementById('modalBody').innerHTML = `
            <form class="panel-form" onsubmit="guardarPedido(event,'${id||''}')">
                <label>Usuario</label>
                <div id="pdUsuarioSel">
                    ${clientesSelect(p.cliente)}
                    <button type="button" class="pd-nuevo-cli" onclick="pedNuevoCliente(true)"><i class="fas fa-user-plus"></i> Cliente nuevo</button>
                </div>
                <div id="pdUsuarioNuevo" style="display:none">
                    <input type="text" id="pdNuevoNombre" placeholder="Nombre del cliente nuevo" autocomplete="off">
                    <button type="button" class="pd-nuevo-cli" onclick="pedNuevoCliente(false)"><i class="fas fa-arrow-left"></i> Elegir uno existente</button>
                </div>
                <div class="panel-form-2">
                    <div><label>Teléfono</label><input type="tel" id="pdTel" value="${esc(p.telefono)}" readonly placeholder="Se completa solo"></div>
                    <div><label>Fecha de la venta</label><input type="date" id="pdFecha" value="${id&&p.fecha?String(p.fecha).slice(0,10):hoyISO()}"></div>
                </div>
                <label>Productos</label>
                <div class="pd-items" id="pdItems"></div>
                <button type="button" class="pd-add-prod" onclick="abrirPicker()"><i class="fas fa-plus"></i> Agregar productos</button>
                <div class="pd-monto-row"><span>Subtotal productos</span><b id="pdMontoTxt">$0</b></div>
                <label class="pd-total">Total a cobrar <small>(editá si hacés un descuento)</small>
                    <input type="text" id="pdMontoInput" inputmode="numeric" placeholder="$0" oninput="montoEditadoManual()" value="${id&&p.monto?montoTxt(p.monto):''}">
                </label>
                <div id="pdDescuento" class="pd-desc"></div>
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
                <select id="pdEstado">${PEDIDO_ESTADOS.map(e=>`<option ${e===estPed(p.estado)?'selected':''}>${e}</option>`).join('')}</select>
                <label>Notas</label>
                <textarea id="pdNotas" rows="2">${esc(p.notas)}</textarea>
                <button type="submit" class="panel-form-submit" id="btnGuardarPed">Guardar</button>
            </form>`;
        renderPedidoItems();
        abrirModal();
    });
}
// Alterna entre elegir un usuario existente y cargar uno nuevo, dentro del form de pedido.
function pedNuevoCliente(nuevo){
    const sel = document.getElementById('pdUsuarioSel');
    const nue = document.getElementById('pdUsuarioNuevo');
    const tel = document.getElementById('pdTel');
    if(!sel || !nue || !tel) return;
    if(nuevo){
        sel.style.display = 'none'; nue.style.display = '';
        const s = document.getElementById('pdCliente'); if(s) s.value = '';
        tel.readOnly = false; tel.value = ''; tel.placeholder = 'Teléfono del cliente nuevo';
        const n = document.getElementById('pdNuevoNombre'); if(n) setTimeout(()=>n.focus(),50);
    } else {
        nue.style.display = 'none'; sel.style.display = '';
        const n = document.getElementById('pdNuevoNombre'); if(n) n.value = '';
        tel.readOnly = true; tel.placeholder = 'Se completa solo';
        autoTel('pd');
    }
}
// ¿Está activo el modo "cliente nuevo"?
function pedEnModoNuevo(){
    const nue = document.getElementById('pdUsuarioNuevo');
    return nue && nue.style.display !== 'none';
}
async function guardarPedido(e,id){
    e.preventDefault();
    const btn=document.getElementById('btnGuardarPed'); btn.disabled=true; btn.textContent='Guardando…';
    // Si se está cargando un cliente NUEVO, primero lo creamos en Clientes y usamos ese nombre.
    let clienteNombre = val('pdCliente'), clienteTel = val('pdTel'), clienteId = '';
    if(pedEnModoNuevo()){
        const nombreNuevo = val('pdNuevoNombre');
        if(!nombreNuevo){ btn.disabled=false; btn.textContent='Guardar'; alert('Escribí el nombre del cliente nuevo.'); return; }
        clienteNombre = nombreNuevo;
        clienteTel = limpiarTel(clienteTel);
        try {
            const rc = await crm({ action:'add', tab:'Clientes', nombre:clienteNombre, telefono:clienteTel, origen:'pedido' });
            clienteId = (rc&&rc.id) || '';
            // Sumarlo a la lista local para que aparezca al instante en Usuarios.
            clientes.unshift({ id: clienteId||('tmp'+Date.now()), fecha:'', nombre:clienteNombre, telefono:clienteTel, origen:'pedido' });
            cacheSet('clientes', clientes);
        } catch(err){ /* si falla el alta del cliente, igual guardamos el pedido con el nombre escrito */ }
    } else {
        // Cliente existente elegido en el select: guardamos su ID permanente.
        const cliObj = clientes.find(x => norm(x.nombre) === norm(clienteNombre));
        if (cliObj) clienteId = cliObj.id;
    }
    const detalle = pedidoItems.map(it=>it.cantidad+'x '+it.nombre).join(', ');
    const subtotal = pedidoItems.reduce((s,it)=>s+precioDe(it.nombre)*it.cantidad,0);
    const montoInput = document.getElementById('pdMontoInput');
    const montoManual = montoInput ? (parseInt(montoInput.value.replace(/[^\d]/g,''),10)||0) : 0;
    const monto = montoManual || subtotal;   // usar el total editado si lo pusieron; si no, el subtotal
    const envio = document.getElementById('pdEnvio').checked?'Sí':'No';
    const envCobr = (envio==='Sí' && document.getElementById('pdEnvioCobr').checked)?'Sí':'No';
    const envMonto = envCobr==='Sí' ? String(val('pdEnvioMonto').replace(/[^\d]/g,'')) : '';
    const datos={ cliente:clienteNombre, fecha:val('pdFecha'), telefono:clienteTel, detalle, monto:String(monto), estado:val('pdEstado'), notas:val('pdNotas'), envio, enviocobrado:envCobr, enviomonto:envMonto };
    // ID permanente del cliente: ata el pedido al cliente aunque después cambie nombre/teléfono.
    if (clienteId) datos.clienteid = clienteId;
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
        <div class="panel-lista" id="listaSeg">${seguimientos.length ? '' : '<div class="panel-cargando"><i class="fas fa-spinner fa-spin"></i> Cargando…</div>'}</div>`;
    const ordenar = () => seguimientos.sort((a,b)=>(a.objetivo||'9999').localeCompare(b.objetivo||'9999'));
    if (seguimientos.length) { ordenar(); pintarSeguimientos(seguimientos); }   // instantáneo
    try {
        const r = await crm({ action:'list', tab:'Seguimientos' });
        if (r&&r.ok&&r.rows){ seguimientos = r.rows; cacheSet('seguimientos',seguimientos); _segCargados=true; }
        if (seccionActual!=='seguimientos') return;
        ordenar();
        pintarSeguimientos(seguimientos);
    } catch(e){ if(!seguimientos.length) document.getElementById('listaSeg').innerHTML = `<div class="panel-error">No se pudieron cargar los seguimientos.</div>`; }
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

// Cartel de confirmación propio (el confirm() nativo no funciona en modo app/pantalla completa).
function confirmar(mensaje, textoBtn){
    return new Promise(resolve => {
        let ov = document.getElementById('confirmOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'confirmOverlay';
            ov.className = 'confirm-overlay';
            ov.innerHTML = `<div class="confirm-box">
                <p id="confirmMsg"></p>
                <div class="confirm-acc">
                    <button id="confirmNo" class="confirm-no">Cancelar</button>
                    <button id="confirmSi" class="confirm-si">Eliminar</button>
                </div></div>`;
            document.body.appendChild(ov);
        }
        document.getElementById('confirmMsg').textContent = mensaje;
        document.getElementById('confirmSi').textContent = textoBtn || 'Eliminar';
        ov.classList.add('active');
        const cerrar = (val) => {
            ov.classList.remove('active');
            document.getElementById('confirmSi').onclick = null;
            document.getElementById('confirmNo').onclick = null;
            ov.onclick = null;
            resolve(val);
        };
        document.getElementById('confirmSi').onclick = () => cerrar(true);
        document.getElementById('confirmNo').onclick = () => cerrar(false);
        ov.onclick = (e) => { if (e.target === ov) cerrar(false); };
    });
}

// ─── ARRANQUE ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    hidratarCache();   // datos guardados = apertura instantánea
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

// ─── TIRAR PARA RECARGAR (pull-to-refresh) ──────────────────────
(function pullToRefresh(){
    const TH = 75;               // cuánto hay que tirar para que recargue
    let startY = 0, dist = 0, tirando = false, ind = null;
    function scrollTop(){ return window.scrollY || document.documentElement.scrollTop || 0; }
    function hayOverlay(){
        if (document.body.classList.contains('bloqueado')) return true;
        return ['modalForm','pickerModal','confirmOverlay','modalOverlay','pickerOverlay']
            .some(id => { const e = document.getElementById(id); return e && e.classList.contains('active'); });
    }
    function crearInd(){
        if (ind) return ind;
        ind = document.createElement('div');
        ind.className = 'ptr';
        ind.innerHTML = '<i class="fas fa-arrow-down"></i>';
        document.body.appendChild(ind);
        return ind;
    }
    function ocultar(){
        if (!ind) return;
        ind.style.transition = 'transform .25s ease, opacity .2s';
        ind.style.transform = 'translateX(-50%) translateY(0)';
        ind.style.opacity = '0';
        ind.classList.remove('ptr-ready');
    }
    window.addEventListener('touchstart', e => {
        if (hayOverlay() || scrollTop() > 0 || e.touches.length !== 1) { tirando = false; return; }
        startY = e.touches[0].clientY; dist = 0; tirando = true;
    }, { passive: true });
    window.addEventListener('touchmove', e => {
        if (!tirando) return;
        dist = e.touches[0].clientY - startY;
        if (dist <= 0 || scrollTop() > 0) { tirando = false; ocultar(); return; }
        e.preventDefault();
        const pull = Math.min(dist * 0.5, 110);
        const i = crearInd();
        i.style.transition = 'none';
        i.style.transform = `translateX(-50%) translateY(${pull}px)`;
        i.style.opacity = Math.min(pull / TH, 1);
        const listo = pull >= TH;
        i.classList.toggle('ptr-ready', listo);
        i.querySelector('i').style.transform = `rotate(${listo ? 180 : 0}deg)`;
    }, { passive: false });
    window.addEventListener('touchend', () => {
        if (!tirando) return;
        tirando = false;
        const pull = Math.min(dist * 0.5, 110);
        if (pull >= TH) {
            const i = crearInd();
            i.querySelector('i').className = 'fas fa-spinner fa-spin';
            i.style.transition = 'transform .2s ease';
            i.style.transform = 'translateX(-50%) translateY(70px)';
            i.style.opacity = '1';
            setTimeout(() => location.reload(), 300);
        } else {
            ocultar();
        }
    });
})();
