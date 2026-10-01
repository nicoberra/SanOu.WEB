// Generador de páginas SEO por categoría y por producto para San Ou.
// Lee catalogo-productos.js (fuente única) y escribe /categoria/<slug>.html y /producto/<slug>.html
// + regenera sitemap.xml. Re-ejecutable: sobrescribe.
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;  // corré: node gen-seo-paginas.js (regenera /categoria, /producto y sitemap.xml)

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'catalogo-productos.js'), 'utf8'));
const PRODS = window.SANOU_PRODUCTOS;

const SITE = 'https://sanou.com.ar';
const WA = '5491131751517';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Metadatos por categoría (nombre visible, slug con keywords, intro, keywords)
const CATS = {
  pinzas:       { slug: 'crimpadoras-hidraulicas', nombre: 'Crimpadoras / Pinzas hidráulicas', kw: 'crimpadora hidráulica, pinza hidráulica, crimpar cables, terminales de cobre, mm2',
    intro: 'Crimpadoras (pinzas) hidráulicas para indentar y engastar terminales en cables de cobre y aluminio. Elegí el modelo según la sección del cable (mm²): desde 6–50 mm² hasta 500 mm². Importador directo, stock y envíos a todo el país.' },
  dobladoras:   { slug: 'dobladoras-de-cano', nombre: 'Dobladoras de caño', kw: 'dobladora de caño, dobladora de caños hidráulica, curvadora de caño, doblar caño',
    intro: 'Dobladoras de caño hidráulicas y manuales para doblar caños de ½" a 3" sin aplastar el material. Ideales para instalaciones de gas, agua y estructuras. Importador directo con envíos a todo el país.' },
  cortahierro:  { slug: 'cortadoras-de-hierro', nombre: 'Cortadoras de hierro / varilla', kw: 'cortadora de hierro, cortadora de varilla hidráulica, corta hierro, cortar varilla roscada',
    intro: 'Cortadoras de hierro y varilla hidráulicas que cortan barras de acero de hasta Ø22 mm de forma limpia y sin esfuerzo. Corte parejo, sin rebaba. Importador directo, envíos a todo el país.' },
  mordazas:     { slug: 'mordazas-de-torno', nombre: 'Mordazas de torno', kw: 'mordaza de torno, morsa de banco, mordaza K11, mordaza para torno',
    intro: 'Mordazas de torno (morsas) de 80 a 315 mm para sujeción firme en banco y máquinas. Fundición robusta y cierre preciso. Importador directo con stock y envíos a todo el país.' },
  bombas:       { slug: 'bombas-hidraulicas', nombre: 'Bombas hidráulicas', kw: 'bomba hidráulica manual, bomba hidráulica 700 bar, bomba para cilindro hidráulico',
    intro: 'Bombas hidráulicas manuales de alta presión (700 bar) para alimentar cilindros, prensas y herramientas hidráulicas. Importador directo, envíos a todo el país.' },
  sacabocados:  { slug: 'sacabocados-hidraulicos', nombre: 'Sacabocados hidráulicos', kw: 'sacabocados hidráulico, perforadora de chapa, punzonadora de chapa, sacabocado tablero',
    intro: 'Sacabocados hidráulicos para perforar chapa y tableros con agujeros limpios de Ø22 a 114 mm. Rápidos y sin esfuerzo. Importador directo con envíos a todo el país.' },
  cilindros:    { slug: 'cilindros-hidraulicos', nombre: 'Cilindros hidráulicos', kw: 'cilindro hidráulico, gato hidráulico de botella, cilindro 10 20 30 50 100 toneladas',
    intro: 'Cilindros hidráulicos de 10 a 100 toneladas para prensar, levantar y empujar. Compatibles con bombas hidráulicas manuales. Importador directo, envíos a todo el país.' },
  cortadoras:   { slug: 'cortadoras-de-barras-cobre-aluminio', nombre: 'Cortadoras y procesadoras de barras Cu/Al', kw: 'cortadora de barras de cobre, procesadora de barras, cortadora barra aluminio, punzonadora de barras',
    intro: 'Cortadoras y procesadoras hidráulicas de barras de cobre y aluminio para tableros eléctricos: cortan, punzonan y doblan barras colectoras. Importador directo con envíos a todo el país.' },
  extractores:  { slug: 'extractores-hidraulicos', nombre: 'Extractores hidráulicos', kw: 'extractor hidráulico, extractor de rulemanes, extractor de poleas, extractor 3 garras',
    intro: 'Extractores hidráulicos para sacar rulemanes, poleas y engranajes sin dañar las piezas. Fuerza hidráulica controlada. Importador directo, envíos a todo el país.' },
  punzonadoras: { slug: 'punzonadoras-hidraulicas', nombre: 'Punzonadoras hidráulicas', kw: 'punzonadora hidráulica, punzonadora de chapa, perforadora hidráulica, punzonar perfiles',
    intro: 'Punzonadoras hidráulicas para perforar perfiles y chapa de forma rápida y limpia. Ideales para herrería y montaje. Importador directo con envíos a todo el país.' },
  motores:      { slug: 'herramientas-para-vehiculos', nombre: 'Herramientas para vehículos', kw: 'multiplicador de torque, extractor de rulemanes, extractor de rótulas, extractor de inyectores diesel',
    intro: 'Herramientas para vehículos y mecánica pesada: multiplicadores de torque, extractores de rulemanes, rótulas e inyectores. Para talleres y camiones. Importador directo, envíos a todo el país.' },
  otros:        { slug: 'otras-herramientas', nombre: 'Otras herramientas', kw: 'tijera cortacable, soporte para taladro, soporte para amoladora, caja de herramientas, mandril',
    intro: 'Otras herramientas profesionales San Ou: tijeras cortacable, soportes para taladro y amoladora, mandriles y cajas de herramientas. Importador directo con envíos a todo el país.' },
};

