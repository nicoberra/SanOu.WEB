// Panel de Meta Commerce AI. Solo habla con el servidor propio (/api); nunca con Meta ni con claves.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cur = 'ARS') => n > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n) : '—';
const date = d => d ? new Date(d).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const TOKEN_KEY = 'mc_token';
let token = (() => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();
let org = null;

const AVAIL = { in_stock: ['En stock', 'ok'], low_stock: ['Pocas unidades', 'warn'], out_of_stock: ['Agotado', 'danger'], unknown: ['Sin dato', ''] };
const availPill = a => { const [t, c] = AVAIL[a] || AVAIL.unknown; return `<span class="pill ${c}">${t}</span>`; };
const STATUS_CLASS = { borrador: '', pendiente_aprobacion: 'info', listo_para_publicar: 'info', publicado: 'ok', pendiente_actualizacion: 'warn', pendiente_desactivacion: 'danger', desactivado: '', error: 'danger' };
const TASK_CLASS = { pendiente: 'info', en_progreso: 'info', esperando_aprobacion: 'warn', completada: 'ok', fallida: 'danger', cancelada: '', no_disponible: '' };
const SEV = { info: 'info', warning: 'warn', critical: 'danger' };
const TRANSITIONS = {
  borrador: ['pendiente_aprobacion'], pendiente_aprobacion: ['listo_para_publicar', 'borrador'],
  listo_para_publicar: ['publicado', 'borrador'], publicado: ['pendiente_actualizacion', 'pendiente_desactivacion'],
  pendiente_actualizacion: ['publicado', 'pendiente_desactivacion'], pendiente_desactivacion: ['desactivado', 'publicado'],
  desactivado: ['pendiente_aprobacion'], error: ['borrador'],
};

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(data.message); throw new Error(data.message || 'Sesión vencida'); }
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}
const orgApi = (p, o) => api(`/api/orgs/${org.slug}${p}`, o);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
function openDrawer(html) { $('#drawerBody').innerHTML = html; $('#drawer').hidden = false; }
function closeDrawer() { $('#drawer').hidden = true; }
const loading = () => { $('#view').innerHTML = '<div class="empty">Cargando…</div>'; };
const failView = e => { $('#view').innerHTML = `<div class="notice warn">${esc(e.message)} <button class="btn small" data-act="retry">Reintentar</button></div>`; };

// ── Sesión ────────────────────────────────────────────────────────────────
function showLogin(msg = '') { $('#app').hidden = true; $('#login').hidden = false; $('#loginError').textContent = msg || ''; }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); token = $('#token').value.trim();
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
  await start();
});
$('#logout').addEventListener('click', () => { token = ''; try { sessionStorage.removeItem(TOKEN_KEY); } catch {} showLogin(); });

async function start() {
  if (!token) return showLogin();
  try {
    const me = await api('/api/me');
    if (!me.organizations.length) return showLogin('Tu usuario no pertenece a ninguna empresa');
    org = me.organizations[0];
    $('#orgName').textContent = `${org.name} · ${org.role}`;
    const h = await api('/api/health');
    $('#writeBadge').className = 'pill ' + (h.metaWrites ? 'danger' : 'ok');
    $('#writeBadge').textContent = h.metaWrites ? 'Escrituras a Meta HABILITADAS' : 'Modo seguro: sin acciones externas';
    $('#login').hidden = true; $('#app').hidden = false;
    route();
  } catch (e) { if (!$('#login').hidden) $('#loginError').textContent = e.message; }
}

// ── Router ────────────────────────────────────────────────────────────────
const VIEWS = { dashboard: ['Dashboard', viewDashboard], catalogo: ['Catálogo', viewCatalog], marketplace: ['Marketplace', viewMarketplace],
  publicidad: ['Publicidad', viewAds], mensajes: ['Mensajes', viewMessages], agentes: ['Agentes', viewAgents], configuracion: ['Configuración', viewSettings] };
