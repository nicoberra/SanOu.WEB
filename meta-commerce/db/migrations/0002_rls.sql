-- ════════════════════════════════════════════════════════════════════════════
-- Meta Commerce AI — Migración 0002: Row Level Security
-- Usuarios del panel (Supabase Auth, rol "authenticated") solo ven filas de las
-- empresas a las que pertenecen. Escrituras: owner/admin/operator; viewer solo lee.
-- El worker y el servidor usan service_role (salta RLS) y por eso además filtran
-- SIEMPRE por organization_id en código (src/store/scoped.js).
-- ════════════════════════════════════════════════════════════════════════════

create function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_users where organization_id = org and user_id = auth.uid())
$$;

create function can_write_org(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_users
                 where organization_id = org and user_id = auth.uid()
                   and role in ('owner','admin','operator'))
$$;

create function is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_users
                 where organization_id = org and user_id = auth.uid() and role in ('owner','admin'))
$$;

alter table organizations enable row level security;
create policy org_read on organizations for select using (is_org_member(id));
create policy org_admin_update on organizations for update using (is_org_admin(id));

alter table organization_users enable row level security;
create policy ou_read on organization_users for select using (is_org_member(organization_id));
create policy ou_admin on organization_users for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

-- Tablas comerciales: lectura para miembros, escritura para operadores.
do $$ declare t text; begin
  foreach t in array array['products','product_media','product_variants','sales_channels','channel_accounts',
    'marketplace_listings','listing_creatives','ad_campaigns','ad_creatives','ad_performance',
    'conversations','messages','agent_tasks','alerts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_org_member(organization_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (can_write_org(organization_id))', t || '_ins', t);
    execute format('create policy %I on %I for update using (can_write_org(organization_id)) with check (can_write_org(organization_id))', t || '_upd', t);
  end loop;
end $$;

-- Solo lectura desde el cliente (se escriben por funciones/servicio):
do $$ declare t text; begin
  foreach t in array array['inventory','inventory_movements','listing_status_history','agent_executions',
    'audit_logs','sync_runs','agent_definitions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_org_member(organization_id))', t || '_read', t);
  end loop;
end $$;

-- Aprobaciones: leen miembros; deciden solo owner/admin.
alter table approvals enable row level security;
create policy approvals_read on approvals for select using (is_org_member(organization_id));
create policy approvals_decide on approvals for update using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

-- Integraciones: solo admins ven la configuración; secret_ref nunca se expone a clientes.
alter table integrations enable row level security;
create policy integrations_admin_read on integrations for select using (is_org_admin(organization_id));
revoke select (secret_ref) on integrations from authenticated, anon;

-- Ajustes de stock desde el panel: pasan por la función (valida pertenencia).
create function panel_inventory_movement(p_org uuid, p_variant uuid, p_type inventory_movement_type,
  p_qty int, p_reason text, p_reference text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not can_write_org(p_org) then raise exception 'sin permiso'; end if;
  if p_type = 'source_sync' then raise exception 'source_sync es exclusivo del sincronizador'; end if;
  return apply_inventory_movement(p_org, p_variant, p_type, p_qty, null, p_reason, p_reference,
                                  p_idempotency_key, 'user:' || auth.uid()::text);
end $$;
revoke execute on function apply_inventory_movement from public, anon, authenticated;
grant execute on function panel_inventory_movement to authenticated;
