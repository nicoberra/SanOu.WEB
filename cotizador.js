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
        // Vale la sesión del cotizador O la del panel (mismo dominio, misma clave):
        // así, si ya entraste al panel, el cotizador se abre sin pedir clave de nuevo.
        const c = parseInt(localStorage.getItem('sanou_cotiz_ok')  || '0', 10);
        const p = parseInt(localStorage.getItem('sanou_panel_ok') || '0', 10);
        return c > Date.now() || p > Date.now();
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
// Alícuota general (algunos productos se facturan al 21%, ej. Mordazas de Torno)
const IVA_GENERAL = 0.21;
const VALIDEZ_DIAS = 7;
// Devuelve la alícuota de IVA de un ítem según el producto (mordazas de torno = 21%).
function ivaDeItem(it) {
    const p = products.find(x => x.id === it.id);
    const nombre = p ? p.name : '';
    return /mordaza/i.test(nombre) ? IVA_GENERAL : IVA;
}

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
            const netoUnit = netoDesdeFinal(it.precioFinal, ivaDeItem(it));
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
        const q = new URLSearchParams(Object.assign({}, params, { callback: cb })).toString();
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
        const cliente = (document.getElementById('cliNombre').value || '').trim();
        if (!cliente || !items.length) return; // sin cliente/ítems no guardamos
        const detalle = items.map(it => {
            const p = products.find(x => x.id === it.id);
            return it.cantidad + 'x ' + (p ? p.name : 'producto');
        }).join(', ');
        const total = calcularTotales().total;
        const tel = (document.getElementById('cliContacto').value || '').replace(/[^\d]/g, '');
        const p = {
            action: 'add', tab: 'Cotizaciones',
            cliente: cliente, telefono: tel, detalle: detalle,
            monto: String(Math.round(total)), estado: 'Abierta'
        };
        if (_cotClienteId) p.clienteid = _cotClienteId;   // atar al cliente elegido (ID permanente)
        fetch(CRM_COTIZ_URL + '?' + new URLSearchParams(p).toString(), { mode: 'no-cors' });
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
    try {
        await html2pdf().set({
            margin: [8, 8, 8, 8],
            filename: nombreArch,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: hoja.scrollWidth },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(hoja).save();
    } catch (e) {
        // Si algo falla con la librería, caemos al diálogo de impresión.
        window.print();
    } finally {
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
    renderSelector();
    renderItems();
    const aviso = document.getElementById('avisoPrecios');
    if (aviso) aviso.textContent = 'Precios actualizados desde el Sheet.';
    cargarClientesCotizador();   // llena el selector de clientes ya ingresados
});
