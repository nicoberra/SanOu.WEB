// Store de producción: Supabase (Postgres) vía PostgREST, con la service_role key.
// SOLO se usa en servidor/worker. La service_role salta la RLS, por eso todos los
// servicios trabajan a través de scoped() que agrega organization_id a cada consulta.
import { DomainError } from '../core/util.js';

const NO_ID_KEY = { inventory: 'variant_id' };

function toQuery(filter = {}) {
  const q = new URLSearchParams();
  const lit = v => (v === null ? 'null' : typeof v === 'boolean' ? String(v) : `"${String(v).replace(/"/g, '\\"')}"`);
  for (const [k, c] of Object.entries(filter)) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if ('in' in c) q.append(k, `in.(${c.in.map(lit).join(',')})`);
      if ('neq' in c) q.append(k, `neq.${c.neq}`);
      if ('lte' in c) q.append(k, `lte.${c.lte}`);
      if ('gte' in c) q.append(k, `gte.${c.gte}`);
      if ('is' in c) q.append(k, `is.${c.is}`);
    } else q.append(k, c === null ? 'is.null' : `eq.${c}`);
  }
  return q;
}

export class SupabaseStore {
  constructor({ url, serviceKey }) {
    if (!url || !serviceKey) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    this.base = url.replace(/\/$/, '') + '/rest/v1';
    this.headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  }
  keyOf(table) { return NO_ID_KEY[table] || 'id'; }
  async req(method, pathAndQuery, body, extra = {}) {
    const res = await fetch(this.base + pathAndQuery, { method, headers: { ...this.headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new DomainError(res.status === 409 ? 'duplicado' : 'db_error', data?.message || `Supabase ${res.status}`, res.status === 409 ? 409 : 502);
    return { data, res };
  }
  async find(table, filter = {}, { order, limit } = {}) {
    const q = toQuery(filter);
    if (order) q.set('order', order);
    if (limit) q.set('limit', String(limit));
    return (await this.req('GET', `/${table}?${q}`)).data;
  }
  async findOne(table, filter) { return (await this.find(table, filter, { limit: 1 }))[0] || null; }
  async get(table, id) { return this.findOne(table, { [this.keyOf(table)]: id }); }
  async count(table, filter = {}) {
    const q = toQuery(filter); q.set('select', this.keyOf(table));
    const { res } = await this.req('HEAD', `/${table}?${q}`, undefined, { Prefer: 'count=exact' });
    return Number((res.headers.get('content-range') || '*/0').split('/')[1]) || 0;
  }
  async insert(table, row) { return (await this.req('POST', `/${table}`, row, { Prefer: 'return=representation' })).data[0]; }
  async update(table, id, patch) {
    const q = toQuery({ [this.keyOf(table)]: id });
    const rows = (await this.req('PATCH', `/${table}?${q}`, patch, { Prefer: 'return=representation' })).data;
    if (!rows.length) throw new DomainError('no_encontrado', `${table} ${id} no existe`, 404);
    return rows[0];
  }
  async updateWhere(table, filter, patch) {
    return (await this.req('PATCH', `/${table}?${toQuery(filter)}`, patch, { Prefer: 'return=representation' })).data;
  }
  async remove(table, id) { await this.req('DELETE', `/${table}?${toQuery({ [this.keyOf(table)]: id })}`); }
  async upsert(table, row, conflictKeys) {
    const existing = await this.findOne(table, Object.fromEntries(conflictKeys.map(k => [k, row[k]])));
    if (existing) return { row: await this.update(table, existing[this.keyOf(table)], row), created: false };
    return { row: await this.insert(table, row), created: true };
  }
  async applyInventoryMovement(p) {
    const units = p.type === 'source_sync' ? p.units : p.qty;
    const { data } = await this.req('POST', '/rpc/apply_inventory_movement', {
      p_org: p.organization_id, p_variant: p.variant_id, p_type: p.type, p_qty: units ?? null,
      p_source_in_stock: p.source_in_stock ?? null, p_reason: p.reason ?? null, p_reference: p.reference ?? null,
      p_idempotency_key: p.idempotency_key ?? null, p_actor: p.actor,
    });
    return data;
  }
  flush() {}
}
