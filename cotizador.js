// ─────────────────────────────────────────────────────────────────
// COTIZADOR SAN OU — genera cotizaciones formales en PDF
// Usa los productos y precios en vivo del Google Sheet.
// ─────────────────────────────────────────────────────────────────

// ─── CLAVE DE ACCESO ─────────────────────────────────────────────
// El hash de la clave NO vive en el frontend: se verifica en el backend (Apps Script) contra la
// propiedad de script PANEL_PASS_HASH. Acá calculamos el hash de lo que se escribe y se lo
// mandamos al servidor para que confirme si es correcto.
// Para cambiar la clave: abrí generar-clave.html, generá la huella y pegala en la propiedad
// PANEL_PASS_HASH del Apps Script (Configuración del proyecto → Propiedades de script).
const COTIZ_URL = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';
// Llamada JSONP al backend (evita CORS).
function cotizApi(params) {
    return new Promise((resolve, reject) => {
        const cb = 'cotizcb_' + Date.now() + Math.floor(Math.random() * 1e6);
        const qs = new URLSearchParams({ ...params, callback: cb, _: Date.now() });
        const s = document.createElement('script');
        const limpiar = () => { delete window[cb]; s.remove(); };
        const to = setTimeout(() => { limpiar(); reject(new Error('timeout')); }, 20000);
        window[cb] = (data) => { clearTimeout(to); limpiar(); resolve(data); };
        s.onerror = () => { clearTimeout(to); limpiar(); reject(new Error('red')); };
        s.src = COTIZ_URL + '?' + qs.toString();
        document.body.appendChild(s);
    });
}

const PBKDF2_VUELTAS = 250000;
const PBKDF2_SAL = 'sanou::cotizador::v2';
const DIAS_RECORDAR = 30;

async function huella(txt) {
    const enc = new TextEncoder();
    const clave = await crypto.subtle.importKey('raw', enc.encode(txt), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: enc.encode(PBKDF2_SAL),
        iterations: PBKDF2_VUELTAS,
        hash: 'SHA-256'
    }, clave, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function accesoVigente() {
    try {
        // Vale la sesión del cotizador O la del panel (mismo dominio, misma clave):
        // así, si ya entraste al panel, el cotizador se abre sin pedir clave de nuevo.
        const c = parseInt(localStorage.getItem('sanou_cotiz_ok')  || '0', 10);
        const p = parseInt(localStorage.getItem('sanou_panel_ok') || '0', 10);
        // Además de la sesión, requiere tener guardada la clave (hash) para autorizar el backend.
        return (c > Date.now() || p > Date.now()) && !!localStorage.getItem('sanou_auth');
    } catch (e) { return false; }
}

function desbloquear() {
    try { localStorage.setItem('sanou_cotiz_ok', String(Date.now() + DIAS_RECORDAR * 864e5)); } catch (e) {}
    document.body.classList.remove('bloqueado');
}

function cerrarSesionCotizador() {
    try { localStorage.removeItem('sanou_cotiz_ok'); } catch (e) {}
    location.reload();
}

let _verificando = false;

async function probarClave() {
    if (_verificando) return;
    const input = document.getElementById('claveInput');
    const err   = document.getElementById('claveError');
    const btn   = document.getElementById('claveBtn');
    const val   = input.value;
    if (!val.trim()) return;
    _verificando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
    try {
        const h = await huella(val);
        let r = null;
        try { r = await cotizApi({ action: 'panel_login', h: h }); } catch (e) {}
        if (r && r.ok) {
            try { localStorage.setItem('sanou_auth', h); } catch (e) {}
            desbloquear();
        } else if (r && r.error) {
            err.textContent = r.error; err.classList.add('on');
        } else if (!r) {
            err.textContent = 'No se pudo verificar la clave (revisá la conexión).'; err.classList.add('on');
        } else {
            err.textContent = 'Clave incorrecta.';
            err.classList.add('on');
            input.value = '';
            input.focus();
        }
    } finally {
        _verificando = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
}

function initBloqueo() {
    if (accesoVigente()) { document.body.classList.remove('bloqueado'); return; }
    const input = document.getElementById('claveInput');
    if (input) {
        input.addEventListener('keydown', e => {
            document.getElementById('claveError').classList.remove('on');
            if (e.key === 'Enter') probarClave();
        });
        setTimeout(() => input.focus(), 100);
    }
}

const EMPRESA = {
    razonSocial: 'BR TRADE SRL',
    marca:       'San Ou',
    cuit:        '30-71077182-7',
    iibb:        '902-631235-0',
    inicioAct:   '30/05/2008',
    condIva:     'IVA Responsable Inscripto',
    domicilio:   'Marcelo Gamboa 6306 — Versalles, CABA',
    telefono:    '+54 9 11 3175-1517',
    email:       'ventas@sanou.com.ar',
    web:         'sanou.com.ar'
};

// Alícuota reducida (bienes de capital)
const IVA = 0.105;
// Alícuota general (algunos productos se facturan al 21%, ej. Mordazas de Torno)
const IVA_GENERAL = 0.21;
const VALIDEZ_DIAS = 7;
// Devuelve la alícuota de IVA de un ítem según el producto (mordazas de torno = 21%).
function ivaDeItem(it) {
    return /mordaza/i.test(it.nombre || '') ? IVA_GENERAL : IVA;
}

// Cada línea: { uid, id?, nombre, desc, cantidad, precioFinal } y, en el presupuesto mayorista,
// además { tipo: 'mayorista'|'unitario', minimo, pMay, pUni, clave }. Un mismo producto puede
// tener una línea a precio mayorista y otra a precio unitario (ej. 7 mayorista + 5 unitario).
let items = [];
let modo = 'comun';        // 'comun' = cotización con precios de la tienda | 'mayorista' = presupuesto mayorista
let _uid = 0;
let _may = [];             // lista mayorista (pestaña Mayorista de la planilla)

// ── Fechas ──
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function fmtFecha(iso) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
}
function fechaVencimiento(dias) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    return f.toISOString().slice(0, 10);
}

