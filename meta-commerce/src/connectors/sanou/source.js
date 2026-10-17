// Conector de SOLO LECTURA al e-commerce de San Ou. No modifica nada del sitio ni de la planilla.
//
// Auditoría del sitio (oct-2026): sanou.com.ar es un sitio estático (GitHub Pages) con backend en
// Google Apps Script + Google Sheets. No hay API REST ni base SQL. La forma estructurada y autorizada
// de obtener el catálogo es la MISMA que usa el propio sitio:
//   1) Fichas (nombre, categoría, descripción, especificaciones, fotos): catalogo-productos.js,
//      la "fuente única" que también usan la tienda, el panel y las páginas SEO.
//   2) Precio / stock / destacado: acción pública "catalogo" del Apps Script, que devuelve SOLO
//      columnas públicas (sin costos) en CSV: Nombre, Precios, Stock, Precio anterior, DESTACADO.
// No se hace scraping de HTML.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Evalúa catalogo-productos.js en un contexto aislado (sin require/process/red) y con tiempo límite.
// El archivo es de San Ou (mismo dominio/repositorio): solo define window.SANOU_PRODUCTOS y SANOU_CAT_NAMES.
export function parseProductDefinitions(code) {
  const sandbox = { window: {} };
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(code, { filename: 'catalogo-productos.js' }).runInContext(sandbox, { timeout: 1000 });
  const products = sandbox.window.SANOU_PRODUCTOS;
  if (!Array.isArray(products) || !products.length) throw new Error('catalogo-productos.js no definió SANOU_PRODUCTOS');
  // Copia "limpia" (JSON) para que no queden referencias al contexto aislado.
  return JSON.parse(JSON.stringify({ products, catNames: sandbox.window.SANOU_CAT_NAMES || {} }));
}

export async function loadProductDefinitions({ siteUrl, localRepo }) {
  if (localRepo) {
    const f = path.join(localRepo, 'catalogo-productos.js');
    return { ...parseProductDefinitions(fs.readFileSync(f, 'utf8')), origin: 'repo-local' };
  }
  const res = await fetch(`${siteUrl}/catalogo-productos.js`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'SanOu-MetaCommerce/0.1 (+sync de catálogo propio)' } });
  if (!res.ok) throw new Error(`No se pudo leer catalogo-productos.js (HTTP ${res.status})`);
  return { ...parseProductDefinitions(await res.text()), origin: `${siteUrl}/catalogo-productos.js` };
}

// ── CSV de precios ─────────────────────────────────────────────────────────
export function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const money = s => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return n > 0 ? n : null; };
const boolish = s => { const v = norm(s); if (!v) return null; if (['true', 'si', 'sí', '1', 'verdadero'].includes(v)) return true; if (['false', 'no', '0', 'falso'].includes(v)) return false; return null; };

// Columnas por encabezado (con respaldo a las posiciones fijas que usa el sitio: 0..4).
// Si algún día la planilla suma "Stock unidades", se usa automáticamente (inventario por unidades).
export function parsePriceSheet(csv) {
  const lines = String(csv).replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return new Map();
  const head = parseCsvLine(lines[0]).map(norm);
  const col = (re, fallback) => { const i = head.findIndex(h => re.test(h)); return i >= 0 ? i : fallback; };
  const iName = col(/^nombre/, 0), iPrice = col(/^precios?$/, 1), iStock = col(/^stock$/, 2),
        iOld = col(/anterior|mercado ?libre/, 3), iFeat = col(/destacad/, 4), iUnits = col(/unidades|cantidad/, -1);
  const map = new Map();
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const name = (f[iName] || '').trim();
    if (!name) continue;
    const units = iUnits >= 0 && f[iUnits] !== undefined && String(f[iUnits]).trim() !== '' ? parseInt(f[iUnits], 10) : null;
    map.set(norm(name), {
      name, price: money(f[iPrice]), oldPrice: money(f[iOld]), inStock: boolish(f[iStock]),
      featured: boolish(f[iFeat]) === true, units: Number.isInteger(units) && units >= 0 ? units : null,
    });
  }
  return map;
}

export async function loadPriceSheet({ catalogExecUrl }) {
  if (!catalogExecUrl) throw new Error('SANOU_CATALOG_EXEC_URL no configurada');
  const url = `${catalogExecUrl}?action=catalogo&tab=Clientes`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!res.ok) throw new Error(`Backend de catálogo respondió HTTP ${res.status}`);
  const j = await res.json();
  if (!j || !j.ok || typeof j.csv !== 'string') throw new Error((j && j.error) || 'El backend no devolvió el catálogo');
  return parsePriceSheet(j.csv);
}

// Mismo slug que usan las fichas SEO del sitio (gen-seo-paginas.js) → URL real del producto.
export const siteSlug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function imagePaths(p) {
  if (!p.imgs) return [];
  const cat = p.catFolder || p.category, folder = p.folder || p.name;
  const files = Array.isArray(p.imgs) ? p.imgs : Array.from({ length: p.imgs }, (_, i) => `${i + 1}.${p.ext || 'jpg'}`);
  return files.map(f => `productos/${cat}/${folder}/${f}`);
}

// Normaliza una ficha del sitio al modelo maestro. NO inventa datos: lo que no está, queda null.
export function normalizeProduct(p, { catNames, siteUrl, priceRow }) {
  const specs = (p.allSpecs && p.allSpecs.length ? p.allSpecs : p.specs || []).map(s => ({ label: String(s.l), value: String(s.v) }));
  // Modelo: el de la ficha; si no está, el código que figura en el propio nombre (ej. "Cilindro Hidráulico HHYG-10D").
  const model = specs.find(s => /^modelo$/i.test(s.label))?.value || (p.name.match(/\b[A-Z]{2,}[A-Z0-9]*-\d+[A-Z0-9-]*\b/) || [])[0] || null;
  let price = null, compareAt = null;
  if (priceRow) {
    if (priceRow.price && priceRow.oldPrice) { price = priceRow.price; compareAt = priceRow.oldPrice; }
    else price = priceRow.price || priceRow.oldPrice || null;
  }
  return {
    external_id: String(p.id),
    sku: model,                                   // el sitio identifica por modelo; si no hay, sin SKU (no se inventa)
    name: p.name,
    brand: 'San Ou',
    category: catNames[p.category] || p.category,
    categories: [p.category, ...(p.extraCategories || [])],
    description: p.desc || null,
    specs,
    source_url: `${siteUrl}/producto/${siteSlug(p.name)}-${p.id}.html`,
    media: imagePaths(p).map(rel => `${siteUrl}/${rel.split('/').map(encodeURIComponent).join('/')}`),
    price, compare_at_price: compareAt,
    badge: p.badge || null, featured: !!priceRow?.featured, low_stock_hint: !!p.lowStock,
    stock: priceRow ? { inStock: priceRow.inStock, units: priceRow.units } : null,
    sheet_name: p.sheetName || p.name,
  };
}
