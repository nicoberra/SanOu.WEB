// Proveedor Claude (Anthropic) mediante el SDK oficial @anthropic-ai/sdk (instalación opcional:
// `npm i @anthropic-ai/sdk` dentro de meta-commerce/). La clave se toma de ANTHROPIC_API_KEY.
const PRICE_PER_MTOK = { // USD (entrada, salida) — tabla de precios publicada; actualizar si cambia
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
};

export class AnthropicProvider {
  name = 'anthropic';
  available = true;
  constructor({ model, effort }) { this.model = model || 'claude-opus-5-5'; this.effort = effort || 'medium'; this.client = null; }

  async getClient() {
    if (this.client) return this.client;
    let mod;
    try { mod = await import('@anthropic-ai/sdk'); }
    catch { throw new Error('Falta el SDK de Anthropic: ejecutá `npm i @anthropic-ai/sdk` en meta-commerce/'); }
    const Anthropic = mod.default;
    this.client = new Anthropic();
    return this.client;
  }

  async complete({ system, prompt, maxTokens = 16000 }) {
    const client = await this.getClient();
    const response = await client.beta.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: this.effort },
      // Si un clasificador de seguridad rechaza el pedido, Anthropic reintenta con el modelo recomendado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') {
      return { text: null, refused: true, costUsd: this.cost(response.usage), provider: this.name };
    }
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, costUsd: this.cost(response.usage), provider: this.name, model: response.model };
  }

  cost(usage) {
    const [i, o] = PRICE_PER_MTOK[this.model] || [0, 0];
    return usage ? ((usage.input_tokens || 0) * i + (usage.output_tokens || 0) * o) / 1e6 : 0;
  }
}
