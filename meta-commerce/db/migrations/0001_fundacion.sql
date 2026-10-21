-- ════════════════════════════════════════════════════════════════════════════
-- Meta Commerce AI — Migración 0001: fundación (Etapa 1)
-- Postgres 15+ / Supabase. Multiempresa desde el diseño: TODA fila comercial
-- lleva organization_id y la RLS (0002) impide leer datos de otra empresa.
--
-- Principios:
--  * El sitio de cada empresa es la fuente del catálogo: products guarda una
--    COPIA SINCRONIZADA identificada por (organization_id, source, external_id).
--  * Un solo inventario por variante de producto. Las publicaciones NUNCA
--    tienen stock propio: apuntan a la variante y leen su inventario.
--  * Cambios de stock solo vía apply_inventory_movement() (atómico + historial).
--  * audit_logs es append-only (sin UPDATE/DELETE).
--  * Credenciales: jamás en texto plano. integrations.secret_ref apunta a
--    Supabase Vault (vault.secrets) y solo el service_role lo resuelve.
-- ════════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() es nativo desde Postgres 13 (no requiere extensiones).

-- ─── Empresas y usuarios ────────────────────────────────────────────────────
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null,
  website_url   text,
  currency      char(3) not null default 'ARS',
  timezone      text not null default 'America/Argentina/Buenos_Aires',
  settings      jsonb not null default '{}'::jsonb,   -- límites operativos, frecuencias, etc. (sin secretos)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create type org_role as enum ('owner', 'admin', 'operator', 'viewer');

create table organization_users (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null,                       -- auth.users.id (Supabase Auth)
  role            org_role not null default 'viewer',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index on organization_users (user_id);

-- ─── Catálogo ───────────────────────────────────────────────────────────────
create table products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source          text not null,                       -- ej. 'sanou_web'
  external_id     text not null,                       -- id en el sitio de origen
  sku             text,
  name            text not null,
  slug            text,
  brand           text,
  category        text,
  categories      text[] not null default '{}',
  description     text,
  specs           jsonb not null default '[]'::jsonb,  -- [{label, value}] tal cual la ficha (no se inventa nada)
  source_url      text,
  price           numeric(14,2),                       -- precio REAL publicado; null = sin precio publicado
  compare_at_price numeric(14,2),
  currency        char(3) not null default 'ARS',
  status          text not null default 'active' check (status in ('active','archived','missing_in_source')),
  content_hash    text not null,                       -- detección de cambios (sync incremental)
  source_payload  jsonb not null default '{}'::jsonb,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, source, external_id)
);
create index on products (organization_id, category);
create index on products (organization_id, status);
create unique index products_org_sku on products (organization_id, sku) where sku is not null;

create table product_media (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  url             text not null,                       -- URL pública original (no se duplican archivos)
  position        int not null default 0,
  alt             text,
  created_at      timestamptz not null default now(),
  unique (product_id, url)
);

create table product_variants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  sku             text,
  name            text not null default 'Única',
  attributes      jsonb not null default '{}'::jsonb,
  price_override  numeric(14,2),
  is_default      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index product_variants_one_default on product_variants (product_id) where is_default;
create index on product_variants (organization_id);

-- ─── Inventario (UNO por variante) ─────────────────────────────────────────
-- tracking_mode:
--   'flag'  → la fuente solo informa hay / no hay (hoy: columna Stock de la planilla San Ou)
--   'units' → unidades reales (on_hand). available = on_hand - reserved.
create table inventory (
  variant_id        uuid primary key references product_variants(id) on delete cascade,
  organization_id   uuid not null references organizations(id) on delete cascade,
  tracking_mode     text not null default 'flag' check (tracking_mode in ('flag','units')),
  source_in_stock   boolean,                           -- última lectura de la fuente (null = desconocido)
  on_hand           int check (on_hand is null or on_hand >= 0),
  reserved          int not null default 0 check (reserved >= 0),
  sold_total        int not null default 0 check (sold_total >= 0),
  low_stock_threshold int not null default 2,
  availability      text not null default 'unknown'
                    check (availability in ('in_stock','low_stock','out_of_stock','unknown')),
  version           bigint not null default 0,         -- control de concurrencia optimista
  updated_at        timestamptz not null default now(),
  check (tracking_mode = 'flag' or on_hand is not null),
  check (on_hand is null or reserved <= on_hand)
);
create index on inventory (organization_id, availability);

