// Prueba de humo en navegador real (Chromium headless con Playwright).
// Abre las páginas principales a 390px (celular) y 1440px (compu) y falla si hay errores de JavaScript
// sin capturar o scroll horizontal. Bloquea TODAS las llamadas al Apps Script, analytics y Klaviyo:
// el CI nunca escribe en la planilla real ni ensucia las estadísticas.
// Uso: npm i --no-save playwright && npx playwright install chromium && node tests/smoke.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('SKIP smoke: playwright no está instalado (corre en GitHub Actions).'); process.exit(0); }

const ROOT = path.resolve(process.env.SMOKE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.resolve(path.join(ROOT, p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

const PAGINAS = ['/index.html', '/mayorista.html', '/mayoristas.html', '/envios.html', '/catalogo.html', '/cotizar.html', '/panel.html',
  '/guia-crimpadoras-hidraulicas.html', '/categoria/crimpadoras-hidraulicas.html', '/producto/pinza-hidraulica-hhy-70a-1.html', '/pago.html'];
const BLOQUEAR = /script\.google\.com|script\.googleusercontent\.com|googletagmanager|google-analytics|klaviyo|facebook\.net|api\.mercadopago/;

const browser = await chromium.launch();
let fallas = 0;
for (const [ancho, alto, nombre] of [[390, 844, 'celular'], [1440, 900, 'compu']]) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.route('**/*', r => (BLOQUEAR.test(r.request().url()) ? r.abort() : r.continue()));
  for (const url of PAGINAS) {
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    try {
      const resp = await page.goto(BASE + url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1500);
      if (!resp || resp.status() >= 400) errores.push('HTTP ' + (resp && resp.status()));
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (scrollX) errores.push('scroll horizontal');
    } catch (e) { errores.push(e.message.split('\n')[0]); }
    if (errores.length) { fallas++; console.log(`  ✗ ${nombre} ${url}: ${errores.join(' | ')}`); }
    else console.log(`  ✓ ${nombre} ${url}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close(); server.close();
console.log(fallas ? `\n${fallas} páginas con problemas` : '\nTodas las páginas cargan sin errores');
process.exit(fallas ? 1 : 0);