function getImgs(p) {
  if (!p.imgs || p.imgs === 0) return [];
  const catFolder = p.catFolder || p.category;
  const folder = p.folder || p.name;
  if (Array.isArray(p.imgs)) return p.imgs.map(f => `productos/${catFolder}/${folder}/${f}`);
  const ext = p.ext || 'jpg';
  return Array.from({ length: p.imgs }, (_, i) => `productos/${catFolder}/${folder}/${i + 1}.${ext}`);
}
const imgAbs = p => { const i = getImgs(p); return i.length ? SITE + '/' + i[0].split('/').map(encodeURIComponent).join('/') : SITE + '/sticker.png'; };
const imgRoot = p => { const i = getImgs(p); return i.length ? '/' + i[0].split('/').map(encodeURIComponent).join('/') : '/sticker.png'; };

const prodSlug = p => slug(p.name) + '-' + p.id; // único: nombre + id
const prodUrl = p => `${SITE}/producto/${prodSlug(p)}.html`;
const catUrl = key => `${SITE}/categoria/${CATS[key].slug}.html`;

// ── Head común ──
function head(opts) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-VLTJZZW8JF"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-VLTJZZW8JF');</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/tuerca-icon.png">
    <link rel="apple-touch-icon" href="/tuerca-icon.png">
    <title>${esc(opts.title)}</title>
    <meta name="description" content="${esc(opts.desc)}">
    <meta name="keywords" content="${esc(opts.kw)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${esc(opts.url)}">
    <meta property="og:title" content="${esc(opts.title)}">
    <meta property="og:description" content="${esc(opts.desc)}">
    <meta property="og:image" content="${esc(opts.image)}">
    <meta property="og:url" content="${esc(opts.url)}">
    <meta property="og:type" content="${opts.ogType || 'website'}">
    <meta property="og:locale" content="es_AR">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/seo-paginas.css">
    ${opts.jsonld.map(j => `<script type="application/ld+json">\n${JSON.stringify(j, null, 2)}\n</script>`).join('\n    ')}
</head>`;
}

function header() {
  return `<body>
    <div class="top-bar">
        <img src="/camion_amarillo.png" alt="" class="topbar-truck">
        🚚 Envíos a todo el país &nbsp;|&nbsp; ⚡ Respuesta rápida por WhatsApp &nbsp;|&nbsp; 🔧 Herramientas profesionales
    </div>
    <header class="header">
        <div class="container">
            <a href="/index.html" class="logo-img-link"><img src="/sticker.png" alt="San Ou" class="header-logo"></a>
            <nav class="nav">
                <a href="/index.html#inicio" class="nav-link">Inicio</a>
                <a href="/index.html#productos" class="nav-link">Productos</a>
                <a href="/mayorista.html" class="nav-link">Mayorista</a>
                <a href="/index.html#contacto" class="nav-link">Contacto</a>
            </nav>
            <div class="header-right">
                <div class="social-icons">
                    <a href="https://wa.me/${WA}" target="_blank" class="social-icon si-wa"><i class="fab fa-whatsapp"></i></a>
                    <a href="https://www.instagram.com/sanou.arg" target="_blank" class="social-icon si-ig"><i class="fab fa-instagram"></i></a>
                    <a href="https://www.facebook.com/profile.php?id=61578990548942" target="_blank" class="social-icon si-fb"><i class="fab fa-facebook-f"></i></a>
                </div>
            </div>
        </div>
    </header>`;
}

function footerCategorias(actual) {
  const links = Object.keys(CATS).map(k =>
    `<a href="${catUrl(k).replace(SITE, '')}"${k === actual ? ' class="seo-cat-actual"' : ''}>${esc(CATS[k].nombre)}</a>`).join('\n                ');
  return `
    <section class="seo-otras-cats">
        <div class="container">
            <h2>Todas las categorías</h2>
            <nav class="seo-cat-links">
                ${links}
            </nav>
        </div>
    </section>
    <footer class="footer">
        <div class="container">
            <p class="seo-footer-line">San Ou — Herramientas hidráulicas. Importador directo, más de 12 años. Envíos a todo el país.</p>
            <div class="seo-footer-botones">
                <a href="/index.html" class="seo-btn-sec"><i class="fas fa-store"></i> Ir a la tienda</a>
                <a href="https://wa.me/${WA}" target="_blank" class="seo-btn-wa"><i class="fab fa-whatsapp"></i> Consultar por WhatsApp</a>
            </div>
        </div>
    </footer>
