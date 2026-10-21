// Servidor HTTP (sin dependencias): API del panel, API para la agencia, feed de catálogo y webhooks de Meta.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, publicConfig } from '../config.js';
import { DomainError, timingSafeEqualStr } from '../core/util.js';
import { createAuth, requireRole } from './auth.js';
import { verifyAgencyRequest } from './agency-auth.js';
import { verifyMetaSignature } from '../connectors/meta/graph-client.js';
import { buildFeedRows, toCsv } from '../connectors/meta/catalog.js';
import { catalogView, productDetail, dashboardView, agentsView, channelsView } from '../services/views.js';
import { createListing, transitionListing, completePendingAction, listingOverview, accountForKind } from '../services/listings.js';
import { enqueueTask, cancelTask } from '../services/tasks.js';
import { decideApproval } from '../services/approvals.js';
import { audit } from '../services/audit.js';
import { toEnvelope } from '../core/task-contract.js';
import { LABELS } from '../core/listing-states.js';
import { MOVEMENT_TYPES } from '../core/inventory-math.js';

const MAX_BODY = 256 * 1024;
const STATIC = path.join(ROOT, 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new DomainError('muy_grande', 'Cuerpo demasiado grande', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS }); res.end(JSON.stringify(data)); };
const parseJson = raw => { if (!raw) return {}; try { return JSON.parse(raw); } catch { throw new DomainError('json_invalido', 'JSON inválido'); } };

