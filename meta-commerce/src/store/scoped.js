// Aislamiento multiempresa a nivel aplicación: TODA operación queda atada a una organización.
// (En Supabase además rige la RLS; esto protege también al worker, que usa service_role.)
import { DomainError } from '../core/util.js';

const GLOBAL_TABLES = new Set(['organizations']);

export function scoped(store, orgId) {
  if (!orgId) throw new DomainError('sin_organizacion', 'Operación sin organización', 500);
  const check = (table, row) => {
    if (row && !GLOBAL_TABLES.has(table) && row.organization_id !== orgId)
      throw new DomainError('aislamiento', 'Acceso a datos de otra organización bloqueado', 403);
    return row;
  };
  const withOrg = f => ({ ...f, organization_id: orgId });
  return {
    orgId, raw: store,
    find: (t, f = {}, o) => store.find(t, withOrg(f), o),
    findOne: (t, f = {}) => store.findOne(t, withOrg(f)),
    count: (t, f = {}) => store.count(t, withOrg(f)),
    get: async (t, id) => check(t, await store.get(t, id)),
    insert: (t, row) => store.insert(t, { ...row, organization_id: orgId }),
    update: async (t, id, patch) => {
      check(t, await store.get(t, id));
      const { organization_id, ...safe } = patch;               // nunca se cambia de empresa
      return store.update(t, id, safe);
    },
    updateWhere: (t, f, patch) => { const { organization_id, ...safe } = patch; return store.updateWhere(t, withOrg(f), safe); },
    remove: async (t, id) => { check(t, await store.get(t, id)); return store.remove(t, id); },
    upsert: (t, row, keys) => store.upsert(t, { ...row, organization_id: orgId }, keys.includes('organization_id') ? keys : ['organization_id', ...keys]),
    applyInventoryMovement: p => store.applyInventoryMovement({ ...p, organization_id: orgId }),
  };
}
