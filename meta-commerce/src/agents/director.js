// FacebookDirectorAgent — planificador (Etapa 1: determinista y explicable).
// Convierte una instrucción ("Prepará una campaña para las crimpadoras San Ou") en un plan con
// productos REALES verificados (precio y stock) y subtareas para cada especialista.
// En la Etapa 5 el plan se enriquece con IA; la verificación de datos sigue siendo determinista.

const CATEGORY_WORDS = [
  [/crimp|pinza|engast|terminal/i, 'pinzas'], [/doblad|curvad/i, 'dobladoras'], [/corta ?hierro|varilla/i, 'cortahierro'],
  [/mordaza|morsa/i, 'mordazas'], [/bomba/i, 'bombas'], [/sacabocado/i, 'sacabocados'], [/cilindro|gato/i, 'cilindros'],
  [/barra|cobre|alumin/i, 'cortadoras'], [/extractor/i, 'extractores'], [/punzon/i, 'punzonadoras'], [/veh[ií]culo|auto|motor/i, 'motores'],
];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function parseInstruction(text) {
  const categories = [...new Set(CATEGORY_WORDS.filter(([re]) => re.test(text)).map(([, c]) => c))];
  const models = [...new Set((norm(text).match(/\b[A-Z]{2,}[A-Z]*-?\d+[A-Z0-9-]*\b/g) || []))];
  const m = text.match(/\$\s?([\d.]+(?:,\d+)?)/);
  const budget = m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
  const wantsAds = /campa|promocion|publicidad|anunci|ads|presupuesto/i.test(text);
  const wantsMarketplace = /marketplace|publicaci|publicar|campa|promocion/i.test(text);
  const wantsSales = /consulta|mensaje|atenci|respuesta|campa|promocion/i.test(text);
  return { categories, models, budget, wantsAds, wantsMarketplace, wantsSales };
}

export function selectProducts(parsed, products, inventoryByVariant, variantByProduct) {
  const matches = products.filter(p => p.status === 'active' && (
    parsed.models.some(mo => norm(p.sku) === mo || norm(p.name).includes(mo)) ||
    (!parsed.models.length && p.categories?.some(c => parsed.categories.includes(c)))));
  const ok = [], excluded = [];
  for (const p of matches) {
    const inv = inventoryByVariant.get(variantByProduct.get(p.id));
    const item = { product_id: p.id, name: p.name, sku: p.sku, price: p.price, availability: inv?.availability || 'unknown', url: p.source_url };
    if (item.availability === 'out_of_stock') excluded.push({ ...item, reason: 'agotado' });
    else if (!(p.price > 0)) excluded.push({ ...item, reason: 'sin precio publicado' });
    else ok.push(item);
  }
  return { ok, excluded };
}

export function buildPlan(instruction, parsed, selection) {
  const subtasks = [];
  if (!selection.ok.length) return { instruction, parsed, ...selection, subtasks, warnings: ['No hay productos vendibles que coincidan con la instrucción'] };
  const ids = selection.ok.map(p => p.product_id);
  if (parsed.wantsMarketplace) subtasks.push({ agent: 'MarketplaceAgent', type: 'marketplace.prepare_angles', priority: 2, input: { product_ids: ids, angles: 5 } });
  if (parsed.wantsAds) subtasks.push({ agent: 'MetaAdsAgent', type: 'ads.propose_campaign', priority: 2, input: { product_ids: ids, budget_ars: parsed.budget } });
  if (parsed.wantsSales) subtasks.push({ agent: 'FacebookSalesAgent', type: 'sales.prepare_knowledge', priority: 3, input: { product_ids: ids } });
  const warnings = [];
  if (selection.excluded.length) warnings.push(`${selection.excluded.length} producto(s) excluido(s) por stock o precio`);
  if (parsed.wantsAds) warnings.push('Cualquier gasto publicitario requerirá aprobación explícita y tope de gasto');
  return { instruction, parsed, ...selection, subtasks, warnings };
}
