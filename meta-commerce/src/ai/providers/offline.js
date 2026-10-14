// Proveedor sin modelo: no genera texto libre. Los agentes usan plantillas deterministas basadas
// solo en datos reales de la ficha. Permite operar y probar sin claves ni costo.
export class OfflineProvider {
  name = 'offline';
  available = false;
  async complete() { return { text: null, costUsd: 0, provider: 'offline' }; }
}
