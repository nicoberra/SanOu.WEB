// Validación "no inventar": todo número/medida que aparezca en un texto comercial generado debe
// existir en la ficha real del producto (specs, nombre, descripción) o ser el precio real.
// Se usa para títulos, descripciones y respuestas antes de mostrarlas o aprobarlas.

const NUM = /\d+(?:[.,]\d+)?/g;
const normNum = s => s.replace(/\./g, '').replace(',', '.');

export function productFacts(product) {
  const text = [product.name, product.description, product.sku, product.badge,
    ...(product.specs || []).flatMap(s => [s.label, s.value])].filter(Boolean).join(' ');
  const nums = new Set((text.match(NUM) || []).flatMap(n => [n, normNum(n)]));
  if (product.price) { nums.add(String(product.price)); nums.add(Number(product.price).toLocaleString('es-AR')); nums.add(normNum(Number(product.price).toLocaleString('es-AR'))); }
  return { text: text.toLowerCase(), nums };
}

// Palabras de promesa que el sistema no puede garantizar sin datos verificados.
const RISKY = [/envío gratis/i, /garant[ií]a de \d+/i, /entrega (inmediata|en el d[ií]a|en \d+ ?h)/i, /últimas? unidades/i, /descuento/i, /\d+ ?% off/i, /stock garantizado/i];

export function validateGrounded(text, product, { stockKnown = false } = {}) {
  const facts = productFacts(product);
  const issues = [];
  for (const n of String(text).match(NUM) || []) {
    if (!facts.nums.has(n) && !facts.nums.has(normNum(n)) && !/^[1-5]$/.test(n)) issues.push({ type: 'dato_no_verificado', value: n });
  }
  for (const re of RISKY) if (re.test(text)) issues.push({ type: 'promesa_no_verificada', value: String(text.match(re)[0]) });
  if (!stockKnown && /(hay stock|en stock|disponible ya)/i.test(text)) issues.push({ type: 'stock_no_verificado', value: 'stock' });
  return { ok: issues.length === 0, issues };
}
