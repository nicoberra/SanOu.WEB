-- ═══════════════════════════════════════════════════════════════════════════════════════
-- SanOu · Esquema inicial en Supabase (migración desde Google Sheets)
-- Proyecto en South America (São Paulo) · sa-east-1
--
-- Criterios:
--  * Cada tabla espeja una pestaña de la planilla con las MISMAS claves que usa el backend
--    (TABS en apps-script-crm.gs), así el Apps Script puede cambiar de fuente sin tocar el CRM.
--  * Los ids se conservan tal cual (texto "r1788…") → nada se re-numera ni se pierde la relación
--    pedido ↔ cliente por clienteid (regla ERR-SAN-006: relacionar por ID, nunca por nombre).
--  * Fechas como timestamptz y montos como bigint (pesos, sin decimales); el resto en texto.
--  * RLS ACTIVADO en todas las tablas y SIN permisos para anon/authenticated:
--    solo el backend (Apps Script con la clave secreta, que saltea RLS) lee y escribe.
--    Desde 2026 las tablas nuevas no se exponen solas a la Data API; si algún día la web
--    lee directo (ej. precios), se agrega un GRANT puntual + política de solo lectura.
-- ═══════════════════════════════════════════════════════════════════════════════════════

create schema if not exists sanou;   -- esquema propio (no expuesto a la Data API)

