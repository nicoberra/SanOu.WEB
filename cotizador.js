// ─────────────────────────────────────────────────────────────────
// COTIZADOR SAN OU — genera cotizaciones formales en PDF
// Usa los productos y precios en vivo del Google Sheet.
// ─────────────────────────────────────────────────────────────────

// ─── CLAVE DE ACCESO ─────────────────────────────────────────────
// Acá va la HUELLA (hash) de la clave, nunca la clave.
//
// Se usa PBKDF2 con 250.000 vueltas: para vos entrar es instantáneo,
// pero para alguien que quiera adivinar la clave probando millones por
// segundo, cada intento le cuesta 250.000 veces más. Eso convierte un
// ataque de segundos en uno de años.
//
// Para cambiarla: abrí generar-clave.html, escribí tu clave nueva
// y pegá acá la huella que te da.
//
// OJO: esto protege la CLAVE, no el contenido. Alguien técnico puede
// leer esta página desde el código fuente sin pasar por el candado.
const CLAVE_HASH = 'cee92583f674a5ef9fa78953f4d1483eb1aa1f9eeba27612ec72abb0063fd52a';

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
        const v = parseInt(localStorage.getItem('sanou_cotiz_ok') || '0', 10);
        return v > Date.now();
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
    if (CLAVE_HASH === 'PEGAR_AQUI_LA_HUELLA') {
        err.textContent = 'Falta configurar la clave: abrí generar-clave.html y pegá la huella en cotizador.js.';
        err.classList.add('on');
        return;
    }
    _verificando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
    try {
        if (await huella(val) === CLAVE_HASH) {
            desbloquear();
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
const VALIDEZ_DIAS = 7;

let items = [];            // { id, cantidad, precioFinal }

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
// se desglosa hacia atrás: neto = final / 1,105. Así el TOTAL coincide
// exactamente con el precio publicado en la web.
function netoDesdeFinal(final) { return final / (1 + IVA); }

function calcularTotales() {
    let subtotalNeto = 0;
    items.forEach(it => { subtotalNeto += netoDesdeFinal(it.precioFinal) * it.cantidad; });
    const ivaMonto = subtotalNeto * IVA;
    return {
        subtotalNeto,
        ivaMonto,
        total: subtotalNeto + ivaMonto
    };
}

// ─── ÍTEMS ───────────────────────────────────────────────────────
function agregarItem(id) {
    id = parseInt(id, 10);
    if (!id) return;
    if (items.some(i => i.id === id)) { alert('Ese producto ya está en la cotización.'); return; }
    const p = products.find(x => x.id === id);
    if (!p) return;
    items.push({ id, cantidad: 1, precioFinal: p.price > 0 ? p.price : 0 });
    renderItems();
}

function quitarItem(id) {
    items = items.filter(i => i.id !== id);
    renderItems();
}

function cambiarCantidad(id, val) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    it.cantidad = Math.max(1, parseInt(val, 10) || 1);
    renderItems();
}

function cambiarPrecio(id, val) {
    const it = items.find(i => i.id === id);
    if (!it) return;
    it.precioFinal = Math.max(0, parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
    renderItems();
}

// ─── RENDER: selector de productos agrupado por categoría ────────
function renderSelector() {
    const sel = document.getElementById('selectorProducto');
    if (!sel) return;
    let html = '<option value="">+ Agregar producto…</option>';
    Object.keys(CAT_NAMES).forEach(cat => {
        const lista = products.filter(p => p.category === cat);
        if (!lista.length) return;
        html += `<optgroup label="${CAT_NAMES[cat]}">`;
        lista.forEach(p => {
            const precio = p.price > 0 ? ' — ' + money(p.price) : ' — (sin precio)';
            html += `<option value="${p.id}">${p.name}${precio}</option>`;
        });
        html += '</optgroup>';
    });
    sel.innerHTML = html;
}

// ─── RENDER: tabla de ítems ──────────────────────────────────────
function renderItems() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="cot-vacio">Agregá productos para armar la cotización.</td></tr>`;
    } else {
        tbody.innerHTML = items.map((it, i) => {
            const p = products.find(x => x.id === it.id);
            const netoUnit = netoDesdeFinal(it.precioFinal);
            const subtotal = netoUnit * it.cantidad;
            return `<tr>
                <td class="col-n">${i + 1}</td>
                <td class="col-desc">
                    <strong>${p.name}</strong>
                    <span class="cot-item-desc">${(p.specs || []).map(s => s.l + ': ' + s.v).join(' · ')}</span>
                </td>
                <td class="col-cant" data-label="Cantidad"><input type="number" min="1" inputmode="numeric" value="${it.cantidad}" onchange="cambiarCantidad(${it.id}, this.value)"></td>
                <td class="col-precio no-print" data-label="Precio final c/IVA"><input type="text" inputmode="decimal" value="${it.precioFinal.toFixed(2)}" onchange="cambiarPrecio(${it.id}, this.value)" title="Precio final con IVA"></td>
                <td class="col-unit" data-label="P. unitario neto">${money(netoUnit)}</td>
                <td class="col-sub" data-label="Subtotal">${money(subtotal)}
                    <button class="cot-quitar no-print" onclick="quitarItem(${it.id})" title="Quitar">&times;</button>
                </td>
            </tr>`;
        }).join('');
    }

    const t = calcularTotales();
    document.getElementById('totSubtotal').textContent = money(t.subtotalNeto);
    document.getElementById('totIva').textContent      = money(t.ivaMonto);
    document.getElementById('totFinal').textContent    = money(t.total);
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
function imprimirCotizacion() {
    if (!items.length) { alert('Agregá al menos un producto antes de generar la cotización.'); return; }
    const cliente = document.getElementById('cliNombre');
    if (cliente && !cliente.value.trim()) {
        if (!confirm('No cargaste el nombre del cliente. ¿Generar igual?')) return;
    }
    // Pasar los valores de los inputs al PDF (los input no se imprimen bien)
    document.querySelectorAll('[data-print-from]').forEach(span => {
        const src = document.getElementById(span.dataset.printFrom);
        if (!src) return;
        let v = src.value || '';
        if (src.type === 'date' && v) v = fmtFecha(v);
        span.textContent = v || '—';
    });

    window.print();
}

// ─── INICIO ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initBloqueo();
    pintarDatosEmpresa();
    pintarFechas();
    renderItems();
    // Traer precios actualizados del Google Sheet
    try { await loadPricesFromSheet(); } catch (e) { console.warn('No se pudieron traer precios del Sheet', e); }
    renderSelector();
    renderItems();
    const aviso = document.getElementById('avisoPrecios');
    if (aviso) aviso.textContent = 'Precios actualizados desde el Sheet.';
});
