// Ensambla el sistema: configuración, almacenamiento, IA, agentes y servicios por organización.
import { loadConfig } from './config.js';
import { createStore } from './store/index.js';
import { scoped } from './store/scoped.js';
import { InventoryService } from './services/inventory.js';
import { enqueueTask } from './services/tasks.js';
import { createAiProvider, BudgetedAi } from './ai/index.js';
import { createHandlers } from './agents/handlers.js';
import { AGENT_DEFINITIONS } from './agents/definitions.js';
import { CHANNEL_CAPABILITIES } from './connectors/meta/capabilities.js';
import crypto from 'node:crypto';
import { now } from './core/util.js';

export function createRuntime(overrides = {}) {
  const cfg = { ...loadConfig(), ...overrides };
  const store = overrides.storeInstance || createStore(cfg);
  const ai = new BudgetedAi(createAiProvider(cfg), cfg.ai.dailyBudgetUsd);
  const handlers = createHandlers({ cfg, ai });
  const forOrg = orgId => {
    const db = scoped(store, orgId);
    const inventory = new InventoryService(db, { enqueueTask: t => enqueueTask(db, t) });
    return { db, inventory, orgId };
  };
  return { cfg, store, ai, handlers, forOrg };
}

// Alta idempotente de una organización con sus canales, cuentas y agentes.
export async function bootstrapOrganization(rt, { slug, name, websiteUrl }) {
  let org = await rt.store.findOne('organizations', { slug });
  if (!org) org = await rt.store.insert('organizations', { slug, name, website_url: websiteUrl, currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires',
    settings: { limits: { ads_daily_spend_cap: 0, ads_total_spend_cap: 0, auto_messages: false }, sync: { catalog_every_min: rt.cfg.sync.catalogEveryMin } }, updated_at: now() });
  if (!org.settings?.feed_key) {   // clave del feed de catálogo (URL privada que se carga en Commerce Manager)
    org = await rt.store.update('organizations', org.id, { settings: { ...org.settings, feed_key: crypto.randomBytes(18).toString('base64url') } });
  }
  const { db } = rt.forOrg(org.id);
  const channels = [
    ['marketplace_personal', 'Facebook Marketplace (perfil)', null, 'Perfil del operador de San Ou'],
    ['meta_catalog', 'Catálogo de Meta (Commerce Manager)', rt.cfg.meta.catalogId || null, 'Catálogo San Ou'],
    ['messenger_page', 'Messenger de la página', rt.cfg.meta.pageId || null, 'Página San Ou'],
    ['meta_ads', 'Meta Ads', rt.cfg.meta.adAccountId || null, 'Cuenta publicitaria San Ou'],
  ];
  for (const [kind, chName, extId, display] of channels) {
    const cap = CHANNEL_CAPABILITIES[kind];
    const { row: ch } = await db.upsert('sales_channels', { kind, name: chName, capabilities: { publish: cap.publish, deactivate: cap.deactivate, messages: cap.messages }, enabled: true }, ['kind', 'name']);
    const acc = await db.findOne('channel_accounts', { channel_id: ch.id });
    if (!acc) await db.insert('channel_accounts', { channel_id: ch.id, integration_id: null, external_id: extId, display_name: display, status: 'active' });
    else if (extId && acc.external_id !== extId) await db.update('channel_accounts', acc.id, { external_id: extId });
  }
  for (const a of AGENT_DEFINITIONS) {
    const { implemented, stage, ...def } = a;
    await db.upsert('agent_definitions', { ...def, enabled: true, version: 1 }, ['name']);
  }
  return org;
}
