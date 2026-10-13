// Chequeos estáticos de la web (sin dependencias, sin red): corren en cada push en GitHub Actions.
// 1) Sintaxis de todos los .js del sitio.
// 2) Links y recursos locales (href/src) que apunten a archivos que existen.
// 3) JSON-LD válido en cada página.
// 4) sitemap.xml: cada URL corresponde a un archivo real.
// 5) Páginas indexables (las del sitemap): un solo H1, title y canonical presentes.
// Uso: node tests/test-front.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://sanou.com.ar';
const IGNORAR = new Set(['node_modules', '.git', '.github', 'tests', 'posteos-instagram', 'mapa-editable', 'docs', '.claude']);
let errores = 0, chequeos = 0;
const mal = (m) => { errores++; console.log('  ✗ ' + m); };

function archivos(dir, ext, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (dir === ROOT && !['categoria', 'producto'].includes(f.name)) continue; archivos(p, ext, out); }
    else if (f.name.endsWith(ext)) out.push(p);
  }
  return out;
}
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

// 1) Sintaxis JS
console.log('1) Sintaxis de JavaScript');
for (const f of archivos(ROOT, '.js')) {
  if (f.endsWith('.min.js')) continue;
  chequeos++;
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { mal(`${rel(f)}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); }
}

// 2..5) HTML
const htmls = archivos(ROOT, '.html');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const urlsSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const aArchivo = u => { let p = decodeURIComponent(u.replace(SITE, '')).split(/[?#]/)[0]; if (p === '' || p === '/') p = '/index.html'; return path.join(ROOT, p); };
const indexables = new Set(urlsSitemap.map(u => path.resolve(aArchivo(u))));

console.log(`2-3) Links locales y JSON-LD en ${htmls.length} páginas`);
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  // Ignorar lo que está dentro de <script> (plantillas JS con ${...}) para los links.
  const sinScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const m of sinScripts.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(u) || u.includes('${')) continue;
    const limpio = decodeURIComponent(u.split(/[?#]/)[0]);
    if (!limpio) continue;
    const destino = limpio.startsWith('/') ? path.join(ROOT, limpio) : path.join(path.dirname(f), limpio);
    chequeos++;
    if (!fs.existsSync(destino)) mal(`${rel(f)}: link roto → ${u}`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    chequeos++;
    try { JSON.parse(m[1]); } catch (e) { mal(`${rel(f)}: JSON-LD inválido (${e.message})`); }
  }
  if (indexables.has(path.resolve(f))) {
    chequeos += 3;
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) mal(`${rel(f)}: tiene ${h1} H1 (debe tener 1)`);
    if (!/<title>[^<]{5,}<\/title>/.test(html)) mal(`${rel(f)}: sin <title>`);
    if (!/<link rel="canonical" href="https:\/\/sanou\.com\.ar/.test(html)) mal(`${rel(f)}: sin canonical`);
  }
}

console.log(`4) sitemap.xml (${urlsSitemap.length} URLs)`);
for (const u of urlsSitemap) {
  chequeos++;
  if (!u.startsWith(SITE)) mal(`sitemap: URL de otro dominio ${u}`);
  else if (!fs.existsSync(aArchivo(u))) mal(`sitemap: ${u} no tiene archivo`);
  else if (/noindex/i.test(fs.readFileSync(aArchivo(u), 'utf8').slice(0, 4000))) mal(`sitemap: ${u} tiene noindex`);
}

console.log(`\n${chequeos} chequeos, ${errores} con error`);
process.exit(errores ? 1 : 0);
