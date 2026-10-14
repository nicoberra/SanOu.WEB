// Configuración central. Lee variables de entorno (y un archivo .env opcional, sin dependencias).
// Los secretos solo viven en el proceso del servidor/worker: nunca se envían al panel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv(path.join(ROOT, '.env'));

const env = (k, d = '') => (process.env[k] ?? d);
const bool = (k, d = false) => { const v = process.env[k]; return v === undefined || v === '' ? d : /^(1|true|si|yes)$/i.test(v); };
const num = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && process.env[k] !== '' ? v : d; };

export function loadConfig() {
  return {
    port: num('PORT', 8787),
    adminToken: env('ADMIN_TOKEN'),
    store: env('STORE', 'file'),
    dataDir: path.resolve(ROOT, env('DATA_DIR', '.data')),
    supabase: { url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), jwtSecret: env('SUPABASE_JWT_SECRET') },
    sanou: {
      siteUrl: env('SANOU_SITE_URL', 'https://sanou.com.ar').replace(/\/$/, ''),
      catalogExecUrl: env('SANOU_CATALOG_EXEC_URL'),
      localRepo: env('SANOU_LOCAL_REPO') ? path.resolve(ROOT, env('SANOU_LOCAL_REPO')) : '',
      pricesMode: env('SANOU_PRICES_MODE', 'online'),
    },
    sync: { catalogEveryMin: num('CATALOG_SYNC_EVERY_MIN', 30) },
    meta: {
      graphVersion: env('META_GRAPH_VERSION', 'v26.0'),
      writeEnabled: bool('META_WRITE_ENABLED', false),
      appId: env('META_APP_ID'), appSecret: env('META_APP_SECRET'),
      systemUserToken: env('META_SYSTEM_USER_TOKEN'), catalogId: env('META_CATALOG_ID'),
      pageId: env('META_PAGE_ID'), pageToken: env('META_PAGE_ACCESS_TOKEN'),
      adAccountId: env('META_AD_ACCOUNT_ID'), webhookVerifyToken: env('META_WEBHOOK_VERIFY_TOKEN'),
    },
    agency: { sharedSecret: env('AGENCY_SHARED_SECRET'), callbackUrl: env('AGENCY_CALLBACK_URL') },
    ai: {
      provider: env('AI_PROVIDER', 'offline'), model: env('AI_MODEL', 'claude-opus-5-5'),
      effort: env('AI_EFFORT', 'medium'), dailyBudgetUsd: num('AI_DAILY_BUDGET_USD', 2),
      anthropicKeyPresent: !!env('ANTHROPIC_API_KEY'),
    },
  };
}

// Vista segura de la configuración para el panel: dice QUÉ está configurado, nunca los valores secretos.
export function publicConfig(cfg) {
  const has = v => !!v;
  return {
    store: cfg.store,
    sanou: { siteUrl: cfg.sanou.siteUrl, backend: has(cfg.sanou.catalogExecUrl), pricesMode: cfg.sanou.pricesMode, localRepo: has(cfg.sanou.localRepo) },
    sync: cfg.sync,
    meta: {
      graphVersion: cfg.meta.graphVersion, writeEnabled: cfg.meta.writeEnabled,
      app: has(cfg.meta.appId) && has(cfg.meta.appSecret), systemUserToken: has(cfg.meta.systemUserToken),
      catalogId: has(cfg.meta.catalogId), page: has(cfg.meta.pageId) && has(cfg.meta.pageToken),
      adAccount: has(cfg.meta.adAccountId), webhook: has(cfg.meta.webhookVerifyToken),
    },
    agency: { signedRequests: has(cfg.agency.sharedSecret), callback: has(cfg.agency.callbackUrl) },
    ai: { provider: cfg.ai.provider, model: cfg.ai.model, effort: cfg.ai.effort, dailyBudgetUsd: cfg.ai.dailyBudgetUsd, keyConfigured: cfg.ai.anthropicKeyPresent },
  };
}