// ── Moneda ──
function money(n) {
    return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── CÁLCULO ─────────────────────────────────────────────────────
// Los precios del Sheet son FINALES (IVA incluido). Para la cotización
// se desglosa hacia atrás: neto = final / (1 + iva). El IVA depende del
// producto (10,5% general, 21% para mordazas de torno). El TOTAL siempre
// coincide con el precio publicado.
function netoDesdeFinal(final, iva) { return final / (1 + (iva != null ? iva : IVA)); }

let envio = 0; // costo de envío (monto final que paga el cliente)

function cambiarEnvio(val) {
    envio = Math.max(0, parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
    renderItems();
}

function calcularTotales() {
    let subtotalNeto = 0, ivaMonto = 0;
    items.forEach(it => {
        const iva = ivaDeItem(it);
        const neto = netoDesdeFinal(it.precioFinal, iva);
        subtotalNeto += neto * it.cantidad;
        ivaMonto     += (it.precioFinal - neto) * it.cantidad;
    });
    // El envío se suma como monto final (aparte), no se le desglosa IVA:
    // es un presupuesto comercial, no un comprobante fiscal.
    return {
        subtotalNeto,
        ivaMonto,
        envio,
        total: subtotalNeto + ivaMonto + envio
    };
}
// Etiqueta del IVA según las alícuotas presentes en la cotización.
function etiquetaIva() {
    const tasas = Array.from(new Set(items.map(ivaDeItem)));
    if (tasas.length === 1) return 'IVA ' + String(tasas[0] * 100).replace('.', ',') + '%';
    if (tasas.length > 1)  return 'IVA (10,5% y 21%)';
    return 'IVA 10,5%';
}

// ─── ÍTEMS ───────────────────────────────────────────────────────
function agregarItem(valor) {
    if (!valor) return;
    if (modo === 'mayorista') return agregarItemMayorista(valor);
    const id = parseInt(valor, 10);
    if (!id) return;
    if (items.some(i => i.id === id)) { alert('Ese producto ya está en la cotización.'); return; }
    const p = products.find(x => x.id === id);
    if (!p) return;
    // Aviso de stock: en el CRM se puede cotizar un producto sin stock (ej. "a pedido"),
    // pero que quede claro antes de agregarlo.
    if (p.inStock === false && !confirm('⚠️ "' + p.name + '" está SIN STOCK: se entrega a reserva en 20 días.\n¿Agregarlo a la cotización?')) return;
    items.push({ uid: ++_uid, id, nombre: p.name, desc: (p.specs || []).map(s => s.l + ': ' + s.v).join(' · '),
                 cantidad: 1, precioFinal: p.price > 0 ? p.price : 0, sinStock: p.inStock === false });
    renderItems();
}

function quitarItem(uid) {
    items = items.filter(i => i.uid !== uid);
    renderItems();
}

function cambiarCantidad(uid, val) {
    const it = items.find(i => i.uid === uid);
    if (!it) return;
    it.cantidad = Math.max(1, parseInt(val, 10) || 1);
    renderItems();
}

function cambiarPrecio(uid, val) {
    const it = items.find(i => i.uid === uid);
    if (!it) return;
    it.precioFinal = Math.max(0, parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
    renderItems();
}

// ─── PRESUPUESTO MAYORISTA ───────────────────────────────────────
const numMay = v => { const m = String(v || '').replace(/[.\s$]/g, '').match(/\d+/); return m ? parseInt(m[0], 10) : 0; };
const sinStockMay = n => /\bsin\s*st/i.test(String(n || ''));
async function cargarMayorista() {
    if (_may.length) return _may;
    const r = await crmJSONP({ action: 'mayorista_list', tab: 'Clientes' });
    if (!r || !r.ok || !Array.isArray(r.rows)) throw new Error('lista');
    _may = r.rows;
    return _may;
}
function cambiarModo(m) {
    if (m === modo) return;
    if (items.length && !confirm('Se va a vaciar la lista de productos para armar el ' + (m === 'mayorista' ? 'presupuesto mayorista' : 'presupuesto común') + '. ¿Seguimos?')) {
        document.querySelectorAll('input[name="modoCot"]').forEach(r => { r.checked = r.value === modo; });
        return;
    }
    modo = m; items = [];
    document.body.classList.toggle('modo-may', modo === 'mayorista');
    const tit = document.querySelector('.cot-titulo'); if (tit) tit.textContent = modo === 'mayorista' ? 'PRESUPUESTO MAYORISTA' : 'COTIZACIÓN';
    const btn = document.querySelector('.cot-btn-pdf'); if (btn) btn.textContent = modo === 'mayorista' ? 'Descargar presupuesto mayorista en PDF' : 'Descargar cotización en PDF';
    renderSelector(); renderItems();
}
function agregarItemMayorista(row) {
    const r = _may.find(x => String(x.row) === String(row)); if (!r) return;
    const minimo = numMay(r.minimo), pMay = numMay(r.mayorista), pUni = numMay(r.unitario) || pMay;
    if (sinStockMay(r.nota) && !confirm('⚠️ "' + r.producto + '" figura SIN STOCK en la lista mayorista.\n¿Agregarlo igual?')) return;
    const clave = String(r.row);
    const conMay = pMay > 0 && minimo > 0;
    if (items.some(i => i.clave === clave && i.tipo === (conMay ? 'mayorista' : 'unitario'))) { alert('Ese producto ya está. Cambiá la cantidad o sumá unidades a precio unitario.'); return; }
    items.push({ uid: ++_uid, clave, nombre: r.producto, desc: (r.nota && !sinStockMay(r.nota)) ? r.nota : '',
                 tipo: conMay ? 'mayorista' : 'unitario', minimo, pMay, pUni,
                 cantidad: conMay ? minimo : 1, precioFinal: conMay ? pMay : pUni, sinStock: sinStockMay(r.nota) });
    renderItems();
}
// Suma otra línea del mismo producto a precio unitario (para las unidades que no llegan al mínimo).
function sumarUnitario(uid) {
    const base = items.find(i => i.uid === uid); if (!base) return;
    if (items.some(i => i.clave === base.clave && i.tipo === 'unitario')) { alert('Ya hay una línea a precio unitario de este producto: cambiale la cantidad.'); return; }
    const pos = items.indexOf(base);
    items.splice(pos + 1, 0, Object.assign({}, base, { uid: ++_uid, tipo: 'unitario', cantidad: 1, precioFinal: base.pUni }));
    renderItems();
}
function cambiarTipo(uid, tipo) {
    const it = items.find(i => i.uid === uid); if (!it) return;
    it.tipo = tipo; it.precioFinal = tipo === 'mayorista' ? it.pMay : it.pUni;
    renderItems();
}

// ─── RENDER: selector de productos agrupado por categoría ────────
function renderSelector() {
    const sel = document.getElementById('selectorProducto');
    if (!sel) return;
    if (modo === 'mayorista') {
        if (!_may.length) {
            sel.innerHTML = '<option value="">Cargando lista mayorista…</option>';
            cargarMayorista().then(renderSelector).catch(() => { sel.innerHTML = '<option value="">No se pudo cargar la lista mayorista (tocá para reintentar)</option>'; sel.onfocus = () => { sel.onfocus = null; renderSelector(); }; });
            return;
        }
        let html = '<option value="">+ Agregar producto mayorista…</option>', abierto = false;
        _may.forEach(r => {
            if (r.tipo === 'cat') { if (abierto) html += '</optgroup>'; html += `<optgroup label="${esc(r.producto)}">`; abierto = true; return; }
            const pMay = numMay(r.mayorista), pUni = numMay(r.unitario), min = numMay(r.minimo);
            const info = pMay > 0 && min > 0 ? ` — mín. ${min} · mayorista ${money(pMay)} · unitario ${pUni ? money(pUni) : '-'}` : ` — solo unitario ${money(pUni || pMay)}`;
            html += `<option value="${esc(r.row)}">${esc(r.producto)}${info}${sinStockMay(r.nota) ? ' ⛔ SIN STOCK' : ''}</option>`;
        });
        if (abierto) html += '</optgroup>';
        sel.innerHTML = html;
        return;
    }
    let html = '<option value="">+ Agregar producto…</option>';
    Object.keys(CAT_NAMES).forEach(cat => {
        const lista = products.filter(p => p.category === cat);
        if (!lista.length) return;
        html += `<optgroup label="${CAT_NAMES[cat]}">`;
        lista.forEach(p => {
            const precio = p.price > 0 ? ' — ' + money(p.price) : ' — (sin precio)';
            const sinStock = p.inStock === false ? ' ⏳ RESERVA 20 DÍAS' : '';
            html += `<option value="${p.id}">${p.name}${precio}${sinStock}</option>`;
        });
        html += '</optgroup>';
    });
    sel.innerHTML = html;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ─── RENDER: tabla de ítems ──────────────────────────────────────
// Al redibujar la tabla, el casillero que tenía el foco se borra y dispara su "change" en el medio:
// esa segunda llamada se deja para cuando termine la primera (antes tiraba error).
let _pintando = false, _pintarOtraVez = false;
function renderItems() {
    if (_pintando) { _pintarOtraVez = true; return; }
    _pintando = true;
    try { pintarItems(); } finally { _pintando = false; }
    if (_pintarOtraVez) { _pintarOtraVez = false; setTimeout(renderItems, 0); }
}
function pintarItems() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    const cols = modo === 'mayorista' ? 8 : 6;

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="${cols}" class="cot-vacio">${modo === 'mayorista' ? 'Agregá productos de la lista mayorista para armar el presupuesto.' : 'Agregá productos para armar la cotización.'}</td></tr>`;
    } else {
        tbody.innerHTML = items.map((it, i) => {
            const netoUnit = netoDesdeFinal(it.precioFinal, ivaDeItem(it));
            const subtotal = netoUnit * it.cantidad;
            const may = modo === 'mayorista';
            const bajoMin = may && it.tipo === 'mayorista' && it.cantidad < it.minimo;
            const tieneUni = may && items.some(x => x.clave === it.clave && x.tipo === 'unitario');
            return `<tr class="${may ? 'fila-' + it.tipo : ''}">
                <td class="col-n">${i + 1}</td>
                <td class="col-desc">
                    <strong>${esc(it.nombre)}</strong>${it.sinStock ? ' <span class="cot-stock-out no-print">RESERVA 20 DÍAS</span>' : ''}
                    ${it.desc ? `<span class="cot-item-desc">${esc(it.desc)}</span>` : ''}
                    ${bajoMin ? `<span class="cot-aviso-min no-print">⚠️ Menos del mínimo (${it.minimo}): pasá esas unidades a precio unitario.</span>` : ''}
                    ${may && it.tipo === 'mayorista' && it.pUni > 0 && !tieneUni ? `<button type="button" class="cot-sumar-uni no-print" onclick="sumarUnitario(${it.uid})">+ unidades a precio unitario</button>` : ''}
                </td>
                ${may ? `<td class="col-min" data-label="Mínimo mayorista">${it.tipo === 'mayorista' && it.minimo ? it.minimo + ' u.' : '—'}</td>` : ''}
                <td class="col-cant" data-label="Cantidad"><input type="number" min="1" inputmode="numeric" value="${it.cantidad}" onchange="cambiarCantidad(${it.uid}, this.value)"></td>
                ${may ? `<td class="col-tipo" data-label="Precio"><span class="solo-pdf tipo-${it.tipo}">${it.tipo === 'mayorista' ? 'Mayorista' : 'Unitario'}</span>
                    <select class="no-print" onchange="cambiarTipo(${it.uid}, this.value)">
                        ${it.pMay > 0 ? `<option value="mayorista" ${it.tipo === 'mayorista' ? 'selected' : ''}>Mayorista</option>` : ''}
                        <option value="unitario" ${it.tipo === 'unitario' ? 'selected' : ''}>Unitario</option>
                    </select></td>` : ''}
                <td class="col-precio" data-label="Precio final c/IVA"><span class="solo-pdf">${money(it.precioFinal)}</span><input class="no-print" type="text" inputmode="decimal" value="${it.precioFinal.toFixed(2)}" onchange="cambiarPrecio(${it.uid}, this.value)" title="Precio final con IVA"></td>
                <td class="col-unit" data-label="P. unitario neto">${money(netoUnit)}</td>
                <td class="col-sub" data-label="Subtotal">${money(subtotal)}
                    <button class="cot-quitar no-print" onclick="quitarItem(${it.uid})" title="Quitar">&times;</button>
                </td>
            </tr>`;
        }).join('');
    }

    const t = calcularTotales();
    document.getElementById('totSubtotal').textContent = money(t.subtotalNeto);
    document.getElementById('totIva').textContent      = money(t.ivaMonto);
    const ivaLbl = document.getElementById('totIvaLbl');
    if (ivaLbl) ivaLbl.textContent = etiquetaIva();
    document.getElementById('totFinal').textContent    = money(t.total);

    // Fila de envío: solo aparece si se cargó un costo
    const filaEnvio = document.getElementById('filaEnvio');
    if (filaEnvio) {
        filaEnvio.style.display = t.envio > 0 ? '' : 'none';
        document.getElementById('totEnvio').textContent = money(t.envio);
    }
}

// ─── ENCABEZADO / DATOS ──────────────────────────────────────────
function pintarDatosEmpresa() {
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set('emRazon', EMPRESA.razonSocial);
    set('emCuit', 'CUIT ' + EMPRESA.cuit);
    set('emIibb', 'IIBB ' + EMPRESA.iibb);
    set('emInicio', 'Inicio de actividades: ' + EMPRESA.inicioAct);
    set('emCondIva', EMPRESA.condIva);
    set('emDom', EMPRESA.domicilio);
    set('emTel', EMPRESA.telefono);
    set('emMail', EMPRESA.email);
    set('emWeb', EMPRESA.web);
}

function pintarFechas() {
    const fEmision = document.getElementById('fechaEmision');
    const fVence   = document.getElementById('fechaVence');
    if (fEmision) fEmision.value = hoyISO();
    if (fVence)   fVence.value   = fechaVencimiento(VALIDEZ_DIAS);
}

// ─── IMPRIMIR / PDF ──────────────────────────────────────────────
// Guarda la cotización en el CRM (pestaña Cotizaciones) para el historial del cliente.
const CRM_COTIZ_URL = 'https://script.google.com/macros/s/AKfycbxMW0TTu37oiDySEaGgF--ZLXoz3JNEWhoHvzGViQ4vVQMJGX5AeIi-9C4IcY1Uc1P2/exec';

// ─── CLIENTES YA INGRESADOS (para elegir en el cotizador) ────────
let _cotClientes = [], _cotClienteId = '';
// Lectura por JSONP (Apps Script no manda CORS para leer la respuesta).
function crmJSONP(params) {
    return new Promise((resolve, reject) => {
        const cb = 'cotcb_' + Date.now() + Math.floor(Math.random() * 1000);
        const s = document.createElement('script');
        let _auth = ''; try { _auth = localStorage.getItem('sanou_auth') || ''; } catch (e) {}
        const q = new URLSearchParams(Object.assign({}, params, { auth: _auth, callback: cb })).toString();
        window[cb] = (data) => { resolve(data); try { delete window[cb]; } catch (e) {} s.remove(); };
        s.onerror = () => { try { delete window[cb]; } catch (e) {} s.remove(); reject('red'); };
        s.src = CRM_COTIZ_URL + '?' + q;
        document.body.appendChild(s);
    });
}
async function cargarClientesCotizador() {
    try {
        const r = await crmJSONP({ action: 'list', tab: 'Clientes' });
        if (r && r.ok && r.rows) { _cotClientes = r.rows; llenarSelectClientes(); }
    } catch (e) { /* si no cargan, se puede cargar el cliente a mano igual */ }
}
function llenarSelectClientes() {
    const sel = document.getElementById('cotClienteExistente');
    if (!sel) return;
    const ord = _cotClientes.slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    sel.innerHTML = '<option value="">— Cargar un cliente ya ingresado… —</option>' +
        ord.map(c => `<option value="${c.id}">${(c.nombre || '(sin nombre)')}${c.razon ? ' — ' + c.razon : ''}</option>`).join('');
}
// Al elegir un cliente, completa los campos del cotizador y recuerda su ID.
function elegirClienteCotizador(id) {
    _cotClienteId = id || '';
    const c = _cotClientes.find(x => String(x.id) === String(id));
    if (!c) return;
    const set = (el, v) => { const e = document.getElementById(el); if (e) e.value = v || ''; };
    set('cliNombre', c.razon || c.nombre || '');
    set('cliCuit', c.cuit || '');
    set('cliContacto', [c.telefono, c.email].filter(Boolean).join(' / '));
    set('cliDom', c.direccion || '');
}
function guardarCotizacionEnCRM() {
    try {
        const val = id => { const e = document.getElementById(id); return (e && e.value || '').trim(); };
        const cliente = val('cliNombre');
        if (!cliente || !items.length) return; // sin cliente/ítems no guardamos
        const nombreLinea = it => it.nombre + (modo === 'mayorista' ? (it.tipo === 'mayorista' ? ' (precio mayorista)' : ' (precio unitario)') : '');
        const detalle = (modo === 'mayorista' ? 'MAYORISTA: ' : '') + items.map(it => it.cantidad + 'x ' + nombreLinea(it)).join(', ');
        const total = calcularTotales().total;
        const tel = val('cliContacto').replace(/[^\d]/g, '');

        // Datos COMPLETOS del presupuesto (misma forma que usa presupuesto.html) para poder
        // REABRIR el PDF igual desde el panel. Prefijo 'cot|' = generado desde el CRM.
        const fE = val('fechaEmision'), fV = val('fechaVence');
        const datos = {
            numero: 'C-' + String(Date.now()).slice(-6),
            fechaEmision: fE ? fmtFecha(fE) : '',
            fechaVence:   fV ? fmtFecha(fV) : '',
            cliente: {
                razon:    cliente,
                cuit:     val('cliCuit'),
                condIva:  val('cliCondIva'),
                contacto: val('cliContacto'),
                dom:      val('cliDom')
            },
            items: items.map(it => ({ nombre: nombreLinea(it), cantidad: it.cantidad, precioFinal: it.precioFinal })),
            tipo: modo,
            envio: envio || 0,
            obs: val('obs'),
            condPago: val('condPago'),
            condEntrega: val('condEntrega')
        };

        // cid: id idempotente (mismo contenido en la misma hora → misma fila, sin duplicar).
        let h = 5381; const base = tel + '|' + detalle + '|' + Math.round(total);
        for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0;
        const p = {
            action: 'add', tab: 'Cotizaciones',
            cid: 'c' + h.toString(36) + Math.floor(Date.now() / 3600000).toString(36),
            cliente: cliente, telefono: tel, detalle: detalle,
            monto: String(Math.round(total)), estado: 'Abierta',
            notas: 'cot|' + JSON.stringify(datos)   // datos completos para reabrir el PDF desde el panel
        };
        if (_cotClienteId) p.clienteid = _cotClienteId;   // atar al cliente elegido (ID permanente)
        const url = CRM_COTIZ_URL + '?' + new URLSearchParams(p).toString();
        // Si falla la red, se reintenta una vez a los 3 s (el cid evita duplicar).
        fetch(url, { mode: 'no-cors', keepalive: true })
            .catch(() => setTimeout(() => { fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => {}); }, 3000));
    } catch (e) { /* silencioso */ }
}

// Agrega/actualiza como cliente a la persona del presupuesto.
function guardarClienteDesdeCotizacion() {
    try {
        // Si se eligió un cliente ya existente, NO lo volvemos a crear (evita duplicar/renombrar).
        if (_cotClienteId) return;
        const nombre = (document.getElementById('cliNombre').value || '').trim();
        if (!nombre) return;
        const contacto = (document.getElementById('cliContacto').value || '').trim();
        const emailM = contacto.match(/[\w.+-]+@[\w.-]+\.\w+/);
        const params = new URLSearchParams({
            action: 'add', tab: 'Clientes',
            nombre: nombre,
            cuit: (document.getElementById('cliCuit').value || '').trim(),
            direccion: (document.getElementById('cliDom').value || '').trim(),
            telefono: contacto.replace(/[^\d]/g, ''),
            email: emailM ? emailM[0] : '',
            origen: 'cotización'
        });
        fetch(CRM_COTIZ_URL + '?' + params.toString(), { mode: 'no-cors' });
    } catch (e) { /* silencioso */ }
}

// Genera un PDF REAL y lo descarga (funciona en el celular, a diferencia de window.print()).
async function descargarPDF() {
    const hoja = document.getElementById('hoja');
    const cliente = (document.getElementById('cliNombre').value || '').trim();
    const nombreArch = 'Cotizacion-' + ((cliente || 'SanOu').replace(/[^\w\- ]/g, '').trim() || 'SanOu') + '-' + hoyISO() + '.pdf';
    const btn = document.querySelector('.cot-btn-pdf');
    const txtOrig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF…'; }
    document.body.classList.add('exportando');
    let marco = null;
    try {
        // Medir con el layout de export aplicado y pasarle a html2canvas el alto/ancho COMPLETOS,
        // si no capturaba solo el alto del viewport y cortaba el pie (sobre todo en el celular).
        // Se exporta una COPIA de la hoja, sola, arriba a la izquierda del documento y con ancho fijo.
        // Antes se capturaba la hoja en su lugar (a la derecha del panel) y html2canvas recortaba
        // la parte izquierda: faltaban los datos de la empresa, el cliente y los nombres de productos.
        const yAntes = window.scrollY;
        marco = document.createElement('div');
        marco.className = 'cot-export-marco';
        const copia = hoja.cloneNode(true);
        copia.removeAttribute('id');
        marco.appendChild(copia);
        document.body.appendChild(marco);
        window.scrollTo(0, 0);
        // Medir recién con las tipografías cargadas: si no, la hoja crecía después de medir y se perdía la última línea del pie.
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const W = copia.offsetWidth; let H = Math.ceil(Math.max(copia.scrollHeight, copia.getBoundingClientRect().height)) + 8;   // +8: que no se corte la última línea del pie
        // Si el contenido real (hasta el pie) entra en una hoja A4, no pasar del alto de la hoja:
        // unos píxeles de margen de más generaban una segunda página en blanco.
        const altoHoja = Math.floor(W * (297 - 16) / (210 - 16));
        const pieEl = copia.querySelector('.cot-pie');
        const finContenido = pieEl ? Math.ceil(pieEl.getBoundingClientRect().bottom - copia.getBoundingClientRect().top) + 4 : H;
        if (H > altoHoja && finContenido <= altoHoja) H = altoHoja;
        await html2pdf().set({
            margin: [8, 8, 8, 8],
            filename: nombreArch,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff',
                x: 0, y: 0, width: W, height: H, windowWidth: W, windowHeight: H, scrollX: 0, scrollY: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(copia).save();
        window.scrollTo(0, yAntes);
    } catch (e) {
        // Si algo falla con la librería, caemos al diálogo de impresión.
        window.print();
    } finally {
        if (marco) marco.remove();
        document.body.classList.remove('exportando');
        if (btn) { btn.disabled = false; btn.textContent = txtOrig; }
    }
}

function imprimirCotizacion() {
    if (!items.length) { alert('Agregá al menos un producto antes de generar la cotización.'); return; }
    const cliente = document.getElementById('cliNombre');
    if (cliente && !cliente.value.trim()) {
        if (!confirm('No cargaste el nombre del cliente. ¿Generar igual?')) return;
    }
    guardarCotizacionEnCRM();
    guardarClienteDesdeCotizacion();
    // Pasar los valores de los inputs al PDF (los input no se imprimen bien)
    document.querySelectorAll('[data-print-from]').forEach(span => {
        const src = document.getElementById(span.dataset.printFrom);
        if (!src) return;
        let v = src.value || '';
        if (src.type === 'date' && v) v = fmtFecha(v);
        span.textContent = v || '—';
    });

    // PDF real y descargable (celular incluido). Si no cargó la librería, imprime.
    if (typeof html2pdf !== 'undefined') descargarPDF();
    else window.print();
}

// ─── INICIO ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initBloqueo();
    pintarDatosEmpresa();
    pintarFechas();
    renderItems();
    // Traer precios actualizados del Google Sheet
    try { await loadPricesFromSheet(); } catch (e) { console.warn('No se pudieron traer precios del Sheet', e); }
    usarPrecioTransferencia();
    renderSelector();
    renderItems();
    avisoPrecios();
    cargarClientesCotizador();   // llena el selector de clientes ya ingresados
});
// Estado de los precios: actualizados, o error con Reintentar (antes decía "actualizados" aunque fallara).
function avisoPrecios() {
    const aviso = document.getElementById('avisoPrecios'); if (!aviso) return;
    const conPrecio = products.filter(p => p.price > 0).length;
    aviso.innerHTML = conPrecio
        ? 'Precios actualizados.'
        : '<span class="aviso-error">No se pudieron traer los precios.</span> <button type="button" class="aviso-reintentar" onclick="reintentarPrecios()">Reintentar</button>';
}
// El cotizador interno cotiza con el precio de la planilla (con transferencia), como siempre;
// la tienda muestra además el precio normal (+10%).
function usarPrecioTransferencia() { products.forEach(p => { if (p.precioTransfer > 0) p.price = p.precioTransfer; }); }
async function reintentarPrecios() {
    const aviso = document.getElementById('avisoPrecios');
    if (aviso) aviso.innerHTML = '<span class="aviso-skel" aria-label="Cargando precios"></span>';
    try { await loadPricesFromSheet(); } catch (e) {}
    usarPrecioTransferencia(); renderSelector(); renderItems(); avisoPrecios();
}
