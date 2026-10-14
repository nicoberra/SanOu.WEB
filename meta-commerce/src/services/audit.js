// Registro de auditoría (append-only). Toda acción sensible deja rastro: quién, qué, sobre qué.
export async function audit(db, actor, action, entity, entityId, details = {}) {
  return db.insert('audit_logs', { actor, action, entity, entity_id: entityId == null ? null : String(entityId), details });
}