create type inventory_movement_type as enum
  ('source_sync','adjustment','reservation','reservation_release','sale','return','restock');

create table inventory_movements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  variant_id       uuid not null references product_variants(id) on delete cascade,
  type             inventory_movement_type not null,
  qty              int not null default 0,              -- delta (signo según tipo)
  source_in_stock  boolean,                             -- para source_sync en modo flag
  reason           text,
  reference        text,                                -- pedido, conversación, etc.
  idempotency_key  text,
  actor            text not null,                       -- 'user:<id>' | 'agent:<name>' | 'system:sync'
  before_state     jsonb not null,
  after_state      jsonb not null,
  created_at       timestamptz not null default now()
);
create unique index inventory_movements_idem on inventory_movements (organization_id, idempotency_key)
  where idempotency_key is not null;
create index on inventory_movements (variant_id, created_at desc);

-- ─── Canales y cuentas ─────────────────────────────────────────────────────
-- kind define QUÉ se puede hacer por API oficial (ver docs/META-APIS.md):
--   marketplace_personal → SIN API: cola de publicación manual/asistida
--   meta_catalog         → Catalog Batch API / feed programado (oficial)
--   messenger_page       → Messenger Platform (oficial, requiere App Review)
--   meta_ads             → Marketing API (oficial)
create table sales_channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            text not null check (kind in ('marketplace_personal','meta_catalog','messenger_page','instagram_dm','meta_ads','website')),
  name            text not null,
  capabilities    jsonb not null default '{}'::jsonb,  -- {publish:'manual'|'api'|'none', deactivate:..., messages:...}
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, kind, name)
);

create table integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        text not null,                       -- 'meta', 'anthropic', 'sanou_web', ...
  name            text not null,
  config          jsonb not null default '{}'::jsonb,  -- NO secretos (ids públicos, versión de API, etc.)
  secret_ref      uuid,                                -- vault.secrets.id; solo service_role
  status          text not null default 'not_configured'
                  check (status in ('not_configured','pending_review','active','error','disabled')),
  last_check_at   timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, provider, name)
);

create table channel_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel_id      uuid not null references sales_channels(id) on delete cascade,
  integration_id  uuid references integrations(id) on delete set null,
  external_id     text,                                -- page_id, catalog_id, act_<id>, perfil
  display_name    text not null,
  status          text not null default 'active' check (status in ('active','disabled','error')),
  created_at      timestamptz not null default now(),
  unique (channel_id, external_id)
);

-- ─── Publicaciones (Marketplace y catálogos) ───────────────────────────────
create type listing_status as enum (
  'borrador','pendiente_aprobacion','listo_para_publicar','publicado',
  'pendiente_actualizacion','pendiente_desactivacion','desactivado','error');

