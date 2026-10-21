// Filtros simples y portables: { campo: valor } (igualdad) o { campo: { in: [...] } } / { campo: { neq: v } }.
// El store de Supabase traduce exactamente lo mismo a PostgREST, así los servicios no dependen del motor.
export function matches(row, filter = {}) {
  for (const [k, cond] of Object.entries(filter)) {
    const v = row[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('in' in cond && !cond.in.includes(v)) return false;
      if ('neq' in cond && v === cond.neq) return false;
      if ('lte' in cond && !(v <= cond.lte)) return false;
      if ('gte' in cond && !(v >= cond.gte)) return false;
      if ('is' in cond && (v ?? null) !== cond.is) return false;
    } else if ((v ?? null) !== (cond ?? null)) return false;
  }
  return true;
}