function route() {
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'dashboard';
  const [title, fn] = VIEWS[name] || VIEWS.dashboard;
  $('#title').textContent = title;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === name));
  $('#sidebar').classList.remove('open');
  closeDrawer();
  loading(); fn().catch(failView);
}
window.addEventListener('hashchange', route);
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
$('#syncBtn').addEventListener('click', async () => {
  try { const r = await orgApi('/sync', { method: 'POST' }); toast(r.duplicate ? 'Ya hay una sincronización en curso' : 'Sincronización encolada: el worker la procesa en segundos'); setTimeout(route, 4000); }
  catch (e) { toast(e.message); }
});

// ── Dashboard ─────────────────────────────────────────────────────────────
const stat = (label, value, sub = '') => `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
async function viewDashboard() {
  const d = await orgApi('/dashboard');
  const s = d.last_sync;
  $('#view').innerHTML = `
    <div class="cards">
      ${stat('Productos importados', d.products.imported, `${d.products.without_price} sin precio cargado`)}
      ${stat('En stock', d.stock.in_stock + d.stock.low_stock, `${d.stock.low_stock} con pocas unidades · ${d.stock.unknown} sin dato`)}
      ${stat('Agotados', d.stock.out_of_stock)}
      ${stat('Publicaciones visibles conocidas', d.listings.visible_known)}
      ${stat('Publicaciones pendientes', d.listings.pending, `${d.listings.pending_actions} acciones manuales`)}
      ${stat('Alertas abiertas', d.alerts.open, d.alerts.critical ? `<span class="pill danger">${d.alerts.critical} críticas</span>` : '')}
      ${stat('Campañas activas', d.ads.active_campaigns, d.ads.note)}
      ${stat('Consultas abiertas', d.messages.open_conversations, d.messages.note)}
      ${stat('Tareas en curso', d.tasks.pending, d.tasks.failed ? `<span class="pill danger">${d.tasks.failed} fallidas</span>` : '')}
      ${stat('Aprobaciones pendientes', d.approvals.pending)}
    </div>
    <div class="grid-2">
      <div class="card"><h2>Alertas recientes</h2>${alertsList(d.alerts.latest)}</div>
      <div class="card"><h2>Pedile algo al Director</h2>
        <p class="muted small">Ej.: “Prepará una campaña para las crimpadoras San Ou” o “Quiero promocionar la HHY-300A con $100.000”. El Director verifica precio y stock reales y reparte el trabajo. No gasta ni publica nada sin aprobación.</p>
        <form id="directorForm" class="list"><textarea id="instruction" maxlength="2000" required placeholder="Escribí la instrucción…"></textarea><button class="btn primary" type="submit">Enviar al Director</button></form>
        <h3 style="margin-top:18px">Última sincronización</h3>
        ${s ? `<dl class="kv"><dt>Estado</dt><dd><span class="pill ${s.status === 'ok' ? 'ok' : s.status === 'error' ? 'danger' : 'warn'}">${esc(s.status)}</span></dd><dt>Inicio</dt><dd>${date(s.started_at)}</dd>
          <dt>Resultado</dt><dd>${esc(s.stats?.total ?? 0)} productos · ${esc(s.stats?.created ?? 0)} nuevos · ${esc(s.stats?.updated ?? 0)} actualizados · ${esc(s.stats?.unchanged ?? 0)} sin cambios</dd>
          ${s.stats?.prices_loaded === false ? `<dt>Precios</dt><dd class="muted">No se pudieron leer: ${esc(s.stats.prices_error || 'modo offline')}</dd>` : ''}
          ${s.error ? `<dt>Error</dt><dd>${esc(s.error)}</dd>` : ''}</dl>` : '<p class="muted">Todavía no se sincronizó.</p>'}
      </div>
    </div>`;
  $('#directorForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await orgApi('/tasks', { method: 'POST', body: { instruction: $('#instruction').value } }); toast('Instrucción enviada. Mirá el plan en Agentes.'); location.hash = '#/agentes'; }
    catch (err) { toast(err.message); }
  });
}
function alertsList(alerts) {
  if (!alerts.length) return '<div class="empty">Sin alertas abiertas.</div>';
  return `<div class="list">${alerts.map(a => `<div class="list-item"><span class="pill ${SEV[a.severity] || ''}">${esc(a.kind)}</span>
    <div class="grow"><strong>${esc(a.title)}</strong><div class="muted small">${date(a.created_at)}${a.details && Object.keys(a.details).length ? ' · ' + esc(Object.entries(a.details).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')) : ''}</div></div>
    <button class="btn small" data-act="resolve-alert" data-id="${esc(a.id)}">Resolver</button></div>`).join('')}</div>`;
}

// ── Catálogo ──────────────────────────────────────────────────────────────
const catFilters = { q: '', category: '', availability: '', min: '', max: '' };
async function viewCatalog() {
  const qs = new URLSearchParams(Object.entries(catFilters).filter(([, v]) => v)).toString();
  const { products, categories } = await orgApi('/products' + (qs ? `?${qs}` : ''));
  $('#view').innerHTML = `
    <div class="toolbar">
      <input type="search" id="fq" placeholder="Buscar por nombre o modelo" value="${esc(catFilters.q)}">
      <select id="fcat"><option value="">Todas las categorías</option>${categories.map(c => `<option ${c === catFilters.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="favail"><option value="">Toda disponibilidad</option>${Object.entries(AVAIL).map(([k, [t]]) => `<option value="${k}" ${k === catFilters.availability ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input id="fmin" type="number" min="0" placeholder="Precio mín." value="${esc(catFilters.min)}" style="width:120px">
      <input id="fmax" type="number" min="0" placeholder="Precio máx." value="${esc(catFilters.max)}" style="width:120px">
    </div>
    <p class="muted small">${products.length} productos · Fuente: sanou.com.ar (solo lectura). Precio y stock se leen del sitio; las publicaciones nunca tienen stock propio.</p>
    <div class="table-wrap"><table><thead><tr><th></th><th>Producto</th><th class="hide-sm">Modelo</th><th class="hide-sm">Categoría</th><th class="num">Precio</th><th>Stock</th><th class="num hide-sm">Publicaciones</th></tr></thead><tbody>
      ${products.map(p => `<tr data-act="product" data-id="${esc(p.id)}">
        <td>${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy">` : ''}</td>
        <td><strong>${esc(p.name)}</strong>${p.status !== 'active' ? ' <span class="pill warn">ya no está en el sitio</span>' : ''}</td>
        <td class="hide-sm">${esc(p.sku || '—')}</td><td class="hide-sm">${esc(p.category)}</td><td class="num">${money(p.price, p.currency)}</td>
        <td>${availPill(p.availability)}${p.available_units !== null ? ` <span class="muted small">${p.available_units} u.</span>` : ''}</td>
        <td class="num hide-sm">${p.live_listings || '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin resultados con esos filtros.</td></tr>'}
    </tbody></table></div>`;
  let t;
  const apply = () => { catFilters.q = $('#fq').value; catFilters.category = $('#fcat').value; catFilters.availability = $('#favail').value; catFilters.min = $('#fmin').value; catFilters.max = $('#fmax').value; viewCatalog().catch(failView); };
  $('#fq').addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 300); });
  ['#fcat', '#favail', '#fmin', '#fmax'].forEach(s => $(s).addEventListener('change', apply));
}

async function openProduct(id) {
  const p = await orgApi(`/products/${id}`);
  const inv = p.inventory;
  openDrawer(`
    <div><h2 style="margin:0">${esc(p.name)}</h2><p class="muted">${esc(p.category)} · ${esc(p.sku || 'sin modelo')} · <a href="${esc(p.source_url)}" target="_blank" rel="noopener">ver en sanou.com.ar ↗</a></p></div>
    <div class="gallery">${p.media.map(u => `<img src="${esc(u)}" alt="${esc(p.name)}" loading="lazy">`).join('') || '<span class="muted">Sin fotos</span>'}</div>
    <div class="card"><dl class="kv"><dt>Precio</dt><dd>${money(p.price, p.currency)}${p.compare_at_price ? ` <s class="muted">${money(p.compare_at_price)}</s>` : ''}</dd>
      <dt>Disponibilidad</dt><dd>${availPill(inv.availability)}</dd>
      <dt>Control</dt><dd>${inv.tracking_mode === 'units' ? `Unidades: ${inv.on_hand} en depósito · ${inv.reserved} reservadas · <strong>${inv.available_units} disponibles</strong> · ${inv.sold_total} vendidas` : 'Solo “hay / no hay” (la planilla del sitio no informa unidades)'}</dd>
      <dt>Sitio dice</dt><dd>${inv.source_in_stock === true ? 'Con stock' : inv.source_in_stock === false ? 'Sin stock' : 'Sin dato todavía'}</dd></dl></div>
    <div class="card"><h3>Movimiento de stock</h3>
      <form id="movForm" class="form-row">
        <select id="mtype"><option value="adjustment">Ajuste (+/−)</option><option value="restock">Ingreso de mercadería</option><option value="reservation">Reservar</option><option value="reservation_release">Liberar reserva</option><option value="sale">Venta</option><option value="return">Devolución</option></select>
        <input id="mqty" type="number" step="1" required placeholder="Cantidad">
        <input id="mreason" maxlength="300" placeholder="Motivo / referencia">
        <button class="btn primary" type="submit">Registrar</button>
      </form>
      <p class="muted small">Si el sitio marca “sin stock”, el producto queda agotado aunque haya unidades cargadas acá: la web es la fuente principal.</p></div>
    <div class="card"><h3>Especificaciones (ficha real)</h3><dl class="kv">${p.specs.map(s => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`).join('')}</dl>${p.description ? `<p>${esc(p.description)}</p>` : ''}</div>
    <div class="card"><h3>Publicaciones</h3>${p.listings.length ? p.listings.map(l => `<div class="list-item"><span class="pill ${STATUS_CLASS[l.status]}">${esc(l.status.replace(/_/g, ' '))}</span><div class="grow small">${date(l.created_at)}</div></div>`).join('') : '<p class="muted">Sin publicaciones.</p>'}
      <div class="toolbar" style="margin-top:10px"><button class="btn" data-act="new-listing" data-id="${esc(p.id)}" data-kind="marketplace_personal">Crear borrador Marketplace</button><button class="btn" data-act="new-listing" data-id="${esc(p.id)}" data-kind="meta_catalog">Crear borrador Catálogo Meta</button></div></div>
    <div class="card"><h3>Historial de stock</h3>${p.movements.length ? `<div class="list">${p.movements.map(m => `<div class="list-item small"><span class="pill">${esc(m.type)}</span><div class="grow">${m.type === 'source_sync' ? `Sitio: ${m.source_in_stock === null ? 'sin dato' : m.source_in_stock ? 'con stock' : 'sin stock'}` : `${m.qty > 0 ? '+' : ''}${esc(m.qty)}`} → ${esc(AVAIL[m.after_state.availability]?.[0])} ${m.reason ? '· ' + esc(m.reason) : ''}<div class="muted">${date(m.created_at)} · ${esc(m.actor)}</div></div></div>`).join('')}</div>` : '<p class="muted">Sin movimientos.</p>'}</div>`);
  $('#movForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await orgApi(`/products/${id}/inventory`, { method: 'POST', body: { type: $('#mtype').value, qty: Number($('#mqty').value), reason: $('#mreason').value, idempotency_key: crypto.randomUUID() } }); toast('Movimiento registrado'); openProduct(id); }
    catch (err) { toast(err.message); }
  });
}

// ── Marketplace ───────────────────────────────────────────────────────────
let listingStatus = '';
async function viewMarketplace() {
  const { listings, labels } = await orgApi('/listings' + (listingStatus ? `?status=${listingStatus}` : ''));
  $('#view').innerHTML = `
    <div class="notice"><strong>Política:</strong> una publicación viva por producto y cuenta. Los distintos enfoques comerciales son <em>variantes creativas</em> (para elegir o para anuncios), no copias del mismo artículo. Marketplace personal no tiene API oficial: el sistema prepara todo y una persona publica, desactiva y confirma.</div>
    <div class="toolbar"><select id="lstatus"><option value="">Todos los estados</option>${Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === listingStatus ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <span class="muted small">Crear publicaciones desde Catálogo → producto.</span></div>
    <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Canal</th><th>Variante creativa</th><th>Estado</th><th class="num">Precio</th><th>Stock</th><th>Creada</th><th>Revisada</th><th>URL</th><th class="num">Consultas</th><th>Pendiente</th></tr></thead><tbody>
      ${listings.map(l => `<tr data-act="listing" data-id="${esc(l.id)}"><td><strong>${esc(l.product_name)}</strong></td><td>${esc(l.channel_name)}</td><td>${esc(l.creative_angle || '—')}</td>
        <td><span class="pill ${STATUS_CLASS[l.status]}">${esc(l.status_label)}</span>${l.blocked_reason ? ` <span class="pill danger">${esc(l.blocked_reason)}</span>` : ''}</td>
        <td class="num">${money(l.price, l.currency)}</td><td>${availPill(l.availability)}${l.available_units !== null ? ` ${l.available_units} u.` : ''}</td>
        <td>${date(l.created_at)}</td><td>${date(l.last_reviewed_at)}</td><td>${l.external_url ? `<a href="${esc(l.external_url)}" target="_blank" rel="noopener">abrir ↗</a>` : '—'}</td>
        <td class="num">${l.inquiries_count || 0}</td><td>${(l.pending_actions || []).filter(a => !a.done).length || '—'}</td></tr>`).join('') || '<tr><td colspan="11" class="empty">No hay publicaciones todavía.</td></tr>'}
    </tbody></table></div>`;
  $('#lstatus').addEventListener('change', e => { listingStatus = e.target.value; viewMarketplace().catch(failView); });
}

async function openListing(id) {
  const { listings, labels } = await orgApi('/listings');
  const l = listings.find(x => x.id === id);
  if (!l) return;
  const next = TRANSITIONS[l.status] || [];
  openDrawer(`
    <div><h2 style="margin:0">${esc(l.product_name)}</h2><p class="muted">${esc(l.channel_name)} · <span class="pill ${STATUS_CLASS[l.status]}">${esc(l.status_label)}</span></p></div>
    <div class="card"><dl class="kv"><dt>Precio (maestro)</dt><dd>${money(l.price, l.currency)}</dd><dt>Stock (maestro)</dt><dd>${availPill(l.availability)}</dd>
      <dt>URL</dt><dd>${l.external_url ? `<a href="${esc(l.external_url)}" target="_blank" rel="noopener">${esc(l.external_url)}</a>` : '—'}</dd>${l.blocked_reason ? `<dt>Bloqueo</dt><dd><span class="pill danger">${esc(l.blocked_reason)}</span></dd>` : ''}</dl></div>
    <div class="card"><h3>Acciones pendientes</h3>${(l.pending_actions || []).filter(a => !a.done).map(a => `<div class="list-item"><div class="grow"><strong>${esc(a.title)}</strong><div class="muted small">${esc(a.instructions || '')}</div></div><button class="btn small" data-act="action-done" data-id="${esc(l.id)}" data-action="${esc(a.id)}">Hecho</button></div>`).join('') || '<p class="muted">Nada pendiente.</p>'}</div>
    <div class="card"><h3>Cambiar estado</h3>
      ${next.map(s => `<button class="btn ${s === 'publicado' || s === 'desactivado' ? 'primary' : ''}" data-act="transition" data-id="${esc(l.id)}" data-to="${s}">${esc(labels[s])}</button>`).join(' ') || '<p class="muted">Sin transiciones disponibles.</p>'}
      <p class="muted small">“Publicado” y “Desactivado” solo se registran cuando vos (o la API oficial) confirman que ya ocurrió en Facebook.</p></div>`);
}

async function doTransition(id, to) {
  const body = { to };
  if (to === 'publicado' || to === 'desactivado') {
    const ok = confirm(to === 'publicado' ? '¿Confirmás que la publicación YA está visible en Facebook?' : '¿Confirmás que la publicación YA fue pausada/retirada en Facebook?');
    if (!ok) return;
    body.confirmed = true;
    if (to === 'publicado') { const u = prompt('URL de la publicación en Facebook (opcional):', ''); if (u) body.external_url = u.trim(); }
  }
  try { await orgApi(`/listings/${id}/transition`, { method: 'POST', body }); toast('Estado actualizado'); closeDrawer(); viewMarketplace().catch(failView); }
  catch (e) { toast(e.message); }
}

// ── Publicidad y Mensajes (etapas 4 y 3) ──────────────────────────────────
async function viewAds() {
  const s = await orgApi('/settings');
  $('#view').innerHTML = `<div class="notice"><strong>Etapa 4.</strong> MetaAdsAgent propondrá campañas (objetivo, público, ubicaciones, creatividades, presupuesto, duración, KPIs e hipótesis). Toda campaña se crea en <strong>PAUSED</strong> y se activa solo con tu aprobación y con tope de gasto. Una campaña de Meta Ads no es una publicación de Marketplace.</div>
    <div class="cards">${stat('Campañas activas', 0)}${stat('Tope diario configurado', money(s.organization.limits?.ads_daily_spend_cap) )}${stat('Cuenta publicitaria', s.config.meta.adAccount ? 'Configurada' : 'Pendiente')}</div>
    <div class="card"><h2>Lo que se puede automatizar (oficial)</h2>${s.channels.filter(c => c.kind === 'meta_ads' || c.kind === 'meta_catalog').map(c => `<p><strong>${esc(c.label)}:</strong> ${esc(c.note)}</p>`).join('')}</div>`;
}
async function viewMessages() {
  const s = await orgApi('/settings');
  $('#view').innerHTML = `<div class="notice"><strong>Etapa 3.</strong> FacebookSalesAgent responderá con datos reales de catálogo, stock y condiciones. Respuesta automática solo por Messenger de la página (API oficial, ventana de 24 h). En Marketplace personal: respuestas sugeridas para copiar y enviar.</div>
    <div class="card"><h2>Canales de mensajes</h2>${s.channels.filter(c => c.messages !== 'none').map(c => `<p><strong>${esc(c.label)}</strong> <span class="pill ${c.messages === 'api' ? 'ok' : 'warn'}">${c.messages === 'api' ? 'API oficial' : 'respuesta sugerida'}</span><br><span class="muted small">${esc(c.note)}</span></p>`).join('')}</div>`;
}

// ── Agentes ───────────────────────────────────────────────────────────────
async function viewAgents() {
  const [{ agents }, { tasks }, { approvals }] = await Promise.all([orgApi('/agents'), orgApi('/tasks'), orgApi('/approvals')]);
  $('#view').innerHTML = `
    <div class="cards">${agents.map(a => `<div class="card"><h3>${esc(a.name)}</h3><p class="small">${esc(a.role)}</p>
      <p class="small"><span class="pill ${a.implemented.length ? 'ok' : ''}">${a.implemented.length ? 'Operativo (parcial)' : 'Preparado'}</span> <span class="muted">${esc(a.stage_note)}</span></p>
      <p class="small muted">Tareas: ${a.tasks.total} · en curso ${a.tasks.pending} · fallidas ${a.tasks.failed}</p>
      <details><summary class="small">Herramientas, límites y aprobaciones</summary><p class="small"><strong>Herramientas:</strong> ${a.allowed_tools.map(esc).join(', ')}</p><p class="small"><strong>Restricciones:</strong> ${a.constraints.map(esc).join(' · ')}</p><p class="small"><strong>Requiere aprobación:</strong> ${a.approval_required.map(esc).join(', ')}</p><p class="small"><strong>Presupuesto IA:</strong> USD ${esc(a.ai_budget_usd_daily)}/día</p></details></div>`).join('')}</div>
    <div class="card"><h2>Aprobaciones</h2>${approvals.length ? approvals.map(a => `<div class="list-item"><span class="pill ${a.status === 'pendiente' ? 'warn' : ''}">${esc(a.status)}</span><div class="grow"><strong>${esc(a.action)}</strong><div class="muted small">${esc(a.requested_by)} · ${date(a.created_at)}</div></div>${a.status === 'pendiente' ? `<button class="btn small primary" data-act="approve" data-id="${esc(a.id)}">Aprobar</button><button class="btn small danger" data-act="reject" data-id="${esc(a.id)}">Rechazar</button>` : ''}</div>`).join('') : '<p class="muted">No hay solicitudes de aprobación.</p>'}</div>
    <div class="table-wrap"><table><thead><tr><th>Agente</th><th>Tarea</th><th>Estado</th><th>Origen</th><th>Creada</th><th>Detalle</th></tr></thead><tbody>
      ${tasks.map(t => `<tr data-act="task" data-id="${esc(t.id)}"><td>${esc(t.agent)}</td><td>${esc(t.type)}</td><td><span class="pill ${TASK_CLASS[t.status]}">${esc(t.status.replace(/_/g, ' '))}</span></td><td>${esc(t.source_system)}</td><td>${date(t.created_at)}</td><td class="small muted">${esc(t.last_error || t.result?.reason || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin tareas.</td></tr>'}
    </tbody></table></div>`;
}
async function openTask(id) {
  const t = await orgApi(`/tasks/${id}`);
  const plan = t.type === 'director.plan' && t.result;
  openDrawer(`<div><h2 style="margin:0">${esc(t.type)}</h2><p class="muted">${esc(t.agent)} · <span class="pill ${TASK_CLASS[t.status]}">${esc(t.status)}</span></p></div>
    ${plan ? `<div class="card"><h3>Plan del Director</h3><p>${esc(plan.instruction)}</p>
      <h4>Productos incluidos (precio y stock verificados)</h4>${plan.ok.map(p => `<div class="small">• ${esc(p.name)} — ${money(p.price)} ${availPill(p.availability)}</div>`).join('') || '<p class="muted">Ninguno</p>'}
      ${plan.excluded.length ? `<h4>Excluidos</h4>${plan.excluded.map(p => `<div class="small">• ${esc(p.name)} — ${esc(p.reason)}</div>`).join('')}` : ''}
      <h4>Subtareas</h4>${(plan.children || []).map(c => `<div class="small">• ${esc(c.agent)}: ${esc(c.type)}</div>`).join('') || '<p class="muted">Ninguna</p>'}
      ${plan.warnings.map(w => `<p class="notice warn small">${esc(w)}</p>`).join('')}</div>` : ''}
    <div class="card"><h3>Contrato (agent-task/v1)</h3><pre>${esc(JSON.stringify(t, null, 2))}</pre></div>`);
}

// ── Configuración ─────────────────────────────────────────────────────────
async function viewSettings() {
  const s = await orgApi('/settings');
  const yes = v => `<span class="pill ${v ? 'ok' : 'warn'}">${v ? 'configurado' : 'pendiente'}</span>`;
  const c = s.config;
  let runs = [], audit = [];
  try { runs = (await orgApi('/sync-runs')).runs; audit = (await orgApi('/audit')).entries; } catch {}
  $('#view').innerHTML = `
    <div class="grid-2">
      <div class="card"><h2>Conexiones</h2><dl class="kv">
        <dt>Almacenamiento</dt><dd>${esc(c.store)}</dd>
        <dt>Catálogo San Ou</dt><dd>${esc(c.sanou.siteUrl)} ${yes(c.sanou.backend)} <span class="muted small">precios: ${esc(c.sanou.pricesMode)}</span></dd>
        <dt>Frecuencia de sync</dt><dd>cada ${esc(c.sync.catalogEveryMin)} min</dd>
        <dt>Graph API</dt><dd>${esc(c.meta.graphVersion)}</dd>
        <dt>App de Meta</dt><dd>${yes(c.meta.app)}</dd><dt>System User token</dt><dd>${yes(c.meta.systemUserToken)}</dd>
        <dt>Catálogo de Meta</dt><dd>${yes(c.meta.catalogId)}</dd><dt>Página (Messenger)</dt><dd>${yes(c.meta.page)}</dd>
        <dt>Cuenta publicitaria</dt><dd>${yes(c.meta.adAccount)}</dd><dt>Webhook</dt><dd>${yes(c.meta.webhook)}</dd>
        <dt>Escrituras a Meta</dt><dd><span class="pill ${c.meta.writeEnabled ? 'danger' : 'ok'}">${c.meta.writeEnabled ? 'habilitadas' : 'deshabilitadas (seguro)'}</span></dd>
        <dt>Agencia (HMAC)</dt><dd>${yes(c.agency.signedRequests)}</dd>
        <dt>IA</dt><dd>${esc(c.ai.provider)} · ${esc(c.ai.model)} · tope USD ${esc(c.ai.dailyBudgetUsd)}/día ${c.ai.provider !== 'offline' ? yes(c.ai.keyConfigured) : ''}</dd></dl>
        <p class="muted small">Las claves se configuran en el servidor (variables de entorno o Supabase Vault). Nunca se muestran ni se envían al navegador.</p></div>
      <div class="card"><h2>Feed para el Catálogo de Meta</h2>
        <p class="small">URL para cargar como <em>feed programado</em> en Commerce Manager (vía oficial). Precio y disponibilidad salen del inventario maestro: un agotado se refleja en el próximo ciclo.</p>
        ${s.feed_url ? `<pre>${esc(s.feed_url)}</pre><p class="muted small">Tratala como privada. Productos sin precio, sin fotos o con stock desconocido se excluyen (no se inventan datos).</p>` : '<p class="muted">Visible solo para administradores.</p>'}
        <h3>Límites operativos</h3><dl class="kv"><dt>Tope diario Ads</dt><dd>${money(s.organization.limits?.ads_daily_spend_cap)}</dd><dt>Tope total Ads</dt><dd>${money(s.organization.limits?.ads_total_spend_cap)}</dd><dt>Respuestas automáticas</dt><dd>${s.organization.limits?.auto_messages ? 'sí' : 'no'}</dd></dl></div>
    </div>
    <div class="card"><h2>Capacidades por canal</h2>${s.channels.map(ch => `<p><strong>${esc(ch.label)}</strong> — publicar: ${esc(ch.publish)} · desactivar: ${esc(ch.deactivate)} · mensajes: ${esc(ch.messages)}<br><span class="muted small">${esc(ch.note)}</span></p>`).join('')}</div>
    <div class="card"><h2>Sincronizaciones</h2>${runs.map(r => `<div class="small">${date(r.started_at)} · <span class="pill ${r.status === 'ok' ? 'ok' : r.status === 'error' ? 'danger' : 'warn'}">${esc(r.status)}</span> ${esc(r.stats?.total ?? '')} productos${r.error ? ' · ' + esc(r.error) : ''}${r.stats?.media_missing?.length ? ` · ${r.stats.media_missing.length} fotos faltantes en el sitio` : ''}</div>`).join('') || '<p class="muted">Sin datos.</p>'}</div>
    <div class="card"><h2>Auditoría</h2>${audit.slice(0, 50).map(a => `<div class="small">${date(a.created_at)} · <strong>${esc(a.action)}</strong> · ${esc(a.actor)}</div>`).join('') || '<p class="muted">Sin datos (o sin permiso).</p>'}</div>`;
}

// ── Delegación de clics ───────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id } = el.dataset;
  try {
    if (act === 'retry') route();
    else if (act === 'product') await openProduct(id);
    else if (act === 'listing') await openListing(id);
    else if (act === 'task') await openTask(id);
    else if (act === 'transition') await doTransition(id, el.dataset.to);
    else if (act === 'resolve-alert') { await orgApi(`/alerts/${id}/resolve`, { method: 'POST' }); toast('Alerta resuelta'); route(); }
    else if (act === 'new-listing') { await orgApi('/listings', { method: 'POST', body: { product_id: id, channel_kind: el.dataset.kind } }); toast('Borrador creado'); openProduct(id); }
    else if (act === 'action-done') { await orgApi(`/listings/${id}/actions/${el.dataset.action}/done`, { method: 'POST' }); toast('Acción marcada como hecha'); openListing(id); }
    else if (act === 'approve' || act === 'reject') { await orgApi(`/approvals/${id}/decide`, { method: 'POST', body: { approve: act === 'approve' } }); toast('Decisión registrada'); route(); }
  } catch (err) { toast(err.message); }
});

start();
