import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, bootstrapOrganization } from '../src/runtime.js';
import { loadConfig } from '../src/config.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Runtime en memoria, sin red, leyendo las fichas reales del repo de San Ou.
export async function testRuntime(extra = {}) {
  const base = loadConfig();
  const rt = createRuntime({ store: 'memory', adminToken: 'test-token', sanou: { ...base.sanou, localRepo: REPO, pricesMode: 'offline' },
    meta: { ...base.meta, writeEnabled: false, systemUserToken: '', appSecret: 'app-secret-test', webhookVerifyToken: 'verify-test' },
    agency: { sharedSecret: 'agency-secret-test', callbackUrl: '' }, ai: { ...base.ai, provider: 'offline' }, ...extra });
  const org = await bootstrapOrganization(rt, { slug: 'sanou', name: 'San Ou', websiteUrl: 'https://sanou.com.ar' });
  return { rt, org, ...rt.forOrg(org.id) };
}

// Datos de PRUEBA (no reales) para simular lo que devolvería la planilla de precios.
export function fakeItem(over = {}) {
  return { external_id: 'T1', sku: 'TEST-1', name: 'Producto de prueba', brand: 'San Ou', category: 'Crimpadoras', categories: ['pinzas'],
    description: 'Descripción de prueba', specs: [{ label: 'Modelo', value: 'TEST-1' }, { label: 'Rango', value: '16–300 mm²' }],
    source_url: 'https://sanou.com.ar/producto/test-1.html', media: ['https://sanou.com.ar/productos/test/1.jpg'],
    price: 100000, compare_at_price: null, badge: null, featured: false, low_stock_hint: false, sheet_name: 'Producto de prueba',
    stock: { inStock: true, units: null }, ...over };
}
export const fetched = items => ({ items, pricesLoaded: true, pricesError: null, origin: 'test' });