</body>
</html>`;
}

// ── Página de PRODUCTO ──
function paginaProducto(p) {
  const cat = CATS[p.category] || CATS.otros;
  const url = prodUrl(p);
  const img = imgAbs(p);
  const desc = (p.desc || `${p.name} — herramienta hidráulica profesional San Ou.`).slice(0, 300);
  const metaDesc = `${p.name}${p.badge ? ' (' + p.badge + ')' : ''}. ${desc} Importador directo, stock y envíos a todo el país.`.slice(0, 300);
  const kw = `${p.name}, ${cat.kw}`;
  const specs = (p.allSpecs && p.allSpecs.length ? p.allSpecs : (p.specs || []));

  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.name, image: [img], description: desc,
      brand: { '@type': 'Brand', name: 'San Ou' },
      category: cat.nombre,
      ...(p.badge ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'Característica', value: p.badge }] } : {}),
      offers: { '@type': 'Offer', priceCurrency: 'ARS', availability: p.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url, itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'San Ou' } }
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: cat.nombre, item: catUrl(p.category) },
        { '@type': 'ListItem', position: 3, name: p.name, item: url }
      ]
    }
  ];

  const specsHTML = specs.length ? `
                <h2>Especificaciones</h2>
                <div class="guia-table-wrap">
                    <table class="guia-table">
                        <tbody>
                            ${specs.map(s => `<tr><td>${esc(s.l)}</td><td>${esc(s.v)}</td></tr>`).join('\n                            ')}
                        </tbody>
                    </table>
                </div>` : '';

  // relacionados: hasta 6 de la misma categoría
  const rel = PRODS.filter(x => x.category === p.category && x.id !== p.id).slice(0, 6);
  const relHTML = rel.length ? `
                <h2>Más de ${esc(cat.nombre)}</h2>
                <div class="seo-rel-grid">
                    ${rel.map(r => `<a class="seo-rel-card" href="/producto/${prodSlug(r)}.html">
                        <div class="seo-rel-img"><img src="${imgRoot(r)}" alt="${esc(r.name)}" loading="lazy"></div>
                        <span>${esc(r.name)}</span>
                    </a>`).join('\n                    ')}
                </div>` : '';

  const waTxt = encodeURIComponent('Hola San Ou! Quiero consultar por: ' + p.name);

  return head({ title: `${p.name}${p.badge ? ' — ' + p.badge : ''} | San Ou`, desc: metaDesc, kw, url, image: img, ogType: 'product', jsonld })
    + header() + `
    <main class="seo-page">
        <div class="container">
            <nav class="seo-breadcrumb">
                <a href="/index.html">Inicio</a> <i class="fas fa-angle-right"></i>
                <a href="/categoria/${cat.slug}.html">${esc(cat.nombre)}</a> <i class="fas fa-angle-right"></i>
                <span>${esc(p.name)}</span>
            </nav>
            <article class="seo-producto">
                <div class="seo-prod-media"><img src="${imgRoot(p)}" alt="${esc(p.name)}"></div>
                <div class="seo-prod-info">
                    ${p.badge ? `<span class="seo-badge">${esc(p.badge)}</span>` : ''}
                    <h1>${esc(p.name)}</h1>
                    <p class="seo-lead">${esc(desc)}</p>
                    <div class="seo-prod-cta">
                        <a class="seo-btn-primary" href="/index.html#producto-${p.id}"><i class="fas fa-store"></i> Ver y comprar en la tienda</a>
                        <a class="seo-btn-wa" href="https://wa.me/${WA}?text=${waTxt}" target="_blank"><i class="fab fa-whatsapp"></i> Consultar precio</a>
                    </div>
                    <p class="seo-prod-nota"><i class="fas fa-truck"></i> Envíos a todo el país · <i class="fas fa-box"></i> Importador directo</p>
                </div>
            </article>
            ${specsHTML}
            ${relHTML}
        </div>
    </main>` + footerCategorias(p.category);
}

// ── Página de CATEGORÍA ──
function paginaCategoria(key) {
  const cat = CATS[key];
  const url = catUrl(key);
  const prods = PRODS.filter(p => p.category === key);
  const enStock = prods.filter(p => p.inStock !== false);
  const sinStock = prods.filter(p => p.inStock === false);
  const ordenados = enStock.concat(sinStock);
  const img = prods.length ? imgAbs(prods[0]) : SITE + '/sticker.png';
  const metaDesc = cat.intro.slice(0, 300);

  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: cat.nombre, item: url }
      ]
    },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: cat.nombre,
      itemListElement: ordenados.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: prodUrl(p) }))
    }
  ];

  const cards = ordenados.map(p => `<a class="seo-cat-card" href="/producto/${prodSlug(p)}.html">
                    <div class="seo-cat-card-img"><img src="${imgRoot(p)}" alt="${esc(p.name)}" loading="lazy">${p.inStock === false ? '<span class="seo-chip-out">Sin stock</span>' : ''}</div>
                    <div class="seo-cat-card-body">
                        <h3>${esc(p.name)}</h3>
                        ${p.badge ? `<span class="seo-badge sm">${esc(p.badge)}</span>` : ''}
                        ${p.desc ? `<p>${esc(p.desc.slice(0, 110))}${p.desc.length > 110 ? '…' : ''}</p>` : ''}
                        <span class="seo-ver">Ver producto <i class="fas fa-angle-right"></i></span>
                    </div>
                </a>`).join('\n                ');

  return head({ title: `${cat.nombre} — San Ou | Importador directo, envíos a todo el país`, desc: metaDesc, kw: cat.kw, url, image: img, ogType: 'website', jsonld })
    + header() + `
    <main class="seo-page">
        <div class="container">
            <nav class="seo-breadcrumb">
                <a href="/index.html">Inicio</a> <i class="fas fa-angle-right"></i>
                <span>${esc(cat.nombre)}</span>
            </nav>
            <header class="seo-cat-head">
                <span class="seo-tag">Categoría</span>
                <h1>${esc(cat.nombre)}</h1>
                <p class="seo-lead">${esc(cat.intro)}</p>
            </header>
            <div class="seo-cat-grid">
                ${cards}
            </div>
        </div>
    </main>` + footerCategorias(key);
}

// ── Escribir archivos ──
const dirCat = path.join(ROOT, 'categoria');
const dirProd = path.join(ROOT, 'producto');
fs.mkdirSync(dirCat, { recursive: true });
fs.mkdirSync(dirProd, { recursive: true });

const urls = [];
Object.keys(CATS).forEach(k => {
  const html = paginaCategoria(k);
  fs.writeFileSync(path.join(dirCat, CATS[k].slug + '.html'), html, 'utf8');
  urls.push({ loc: catUrl(k), pri: '0.8', freq: 'weekly' });
});
let nProd = 0;
PRODS.forEach(p => {
  const html = paginaProducto(p);
  fs.writeFileSync(path.join(dirProd, prodSlug(p) + '.html'), html, 'utf8');
  urls.push({ loc: prodUrl(p), pri: '0.7', freq: 'weekly' });
  nProd++;
});

// ── sitemap.xml ──
const hoy = new Date().toISOString().slice(0, 10);
const fijas = [
  { loc: SITE + '/', pri: '1.0', freq: 'weekly' },
  { loc: SITE + '/mayorista.html', pri: '0.8', freq: 'weekly' },
  { loc: SITE + '/mayoristas.html', pri: '0.6', freq: 'monthly' },
  { loc: SITE + '/guia-crimpadoras-hidraulicas.html', pri: '0.7', freq: 'monthly' },
  { loc: SITE + '/guia-como-crimpar-cables.html', pri: '0.7', freq: 'monthly' },
  { loc: SITE + '/envios.html', pri: '0.5', freq: 'yearly' },
  { loc: SITE + '/terminos.html', pri: '0.3', freq: 'yearly' },
  { loc: SITE + '/privacidad.html', pri: '0.3', freq: 'yearly' },
];
const all = fijas.concat(urls);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

console.log('Categorías:', Object.keys(CATS).length, '| Productos:', nProd, '| URLs en sitemap:', all.length);
