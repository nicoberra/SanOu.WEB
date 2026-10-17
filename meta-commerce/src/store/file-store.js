// Store local en memoria con persistencia en un archivo JSON (modo demo / desarrollo).
// Misma interfaz que SupabaseStore. Las tablas de solo-anexado no admiten update/delete.
import fs from 'node:fs';
import path from 'node:path';
import { uuid, now, DomainError } from '../core/util.js';
import { matches } from './filters.js';
import { applyMovement } from '../core/inventory-math.js';

const APPEND_ONLY = new Set(['audit_logs', 'inventory_movements', 'listing_status_history', 'agent_executions']);
const NO_ID_KEY = { inventory: 'variant_id' };

export class FileStore {
  constructor(file) {
    this.file = file;
    this.db = {};
    if (file && fs.existsSync(file)) this.db = JSON.parse(fs.readFileSync(file, 'utf8'));
    this._timer = null;
  }
  t(table) { return (this.db[table] ||= []); }
  keyOf(table) { return NO_ID_KEY[table] || 'id'; }

  persist() {
    if (!this.file) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 50);
  }
  flush() {
    if (!this.file) return;
    clearTimeout(this._timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);                       // escritura atómica
  }

  async find(table, filter = {}, { order, limit } = {}) {
    let rows = this.t(table).filter(r => matches(r, filter));
    if (order) {
      const [col, dir] = order.split('.');
      rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    return structuredClone(limit ? rows.slice(0, limit) : rows);
  }
  async findOne(table, filter) { return (await this.find(table, filter, { limit: 1 }))[0] || null; }
  async get(table, id) { return this.findOne(table, { [this.keyOf(table)]: id }); }
  async count(table, filter = {}) { return this.t(table).filter(r => matches(r, filter)).length; }

  async insert(table, row) {
    const key = this.keyOf(table);
    const r = { ...row };
    if (key === 'id' && !r.id) r.id = table.endsWith('history') || table === 'audit_logs' || table === 'agent_executions' ? this.t(table).length + 1 : uuid();
    r.created_at ||= now();
    if (this.t(table).some(x => x[key] === r[key])) throw new DomainError('duplicado', `${table}: clave duplicada ${r[key]}`, 409);
    this.t(table).push(r);
    this.persist();
    return structuredClone(r);
  }
  async update(table, id, patch) {
    if (APPEND_ONLY.has(table)) throw new DomainError('solo_anexado', `${table} es de solo-anexado`, 500);
    const key = this.keyOf(table);
    const r = this.t(table).find(x => x[key] === id);
    if (!r) throw new DomainError('no_encontrado', `${table} ${id} no existe`, 404);
    Object.assign(r, patch, { updated_at: now() });
    this.persist();
    return structuredClone(r);
  }
  // Actualiza solo si la fila sigue cumpliendo el filtro (para "tomar" tareas sin carreras).
  async updateWhere(table, filter, patch) {
    if (APPEND_ONLY.has(table)) throw new DomainError('solo_anexado', `${table} es de solo-anexado`, 500);
    const rows = this.t(table).filter(r => matches(r, filter));
    for (const r of rows) Object.assign(r, patch, { updated_at: now() });
    if (rows.length) this.persist();
    return structuredClone(rows);
  }
  async remove(table, id) {
    if (APPEND_ONLY.has(table)) throw new DomainError('solo_anexado', `${table} es de solo-anexado`, 500);
    const key = this.keyOf(table), rows = this.t(table), i = rows.findIndex(x => x[key] === id);
    if (i >= 0) { rows.splice(i, 1); this.persist(); }
  }
  // Inserta o actualiza por una clave natural (ej. organization_id+source+external_id).
  async upsert(table, row, conflictKeys) {
    const filter = Object.fromEntries(conflictKeys.map(k => [k, row[k]]));
    const existing = await this.findOne(table, filter);
    if (existing) return { row: await this.update(table, existing[this.keyOf(table)], row), created: false };
    return { row: await this.insert(table, row), created: true };
  }

  // Equivalente a la función SQL apply_inventory_movement (atómico: JS es monohilo y no hay await en medio).
  async applyInventoryMovement({ organization_id, variant_id, type, qty = 0, source_in_stock = null, units = null, reason = null, reference = null, idempotency_key = null, actor }) {
    if (idempotency_key) {
      const dup = this.t('inventory_movements').find(m => m.organization_id === organization_id && m.idempotency_key === idempotency_key);
      if (dup) return { duplicate: true, before: dup.before_state, state: structuredClone(dup.after_state) };
    }
    const inv = this.t('inventory').find(i => i.variant_id === variant_id && i.organization_id === organization_id);
    if (!inv) throw new DomainError('no_encontrado', 'Inventario inexistente para la variante', 404);
    const before = structuredClone(inv);
    const after = applyMovement(inv, { type, qty, source_in_stock, units });
    after.updated_at = now();
    Object.assign(inv, after);
    this.t('inventory_movements').push({
      id: uuid(), organization_id, variant_id, type, qty: type === 'source_sync' ? (units ?? 0) : qty, source_in_stock,
      reason, reference, idempotency_key, actor, before_state: before, after_state: structuredClone(inv), created_at: now(),
    });
    this.persist();
    return { duplicate: false, before, state: structuredClone(inv) };
  }
}