export function createApp(rt) {
  const authenticate = createAuth(rt);
  const routes = [];
  const on = (method, pattern, handler, opts = {}) => {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, ...opts });
  };

  // Resuelve la empresa del path y verifica pertenencia/rol.
  async function orgCtx(req, params, minRole = 'viewer') {
    const org = await rt.store.findOne('organizations', { slug: params.org });
    if (!org) throw new DomainError('no_encontrado', 'Empresa inexistente', 404);
    const role = await requireRole(req.user, org.id, minRole);
    return { org, role, ...rt.forOrg(org.id), actor: `user:${req.user.id}` };
  }

  // ── Panel ───────────────────────────────────────────────────────────────
  on('GET', '/api/health', async () => ({ ok: true, store: rt.cfg.store, metaWrites: rt.cfg.meta.writeEnabled }), { public: true });

  on('GET', '/api/me', async req => {
    const orgs = await rt.store.find('organizations');
    const mine = [];
    for (const o of orgs) { const role = await req.user.roleIn(o.id); if (role) mine.push({ slug: o.slug, name: o.name, role }); }
    return { user: { id: req.user.id, label: req.user.label }, organizations: mine };
  });

  on('GET', '/api/orgs/:org/dashboard', async (req, p) => dashboardView((await orgCtx(req, p)).db));

  on('GET', '/api/orgs/:org/products', async (req, p, q) => {
    const { db } = await orgCtx(req, p);
    const rows = await catalogView(db, q);
    const categories = [...new Set((await catalogView(db)).map(r => r.category))].sort();
    return { products: rows, categories };
  });
  on('GET', '/api/orgs/:org/products/:id', async (req, p) => {
    const d = await productDetail((await orgCtx(req, p)).db, p.id);
    if (!d) throw new DomainError('no_encontrado', 'Producto inexistente', 404);
    return d;
  });
  // Movimiento de stock manual (unidades, reservas, ventas). El sitio sigue mandando sobre "sin stock".
  on('POST', '/api/orgs/:org/products/:id/inventory', async (req, p, q, body) => {
    const { db, inventory, actor } = await orgCtx(req, p, 'operator');
    if (!MOVEMENT_TYPES.includes(body.type) || body.type === 'source_sync') throw new DomainError('movimiento_invalido', 'Tipo de movimiento inválido');
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || Math.abs(qty) > 100000) throw new DomainError('movimiento_invalido', 'Cantidad inválida');
    const v = await db.findOne('product_variants', { product_id: p.id, is_default: true });
    if (!v) throw new DomainError('no_encontrado', 'Producto inexistente', 404);
    const r = await inventory.move({ variantId: v.id, productId: p.id, type: body.type, qty, reason: String(body.reason || '').slice(0, 300) || null,
      reference: String(body.reference || '').slice(0, 120) || null, idempotencyKey: body.idempotency_key ? String(body.idempotency_key).slice(0, 120) : null, actor });
    return { inventory: r.state, duplicate: r.duplicate };
  });

  on('GET', '/api/orgs/:org/listings', async (req, p, q) => {
    const { db } = await orgCtx(req, p);
    return { listings: await listingOverview(db, q.status ? { status: q.status } : {}), labels: LABELS };
  });
  on('POST', '/api/orgs/:org/listings', async (req, p, q, body) => {
    const { db, actor } = await orgCtx(req, p, 'operator');
    const acc = await accountForKind(db, body.channel_kind || 'marketplace_personal');
    return createListing(db, { productId: body.product_id, accountId: acc.id, actor });
  });
  on('POST', '/api/orgs/:org/listings/:id/transition', async (req, p, q, body) => {
    const sensitive = ['listo_para_publicar', 'publicado', 'desactivado'].includes(body.to);
    const { db, actor } = await orgCtx(req, p, sensitive ? 'admin' : 'operator');
    return transitionListing(db, p.id, body.to, { actor, reason: body.reason ? String(body.reason).slice(0, 300) : null, confirmed: body.confirmed === true, externalUrl: body.external_url });
  });
  on('POST', '/api/orgs/:org/listings/:id/actions/:actionId/done', async (req, p) => {
    const { db, actor } = await orgCtx(req, p, 'operator');
    return completePendingAction(db, p.id, p.actionId, actor);
  });

  on('GET', '/api/orgs/:org/alerts', async (req, p, q) => ({ alerts: await (await orgCtx(req, p)).db.find('alerts', q.status ? { status: q.status } : {}, { order: 'created_at.desc', limit: 200 }) }));
  on('POST', '/api/orgs/:org/alerts/:id/resolve', async (req, p) => {
    const { db, actor } = await orgCtx(req, p, 'operator');
    await audit(db, actor, 'alert.resolve', 'alerts', p.id);
    return db.update('alerts', p.id, { status: 'resuelta' });
  });

  on('GET', '/api/orgs/:org/tasks', async (req, p) => ({ tasks: await (await orgCtx(req, p)).db.find('agent_tasks', {}, { order: 'created_at.desc', limit: 200 }) }));
  on('GET', '/api/orgs/:org/tasks/:id', async (req, p) => {
    const { db } = await orgCtx(req, p);
    const t = await db.get('agent_tasks', p.id);
    if (!t) throw new DomainError('no_encontrado', 'Tarea inexistente', 404);
    return toEnvelope(t, await db.find('agent_executions', { task_id: t.id }));
  });
  // Instrucción en lenguaje natural al Director (o una tarea directa a un agente).
  on('POST', '/api/orgs/:org/tasks', async (req, p, q, body) => {
    const { db, actor } = await orgCtx(req, p, 'operator');
    if (body.instruction) return enqueueTask(db, { agent: 'FacebookDirectorAgent', type: 'director.plan', priority: 2, requested_by: actor, source_system: 'panel', input: { instruction: String(body.instruction).slice(0, 2000) } });
    return enqueueTask(db, { ...body, requested_by: actor, source_system: 'panel' });
  });
  on('POST', '/api/orgs/:org/tasks/:id/cancel', async (req, p) => { const { db, actor } = await orgCtx(req, p, 'operator'); return cancelTask(db, p.id, actor); });
  on('POST', '/api/orgs/:org/sync', async (req, p) => {
    const { db, actor } = await orgCtx(req, p, 'operator');
    return enqueueTask(db, { agent: 'MarketplaceAgent', type: 'catalog.sync', priority: 1, requested_by: actor, source_system: 'panel', idempotency_key: `catalog.sync:manual:${Math.floor(Date.now() / 30e3)}` });
  });
  on('GET', '/api/orgs/:org/sync-runs', async (req, p) => ({ runs: await (await orgCtx(req, p)).db.find('sync_runs', {}, { order: 'started_at.desc', limit: 20 }) }));

  on('GET', '/api/orgs/:org/approvals', async (req, p) => ({ approvals: await (await orgCtx(req, p)).db.find('approvals', {}, { order: 'created_at.desc', limit: 100 }) }));
  on('POST', '/api/orgs/:org/approvals/:id/decide', async (req, p, q, body) => {
    const { db, actor } = await orgCtx(req, p, 'admin');
    return decideApproval(db, p.id, { approve: body.approve === true, user: actor, note: String(body.note || '').slice(0, 500) });
  });

  on('GET', '/api/orgs/:org/agents', async (req, p) => {
    const { db } = await orgCtx(req, p);
    return { agents: agentsView(await db.find('agent_definitions'), await db.find('agent_tasks', {}, { order: 'created_at.desc', limit: 500 })) };
  });
  on('GET', '/api/orgs/:org/settings', async (req, p) => {
    const { db, org, role } = await orgCtx(req, p);
    const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    return { organization: { slug: org.slug, name: org.name, website_url: org.website_url, currency: org.currency, limits: org.settings?.limits },
      config: publicConfig(rt.cfg), channels: channelsView(await db.find('sales_channels')),
      feed_url: ['owner', 'admin'].includes(role) ? `${base}/feeds/${org.slug}/meta-catalog.csv?key=${org.settings?.feed_key}` : null };
  });
  on('GET', '/api/orgs/:org/audit', async (req, p) => ({ entries: await (await orgCtx(req, p, 'admin')).db.find('audit_logs', {}, { order: 'created_at.desc', limit: 200 }) }));

  // ── Feed de catálogo para Commerce Manager (feed programado, vía oficial) ──
  on('GET', '/feeds/:org/meta-catalog.csv', async (req, p, q, body, res) => {
    const org = await rt.store.findOne('organizations', { slug: p.org });
    if (!org || !q.key || !org.settings?.feed_key || !timingSafeEqualStr(q.key, org.settings.feed_key)) throw new DomainError('no_encontrado', 'No encontrado', 404);
    const { db } = rt.forOrg(org.id);
    const [products, variants, inv, media] = await Promise.all([db.find('products'), db.find('product_variants', { is_default: true }), db.find('inventory'), db.find('product_media', {}, { order: 'position.asc' })]);
    const vBy = new Map(variants.map(v => [v.product_id, v.id])), iBy = new Map(inv.map(i => [i.variant_id, i]));
    const items = products.map(pr => ({ product: pr, inventory: iBy.get(vBy.get(pr.id)), media: media.filter(m => m.product_id === pr.id).map(m => m.url) }));
    const { rows, excluded } = buildFeedRows(items, { idPrefix: org.slug });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-Feed-Excluded': String(excluded.length) });
    res.end(toCsv(rows));
  }, { public: true, raw: true });

  // ── API para el orquestador de la agencia (firmada con HMAC) ─────────────
  on('POST', '/api/v1/agency/tasks', async (req, p, q, body) => {
    const org = await rt.store.findOne('organizations', { slug: body.organization });
    if (!org) throw new DomainError('no_encontrado', 'Empresa inexistente', 404);
    const { db } = rt.forOrg(org.id);
    const { task, duplicate } = await enqueueTask(db, { ...body, source_system: 'agency-orchestrator', requested_by: `agency:${String(body.requested_by || 'orchestrator').slice(0, 80)}` });
    return { duplicate, task: toEnvelope(task) };
  }, { public: true, agency: true });
  on('GET', '/api/v1/agency/tasks/:id', async (req, p, q) => {
    const org = await rt.store.findOne('organizations', { slug: q.organization });
    if (!org) throw new DomainError('no_encontrado', 'Empresa inexistente', 404);
    const { db } = rt.forOrg(org.id);
    const t = await db.get('agent_tasks', p.id).catch(() => null);
    if (!t) throw new DomainError('no_encontrado', 'Tarea inexistente', 404);
    return toEnvelope(t, await db.find('agent_executions', { task_id: t.id }));
  }, { public: true, agency: true });

  // ── Webhooks de Meta (Messenger: Etapa 3). Verificación + firma; se registran sin actuar. ──
  on('GET', '/webhooks/meta', async (req, p, q, body, res) => {
    const ok = q['hub.mode'] === 'subscribe' && rt.cfg.meta.webhookVerifyToken && timingSafeEqualStr(q['hub.verify_token'] || '', rt.cfg.meta.webhookVerifyToken);
    res.writeHead(ok ? 200 : 403, { 'Content-Type': 'text/plain' }); res.end(ok ? String(q['hub.challenge'] || '') : 'forbidden');
  }, { public: true, raw: true });
  on('POST', '/webhooks/meta', async (req, p, q, body, res, rawBody) => {
    if (!verifyMetaSignature(rawBody, req.headers['x-hub-signature-256'], rt.cfg.meta.appSecret)) throw new DomainError('firma_invalida', 'Firma inválida', 401);
    await rt.store.insert('audit_logs', { organization_id: null, actor: 'meta:webhook', action: 'webhook.received', entity: body.object || 'unknown', entity_id: null, details: { entries: (body.entry || []).length } });
    res.writeHead(200); res.end('EVENT_RECEIVED');
  }, { public: true, raw: true });

  // ── Despacho ───────────────────────────────────────────────────────────
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!route) {
        if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
        throw new DomainError('no_encontrado', 'Ruta inexistente', 404);
      }
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(url.pathname.match(route.re)[i + 1])]));
      const query = Object.fromEntries(url.searchParams);
      const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : '';
      if (route.agency) {
        const v = verifyAgencyRequest(rt.cfg.agency.sharedSecret, req.headers, req.method === 'GET' ? url.pathname + url.search : raw);
        if (!v.ok) throw new DomainError('no_autorizado', v.error, 401);
      }
      if (!route.public) req.user = await authenticate(req);
      const body = parseJson(raw);
      const out = await route.handler(req, params, query, body, res, raw);
      if (!route.raw) json(res, 200, out);
    } catch (e) {
      const status = e instanceof DomainError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) json(res, status, { error: e.code || 'error_interno', message: status === 500 ? 'Error interno' : e.message });
    }
  };
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(STATIC, rel);
  if (!file.startsWith(STATIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('No encontrado');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
  fs.createReadStream(file).pipe(res);
}

export function createServer(rt) { return http.createServer(createApp(rt)); }
