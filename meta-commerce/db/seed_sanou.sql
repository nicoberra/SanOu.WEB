-- Datos iniciales: organización San Ou, canales y agentes.
-- El catálogo NO se carga aquí: lo importa el sincronizador desde sanou.com.ar.
insert into organizations (slug, name, website_url, settings) values
  ('sanou', 'San Ou', 'https://sanou.com.ar',
   '{"limits":{"ads_daily_spend_cap":0,"ads_total_spend_cap":0,"auto_messages":false},"sync":{"catalog_every_min":30}}')
on conflict (slug) do nothing;

insert into sales_channels (organization_id, kind, name, capabilities)
select o.id, c.kind, c.name, c.cap::jsonb from organizations o,
 (values
   ('marketplace_personal','Facebook Marketplace (perfil)','{"publish":"manual","deactivate":"manual","messages":"suggested"}'),
   ('meta_catalog','Catálogo de Meta (Commerce Manager)','{"publish":"api","deactivate":"api","messages":"none"}'),
   ('messenger_page','Messenger de la página San Ou','{"publish":"none","deactivate":"none","messages":"api"}'),
   ('meta_ads','Meta Ads','{"publish":"api","deactivate":"api","messages":"none"}')
 ) as c(kind, name, cap)
where o.slug = 'sanou'
on conflict do nothing;
-- Las definiciones de agentes se siembran desde src/agents/definitions.js (fuente única).