-- ── Clientes / usuarios ────────────────────────────────────────────────────────────────
create table sanou.clientes (
  id          text primary key,
  fecha       timestamptz not null default now(),
  nombre      text not null default '',
  telefono    text not null default '',
  email       text not null default '',
  empresa     text not null default '',
  ciudad      text not null default '',
  notas       text not null default '',
  razon       text not null default '',
  cuit        text not null default '',
  direccion   text not null default '',
  origen      text not null default '',
  clave       text not null default '',          -- hash de la clave de la cuenta web (nunca texto plano)
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index clientes_telefono_idx on sanou.clientes (right(regexp_replace(telefono, '\D', '', 'g'), 10));
create index clientes_email_idx on sanou.clientes (lower(email));

-- ── Cotizaciones ───────────────────────────────────────────────────────────────────────
create table sanou.cotizaciones (
  id          text primary key,
  fecha       timestamptz not null default now(),
  cliente     text not null default '',
  telefono    text not null default '',
  detalle     text not null default '',
  monto       bigint,
  estado      text not null default 'Abierta',
  notas       text not null default '',
  clienteid   text references sanou.clientes(id) on delete set null,
  utmsource   text not null default '',
  utmmedium   text not null default '',
  utmcampaign text not null default '',
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index cotizaciones_fecha_idx on sanou.cotizaciones (fecha desc);
create index cotizaciones_clienteid_idx on sanou.cotizaciones (clienteid);

-- ── Pedidos (manuales y de la web) ─────────────────────────────────────────────────────
create table sanou.pedidos (
  id           text primary key,
  fecha        timestamptz not null default now(),
  cliente      text not null default '',
  telefono     text not null default '',
  detalle      text not null default '',
  monto        bigint,
  estado       text not null default 'Pendiente',
  notas        text not null default '',
  envio        text not null default '',
  enviocobrado text not null default '',
  enviomonto   bigint,
  clienteid    text references sanou.clientes(id) on delete set null,
  origen       text not null default '',           -- 'web' = compra en sanou.com.ar
  pago         text not null default '',
  pagoestado   text not null default '',
  pagodet      text not null default '',
  items        jsonb,                              -- carrito de la web (JSON)
  email        text not null default '',
  dni          text not null default '',
  entrega      text not null default '',
  direccion    text not null default '',
  comprobante  text not null default '',           -- id del archivo en Drive (privado)
  mpid         text not null default '',           -- id de pago de Mercado Pago
  factura      text not null default '',
  utmsource    text not null default '',
  utmmedium    text not null default '',
  utmcampaign  text not null default '',
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index pedidos_fecha_idx on sanou.pedidos (fecha desc);
create index pedidos_clienteid_idx on sanou.pedidos (clienteid);
create index pedidos_web_idx on sanou.pedidos (fecha desc) where origen = 'web';
create unique index pedidos_mpid_idx on sanou.pedidos (mpid) where mpid <> '';   -- un pago de MP = un pedido

-- ── Leads de Instagram (página lista.html) ─────────────────────────────────────────────
create table sanou.leads (
  id          text primary key,
  fecha       timestamptz not null default now(),
  nombre      text not null default '',
  whatsapp    text not null default '',
  rubro       text not null default '',
  trabajo     text not null default '',
  utmsource   text not null default '',
  utmmedium   text not null default '',
  utmcampaign text not null default '',
  pagina      text not null default '',
  estado      text not null default 'Nuevo',
  clienteid   text references sanou.clientes(id) on delete set null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index leads_fecha_idx on sanou.leads (fecha desc);
create index leads_whatsapp_idx on sanou.leads (right(regexp_replace(whatsapp, '\D', '', 'g'), 10));

-- ── Seguimientos ───────────────────────────────────────────────────────────────────────
create table sanou.seguimientos (
  id          text primary key,
  fecha       timestamptz not null default now(),
  cliente     text not null default '',
  telefono    text not null default '',
  motivo      text not null default '',
  objetivo    text not null default '',
  estado      text not null default '',
  notas       text not null default '',
  clienteid   text references sanou.clientes(id) on delete set null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- ── Precios (planilla de precios: lo que hoy sale en el CSV "catalogo") ─────────────────
create table sanou.precios (
  nombre      text primary key,                    -- nombre del producto (sheetName del catálogo)
  precio      bigint,                              -- precio por transferencia
  stock       boolean not null default true,
  precio_ml   bigint,                              -- precio de Mercado Libre (tachado)
  destacado   boolean not null default false,
  costo_usd   numeric(12,2),                       -- costo en dólares (para la ganancia del CRM)
  cantidad    integer,                             -- unidades en stock (null = sin dato)
  actualizado timestamptz not null default now()
);

-- ── Lista mayorista (planilla mayorista) ───────────────────────────────────────────────
create table sanou.mayorista (
  orden      integer primary key,                  -- posición en la lista (mantiene categorías y orden)
  tipo       text not null check (tipo in ('cat', 'prod')),
  producto   text not null default '',
  minimo     text not null default '',
  mayorista  text not null default '',
  unitario   text not null default '',
  nota       text not null default '',
  actualizado timestamptz not null default now()
);

-- ── Eventos de la web (visitas, carritos, compras) ─────────────────────────────────────
create table sanou.eventos (
  id         bigint generated always as identity primary key,
  fecha      timestamptz not null default now(),
  tipo       text not null,
  item       text not null default '',
  sesion     text not null default '',
  fuente     text not null default '',
  contacto   text not null default '',
  monto      bigint,
  pais       text not null default '',
  region     text not null default '',
  ciudad     text not null default '',
  dispositivo text not null default '',
  so         text not null default '',
  navegador  text not null default '',
  idioma     text not null default '',
  pantalla   text not null default ''
);
create index eventos_fecha_idx on sanou.eventos (fecha desc);
create index eventos_tipo_idx on sanou.eventos (tipo, fecha desc);

-- ── Registro de errores del backend (pestaña Logs) ─────────────────────────────────────
create table sanou.logs (
  id      bigint generated always as identity primary key,
  fecha   timestamptz not null default now(),
  accion  text not null default '',
  error   text not null default '',
  detalle jsonb
);
create index logs_fecha_idx on sanou.logs (fecha desc);

-- ── "actualizado" se mantiene solo ─────────────────────────────────────────────────────
create or replace function sanou.tocar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin new.actualizado := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['clientes','cotizaciones','pedidos','leads','seguimientos','precios','mayorista'] loop
    execute format('create trigger %I before update on sanou.%I for each row execute function sanou.tocar_actualizado()', t || '_actualizado', t);
  end loop;
end $$;

-- ── Seguridad: RLS en todo y nada para los roles públicos ──────────────────────────────
do $$ declare t text; begin
  foreach t in array array['clientes','cotizaciones','pedidos','leads','seguimientos','precios','mayorista','eventos','logs'] loop
    execute format('alter table sanou.%I enable row level security', t);
    execute format('revoke all on sanou.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on schema sanou from anon, authenticated;
revoke all on all functions in schema sanou from public, anon, authenticated;
-- El backend usa la clave secreta (rol service_role): necesita uso del esquema y de las tablas.
grant usage on schema sanou to service_role;
grant all on all tables in schema sanou to service_role;
grant usage, select on all sequences in schema sanou to service_role;