create table marketplace_listings (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  channel_account_id uuid not null references channel_accounts(id) on delete restrict,
  product_id         uuid not null references products(id) on delete restrict,
  variant_id         uuid not null references product_variants(id) on delete restrict,
  active_creative_id uuid,
  status             listing_status not null default 'borrador',
  blocked_reason     text,                             -- ej. 'sin_stock' (no puede pasar a publicado)
  external_id        text,
  external_url       text,
  -- precio y stock NO se guardan aquí: se leen del producto/inventario (vista listing_overview)
  inquiries_count    int not null default 0,
  pending_actions    jsonb not null default '[]'::jsonb,
  last_reviewed_at   timestamptz,
  published_at       timestamptz,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Política anti-duplicados: UNA publicación viva por variante y cuenta.
-- Las variantes creativas viven en listing_creatives (para pruebas/anuncios), no como copias.
create unique index marketplace_listings_one_live
  on marketplace_listings (channel_account_id, variant_id)
  where status not in ('desactivado','error');
create index on marketplace_listings (organization_id, status);
create index on marketplace_listings (product_id);

create table listing_creatives (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  angle            text not null,                      -- enfoque: 'electricistas', 'industria', ...
  audience         text,
  title            text not null,
  description      text not null,
  benefits         jsonb not null default '[]'::jsonb,
  media_urls       text[] not null default '{}',
  suggested_category text,
  call_to_action   text,
  grounding_report jsonb not null default '{}'::jsonb, -- validación contra la ficha real
  generated_by     text not null,                      -- 'agent:MarketplaceAgent/<provider>' | 'user:<id>'
  status           text not null default 'draft' check (status in ('draft','approved','rejected','archived')),
  created_at       timestamptz not null default now()
);
alter table marketplace_listings
  add constraint marketplace_listings_creative_fk foreign key (active_creative_id) references listing_creatives(id) on delete set null;

create table listing_status_history (
  id              bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id      uuid not null references marketplace_listings(id) on delete cascade,
  from_status     listing_status,
  to_status       listing_status not null,
  reason          text,
  actor           text not null,
  confirmed       boolean not null default false,      -- ¿la plataforma/operador confirmó el cambio?
  created_at      timestamptz not null default now()
);
create index on listing_status_history (listing_id, created_at desc);

-- ─── Publicidad (Etapa 4; modelo listo) ────────────────────────────────────
create table ad_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  channel_account_id uuid references channel_accounts(id) on delete set null,
  external_id        text,
  name               text not null,
  objective          text,
  status             text not null default 'propuesta'
                     check (status in ('propuesta','pendiente_aprobacion','aprobada','creada_pausada','activa','pausada','finalizada','rechazada','error')),
  budget_total       numeric(14,2),
  budget_daily       numeric(14,2),
  spend_cap          numeric(14,2),
  currency           char(3) not null default 'ARS',
  starts_at          timestamptz,
  ends_at            timestamptz,
  plan               jsonb not null default '{}'::jsonb, -- público, ubicaciones, KPIs, hipótesis
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on ad_campaigns (organization_id, status);

create table ad_creatives (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id     uuid not null references ad_campaigns(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  external_id     text,
  headline        text,
  primary_text    text,
  media_urls      text[] not null default '{}',
  status          text not null default 'draft',
  created_at      timestamptz not null default now()
);

create table ad_performance (
  id              bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  campaign_id     uuid not null references ad_campaigns(id) on delete cascade,
  date            date not null,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  spend           numeric(14,2) not null default 0,
  messages_started int not null default 0,
  conversions     int not null default 0,
  raw             jsonb not null default '{}'::jsonb,
  unique (campaign_id, date)
);

-- ─── Conversaciones (Etapa 3; modelo listo) ────────────────────────────────
create table conversations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  channel_account_id uuid references channel_accounts(id) on delete set null,
  external_thread_id text,
  customer_ref       text,                              -- id de plataforma (PSID); sin datos de más
  customer_name      text,
  product_id         uuid references products(id) on delete set null,
  listing_id         uuid references marketplace_listings(id) on delete set null,
  status             text not null default 'abierta' check (status in ('abierta','esperando_cliente','derivada','cerrada')),
  automation_mode    text not null default 'sugerida' check (automation_mode in ('sugerida','automatica')),
  last_customer_msg_at timestamptz,                     -- ventana de 24 h de Messenger
  purchase_intent    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (channel_account_id, external_thread_id)
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction       text not null check (direction in ('in','out','suggested')),
  body            text not null,
  external_id     text,
  sent_by         text,                                 -- 'customer' | 'user:<id>' | 'agent:FacebookSalesAgent'
  delivery_status text,
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- ─── Agentes, tareas, aprobaciones, auditoría ──────────────────────────────
create table agent_definitions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,                       -- FacebookDirectorAgent, MarketplaceAgent, ...
  role             text not null,
  instructions     text not null,
  allowed_tools    text[] not null default '{}',
  data_scopes      text[] not null default '{}',
  constraints      jsonb not null default '[]'::jsonb,
  approval_required text[] not null default '{}',       -- acciones que SIEMPRE requieren aprobación humana
  escalation_rules jsonb not null default '[]'::jsonb,
  ai_budget_usd_daily numeric(10,2) not null default 0,
  enabled          boolean not null default true,
  version          int not null default 1,
  updated_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create table agent_tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  parent_task_id   uuid references agent_tasks(id) on delete cascade,
  correlation_id   uuid not null default gen_random_uuid(),
  idempotency_key  text,
  source_system    text not null default 'meta-commerce', -- 'agency-orchestrator', 'panel', 'scheduler'
  requested_by     text not null,
  agent            text not null,
  type             text not null,
  priority         smallint not null default 3 check (priority between 1 and 5), -- 1 = urgente
  input            jsonb not null default '{}'::jsonb,
  result           jsonb,
  status           text not null default 'pendiente'
                   check (status in ('pendiente','en_progreso','esperando_aprobacion','completada','fallida','cancelada','no_disponible')),
  requires_approval boolean not null default false,
  attempts         int not null default 0,
  max_attempts     int not null default 3,
  run_after        timestamptz not null default now(),
  locked_until     timestamptz,
  last_error       text,
  callback_url     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create unique index agent_tasks_idem on agent_tasks (organization_id, idempotency_key) where idempotency_key is not null;
create index agent_tasks_queue on agent_tasks (status, run_after) where status = 'pendiente';
create index on agent_tasks (organization_id, created_at desc);

create table agent_executions (
  id              bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references agent_tasks(id) on delete cascade,
  attempt         int not null,
  status          text not null check (status in ('ok','error','skipped')),
  log             jsonb not null default '[]'::jsonb,
  ai_provider     text,
  ai_cost_usd     numeric(10,4) not null default 0,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index on agent_executions (task_id);

create table approvals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid references agent_tasks(id) on delete set null,
  action          text not null,                        -- 'listing.publish', 'ads.create_campaign', ...
  payload         jsonb not null,
  payload_hash    text not null,                        -- se aprueba ESTE payload exacto; si cambia, no vale
  requested_by    text not null,
  status          text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada','vencida','usada')),
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text,
  expires_at      timestamptz not null default now() + interval '7 days',
  created_at      timestamptz not null default now()
);
create index on approvals (organization_id, status);

create table audit_logs (
  id              bigserial primary key,
  organization_id uuid references organizations(id) on delete cascade,
  actor           text not null,
  action          text not null,
  entity          text,
  entity_id       text,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index on audit_logs (organization_id, created_at desc);

create table alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            text not null,                        -- 'agotado', 'repuesto', 'precio_cambiado', 'sync_error', ...
  severity        text not null default 'info' check (severity in ('info','warning','critical')),
  title           text not null,
  details         jsonb not null default '{}'::jsonb,
  product_id      uuid references products(id) on delete set null,
  status          text not null default 'abierta' check (status in ('abierta','vista','resuelta')),
  created_at      timestamptz not null default now()
);
create index on alerts (organization_id, status, created_at desc);

create table sync_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source          text not null,
  status          text not null check (status in ('running','ok','partial','error')),
  stats           jsonb not null default '{}'::jsonb,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index on sync_runs (organization_id, started_at desc);

-- ─── Auditoría inmutable ───────────────────────────────────────────────────
create function forbid_mutation() returns trigger language plpgsql as $$
begin raise exception '% es de solo-anexado', tg_table_name; end $$;
create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function forbid_mutation();
create trigger inventory_movements_append_only before update or delete on inventory_movements
  for each row execute function forbid_mutation();

-- ─── updated_at automático ─────────────────────────────────────────────────
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['organizations','products','product_variants','integrations',
    'marketplace_listings','ad_campaigns','conversations','agent_tasks'] loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ─── Movimiento de inventario atómico ──────────────────────────────────────
-- Única vía para cambiar stock. Bloquea la fila, valida, recalcula disponibilidad,
-- registra el movimiento con estado antes/después. Idempotente por clave.
create function apply_inventory_movement(
  p_org uuid, p_variant uuid, p_type inventory_movement_type, p_qty int,
  p_source_in_stock boolean, p_reason text, p_reference text,
  p_idempotency_key text, p_actor text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv inventory%rowtype; before jsonb; after jsonb; existing jsonb;
  avail int;
begin
  if p_idempotency_key is not null then
    select after_state into existing from inventory_movements
      where organization_id = p_org and idempotency_key = p_idempotency_key;
    if found then return jsonb_build_object('duplicate', true, 'state', existing); end if;
  end if;

  select * into inv from inventory where variant_id = p_variant and organization_id = p_org for update;
  if not found then raise exception 'inventario inexistente para la variante %', p_variant; end if;
  before := to_jsonb(inv);

  if p_type = 'source_sync' then
    inv.source_in_stock := p_source_in_stock;
    -- p_qty = unidades informadas por la fuente (null si solo informa hay/no hay)
    if p_qty is not null and p_qty >= 0 then
      inv.tracking_mode := 'units'; inv.on_hand := p_qty; inv.reserved := least(inv.reserved, p_qty);
    end if;
  elsif p_type in ('adjustment','restock','return') then
    inv.tracking_mode := 'units';
    inv.on_hand := coalesce(inv.on_hand, 0) + p_qty;
    if p_type = 'return' then inv.sold_total := greatest(inv.sold_total - abs(p_qty), 0); end if;
  elsif p_type = 'reservation' then
    if inv.tracking_mode <> 'units' then raise exception 'reservar requiere stock en unidades'; end if;
    inv.reserved := inv.reserved + abs(p_qty);
  elsif p_type = 'reservation_release' then
    inv.reserved := greatest(inv.reserved - abs(p_qty), 0);
  elsif p_type = 'sale' then
    if inv.tracking_mode <> 'units' then raise exception 'vender requiere stock en unidades'; end if;
    inv.on_hand := inv.on_hand - abs(p_qty);
    inv.reserved := greatest(inv.reserved - abs(p_qty), 0);
    inv.sold_total := inv.sold_total + abs(p_qty);
  end if;

  if inv.on_hand is not null and inv.on_hand < 0 then raise exception 'stock insuficiente'; end if;
  if inv.on_hand is not null and inv.reserved > inv.on_hand then raise exception 'reservas superan el stock'; end if;

  -- La fuente (el sitio) manda: si dice "sin stock", está agotado aunque haya unidades locales.
  if inv.source_in_stock is false then inv.availability := 'out_of_stock';
  elsif inv.tracking_mode = 'units' then
    avail := inv.on_hand - inv.reserved;
    inv.availability := case when avail <= 0 then 'out_of_stock'
                             when avail <= inv.low_stock_threshold then 'low_stock' else 'in_stock' end;
  elsif inv.source_in_stock is true then inv.availability := 'in_stock';
  else inv.availability := 'unknown';
  end if;

  inv.version := inv.version + 1; inv.updated_at := now();
  update inventory set tracking_mode = inv.tracking_mode, source_in_stock = inv.source_in_stock,
    on_hand = inv.on_hand, reserved = inv.reserved, sold_total = inv.sold_total,
    availability = inv.availability, version = inv.version, updated_at = inv.updated_at
    where variant_id = p_variant;
  after := to_jsonb(inv);

  insert into inventory_movements (organization_id, variant_id, type, qty, source_in_stock, reason,
    reference, idempotency_key, actor, before_state, after_state)
  values (p_org, p_variant, p_type, coalesce(p_qty,0), p_source_in_stock, p_reason, p_reference,
    p_idempotency_key, p_actor, before, after);

  return jsonb_build_object('duplicate', false, 'before', before, 'state', after);
end $$;

-- Vista: lo que ve el panel de publicaciones (precio y stock SIEMPRE del maestro)
create view listing_overview with (security_invoker = true) as
select l.*, p.name as product_name, p.sku, p.price, p.currency,
       i.availability, i.on_hand, i.reserved,
       case when i.tracking_mode = 'units' then i.on_hand - i.reserved end as available_units
from marketplace_listings l
join products p on p.id = l.product_id
join inventory i on i.variant_id = l.variant_id;
