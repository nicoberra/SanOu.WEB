// Capa de IA independiente del proveedor. Los agentes piden "completar" con un rol y un prompt;
// el proveedor concreto (Claude, OpenAI, Gemini u offline) es configuración, no arquitectura.
// Controles: presupuesto diario por organización y registro de costo por ejecución.
import { DomainError } from '../core/util.js';
import { OfflineProvider } from './providers/offline.js';
import { AnthropicProvider } from './providers/anthropic.js';

const PLANNED = { openai: 'OpenAI', gemini: 'Gemini' };

export function createAiProvider(cfg) {
  const p = cfg.ai.provider;
  if (p === 'anthropic') return new AnthropicProvider(cfg.ai);
  if (PLANNED[p]) throw new Error(`Proveedor ${PLANNED[p]} previsto en la interfaz pero todavía no implementado. Usá AI_PROVIDER=anthropic u offline.`);
  return new OfflineProvider();
}

// Envoltorio con tope de gasto diario por organización (en memoria del proceso + lo registrado en ejecuciones).
export class BudgetedAi {
  constructor(provider, dailyBudgetUsd) { this.provider = provider; this.daily = dailyBudgetUsd; this.spent = new Map(); }
  get name() { return this.provider.name; }
  get available() { return this.provider.available; }
  async complete(orgId, req) {
    const day = new Date().toISOString().slice(0, 10), key = `${orgId}:${day}`;
    const spent = this.spent.get(key) || 0;
    if (spent >= this.daily) throw new DomainError('presupuesto_ia', `Se alcanzó el tope diario de IA (USD ${this.daily}) para esta empresa`, 429);
    const r = await this.provider.complete(req);
    this.spent.set(key, spent + (r.costUsd || 0));
    return r;
  }
}
