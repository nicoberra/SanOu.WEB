import path from 'node:path';
import { FileStore } from './file-store.js';
import { SupabaseStore } from './supabase-store.js';

export function createStore(cfg) {
  if (cfg.store === 'supabase') return new SupabaseStore({ url: cfg.supabase.url, serviceKey: cfg.supabase.serviceKey });
  if (cfg.store === 'memory') return new FileStore(null);
  return new FileStore(path.join(cfg.dataDir, 'db.json'));
}
