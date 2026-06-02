// ─── KLAVIYO ─────────────────────────────────────────────────────
const KL_KEY = 'UVQQT2';
let klUserEmail = localStorage.getItem('kl_email') || null;
let klUserName  = localStorage.getItem('kl_name')  || null;
let klModalMostrado = false;

function abrirKlModal() {
    if (klUserEmail || klModalMostrado) return;
    klModalMostrado = true;
    cerrarIosNotif();
    document.getElementById('klOverlay').classList.add('active');
    setTimeout(() => document.getElementById('klModal').classList.add('active'), 10);
}

function cerrarKlModal() {
    document.getElementById('klModal').classList.remove('active');
    document.getElementById('klOverlay').classList.remove('active');
}

function abrirKlModalDesdeNotif() {
    cerrarIosNotif();
    klModalMostrado = false;
    abrirKlModal();
}

function cerrarIosNotif() {
    const n = document.getElementById('iosNotif');
    if (!n) return;
    n.classList.remove('show');
    n.classList.add('hide');
}

// Mostrar notificación iOS al entrar (solo si no dejó email antes)
window.addEventListener('load', () => {
    // Actualizar sección visible de registro
    actualizarSeccionRegistro();

    if (klUserEmail) return;
    setTimeout(() => {
        const n = document.getElementById('iosNotif');
        if (n) n.classList.add('show');
        // Auto-cerrar a los 6 segundos
        setTimeout(() => cerrarIosNotif(), 6000);
    }, 3500);
});

function actualizarSeccionRegistro() {
    const inner      = document.getElementById('ecbInner');
    const registered = document.getElementById('ecbRegistered');
    const msg        = document.getElementById('ecbRegisteredMsg');
    if (!inner || !registered) return;
    if (klUserEmail) {
        inner.style.display      = 'none';
        registered.style.display = 'flex';
        if (msg) msg.textContent = klUserName
            ? `¡Hola, ${klUserName}! Ya estás suscripto. Por acá te vamos a avisar de ofertas y productos nuevos.`
            : '¡Ya estás suscripto! Por acá te vamos a avisar de ofertas y productos nuevos.';
    } else {
        inner.style.display      = '';
        registered.style.display = 'none';
    }
}

function registrarseDesdeSeccion(e) {
    e.preventDefault();
    const email  = document.getElementById('ecbEmail').value.trim();
    const nombre = document.getElementById('ecbNombre').value.trim();
    if (!email) return;

    klUserEmail = email;
    klUserName  = nombre;
    localStorage.setItem('kl_email', email);
    if (nombre) localStorage.setItem('kl_name', nombre);

    klPush(['identify', { '$email': email, '$first_name': nombre || '' }]);

    actualizarSeccionRegistro();
    cerrarIosNotif();
    cerrarKlModal();
    klTrackCart();
}

function klPush(args) {
    if (window.klaviyo) window.klaviyo.push(args);
    else { window._klOnsite = window._klOnsite || []; window._klOnsite.push(args); }
}

function guardarEmailKlaviyo(e) {
    e.preventDefault();
    const email = document.getElementById('klEmail').value.trim();
    const nombre = document.getElementById('klNombre').value.trim();
    if (!email) return;

    klUserEmail = email;
    klUserName  = nombre;
    localStorage.setItem('kl_email', email);
    if (nombre) localStorage.setItem('kl_name', nombre);

    // Identificar en Klaviyo
    klPush(['identify', { '$email': email, '$first_name': nombre || '' }]);

    cerrarKlModal();
    actualizarSeccionRegistro();
    klTrackCart();

    // Si había una compra rápida pendiente, ejecutarla ahora
    const modal = document.getElementById('klModal');
    const pendingId = modal?.dataset.pendingQuickBuy;
    if (pendingId) {
        delete modal.dataset.pendingQuickBuy;
        setTimeout(() => _doQuickBuy(parseInt(pendingId)), 300);
    }
}

function klTrackCart() {
    if (!klUserEmail || cart.length === 0) return;
    const items = cart.map(p => ({
        ProductID: String(p.id),
        ProductName: p.name,
        ProductCategories: [p.category],
        ItemPrice: p.price || 0,
        Quantity: p.qty,
        RowTotal: (p.price || 0) * p.qty,
    }));
    const total = cart.reduce((s, p) => s + (p.price || 0) * p.qty, 0);
    klPush(['track', 'Added to Cart', {
        '$value': total,
        'AddedItemProductName': items[items.length - 1]?.ProductName || '',
        'CheckoutURL': window.location.href,
        'Items': items,
    }]);
}

function suscribirNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('fnEmail').value.trim();
    if (!email) return;
    klUserEmail = email;
    localStorage.setItem('kl_email', email);
    klPush(['identify', { '$email': email }]);
    klPush(['track', 'Newsletter Signup', { '$email': email }]);
    const btn = e.target.querySelector('.fn-btn');
    btn.textContent = '¡Listo!';
    btn.style.background = '#25D366';
    setTimeout(() => { btn.textContent = 'Suscribirme'; btn.style.background = ''; }, 3000);
}

// ─── CONFIGURACIÓN ──────────────────────────────────────────────
// Reemplazá este número con tu WhatsApp (código de país + número, sin + ni espacios)
const WHATSAPP_NUMBER = '5491131751517';

// URL de la hoja de Google Sheets publicada como CSV (Archivo → Publicar en la web → CSV)
// Dejá vacío ('') para usar los precios del código
const PRICES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTtIfGdbPDoIrVhs0zQPEB_wu_rMGz5280eSTygqqTKpjqaFpcZLWN0fSet_4wKgzcZNNEuk2PfK-i0/pub?output=csv';

// ─── PRODUCTOS ──────────────────────────────────────────────────
const products = [
    // Pinzas
    { id: 1, name: 'Pinza Hidráulica HHY-70A', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '6–70 mm²', imgs: 2, folder: 'HHY-70A', ext: 'jpeg', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica para indentar/engastar terminales. Incluye 7 matrices y maletín plástico de transporte.',
      specs: [
        { l: 'Rango de crimpado', v: '6–70 mm²' },
        { l: 'Fuerza hidráulica', v: '5 Ton' },
        { l: 'Matrices incluidas', v: '7 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-70A' },
        { l: 'Rango de crimpado', v: '6–70 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '5 Ton' },
        { l: 'Carrera del pistón', v: '10 mm' },
        { l: 'Matrices incluidas', v: '6 / 10 / 16 / 25 / 35 / 50 / 70 mm²' },
        { l: 'Incluye', v: 'Maletín plástico de transporte' },
        { l: 'Peso bruto', v: '2.8 kg' },
        { l: 'Medidas de empaque', v: '355 × 173 × 83 mm' }
      ]
    },
    { id: 2, name: 'Pinza Hidráulica HHY-120A', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '10–120 mm²', imgs: 2, folder: 'HHY-120A', ext: 'jpeg', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica para indentar/engastar terminales y conectores. Incluye 8 matrices y maletín plástico.',
      specs: [
        { l: 'Rango de crimpado', v: '10–120 mm²' },
        { l: 'Fuerza hidráulica', v: '7 Ton' },
        { l: 'Matrices incluidas', v: '8 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-120A' },
        { l: 'Rango de crimpado', v: '10–120 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '7 Ton' },
        { l: 'Carrera del pistón', v: '15.5 mm' },
        { l: 'Matrices incluidas', v: '10 / 16 / 25 / 35 / 50 / 70 / 95 / 120 mm²' },
        { l: 'Incluye', v: 'Maletín plástico de transporte' },
        { l: 'Peso bruto', v: '4.5 kg' },
        { l: 'Medidas de empaque', v: '430 × 190 × 90 mm' }
      ]
    },
    { id: 3, name: 'Pinza Hidráulica HHY-300A', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '16–300 mm²', imgs: 1, folder: 'HHY-300A', ext: 'jpeg', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica para indentar/engastar terminales y conectores. Incluye 11 matrices y maletín plástico moldeado.',
      specs: [
        { l: 'Rango de crimpado', v: '16–300 mm²' },
        { l: 'Fuerza hidráulica', v: '9 Ton' },
        { l: 'Matrices incluidas', v: '11 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-300A' },
        { l: 'Rango de crimpado', v: '16–300 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '9 Ton' },
        { l: 'Carrera del pistón', v: '16 mm' },
        { l: 'Matrices incluidas', v: '16 / 25 / 35 / 50 / 70 / 95 / 120 / 150 / 185 / 240 / 300 mm²' },
        { l: 'Incluye', v: 'Maletín plástico moldeado de transporte' },
        { l: 'Peso bruto', v: '6.4 kg' },
        { l: 'Medidas de empaque', v: '533 × 206 × 102 mm' }
      ]
    },
    { id: 24, name: 'Pinza Hidráulica HHY-300 (con zafe)', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '16–300 mm²', imgs: 3, folder: 'HHY-300 (con zafe)', ext: 'jpeg', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica para terminales con válvula de seguridad (zafe). Mayor fuerza y seguridad en el crimpado.',
      specs: [
        { l: 'Rango de crimpado', v: '16–300 mm²' },
        { l: 'Fuerza hidráulica', v: '11 Ton' },
        { l: 'Válvula de seguridad', v: 'Sí' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-300' },
        { l: 'Rango de crimpado', v: '16–300 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '11 Ton' },
        { l: 'Válvula de seguridad', v: 'Sí' },
        { l: 'Carrera del pistón', v: '17 mm' },
        { l: 'Matrices incluidas', v: '16 / 25 / 35 / 50 / 70 / 95 / 120 / 150 / 185 / 240 / 300 mm²' },
        { l: 'Peso bruto', v: '9.5 kg' },
        { l: 'Medidas de empaque', v: '540 × 120 × 240 mm' }
      ]
    },
    { id: 25, name: 'Pinza Hidráulica HHY-300CF + Bomba', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '16–300 mm²', imgs: 3, folder: 'HHY-300CF + Bomba', ext: 'webp', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica con bomba manual incluida HHB-600A. Manguera 1.2 m y caja metálica de transporte.',
      specs: [
        { l: 'Rango de crimpado', v: '16–300 mm²' },
        { l: 'Fuerza hidráulica', v: '11 Ton' },
        { l: 'Incluye bomba', v: 'HHB-600A' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-300CF' },
        { l: 'Rango de crimpado', v: '16–300 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '11 Ton' },
        { l: 'Carrera del pistón', v: '28.5 mm' },
        { l: 'Matrices incluidas', v: '16 / 25 / 35 / 50 / 70 / 95 / 120 / 150 / 185 / 240 / 300 mm²' },
        { l: 'Bomba incluida', v: 'HHB-600A' },
        { l: 'Manguera', v: '1.2 m alta presión' },
        { l: 'Incluye', v: 'Caja metálica de transporte' },
        { l: 'Peso bruto', v: '11.8 kg' },
        { l: 'Medidas de empaque', v: '490 × 260 × 130 mm' }
      ]
    },
    { id: 26, name: 'Pinza Hidráulica HHYJ-50', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '6–50 mm²', imgs: ['1.png', '2.webp'], folder: 'HHYJ-50', catFolder: 'Pinzas',
      desc: 'Pinza para indentar terminales de cobre con crimpado hexagonal. Diseño compacto y liviano.',
      specs: [
        { l: 'Rango de crimpado', v: '6–50 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Matrices incluidas', v: '6 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHYJ-50' },
        { l: 'Aplicación', v: 'Terminales de cobre' },
        { l: 'Rango de crimpado', v: '6–50 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Matrices incluidas', v: '6 / 10 / 16 / 25 / 35 / 50 mm²' },
        { l: 'Peso bruto', v: '1.4 kg' },
        { l: 'Medidas de empaque', v: '400 × 130 × 50 mm' }
      ]
    },
    { id: 27, name: 'Pinza Hidráulica HHY-400B con Zafe', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '16–400 mm²', imgs: ['1.jpeg','2.webp','3.webp'], folder: 'HHY-400B con zafe', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica para indentar terminales con zafe y sistema de seguridad CCD/CCG.',
      specs: [
        { l: 'Rango de crimpado', v: '16–400 mm²' },
        { l: 'Fuerza hidráulica', v: '11 Ton' },
        { l: 'Matrices incluidas', v: '9 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-400B' },
        { l: 'Rango de crimpado', v: '16–400 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '11 Ton' },
        { l: 'Carrera del pistón', v: '32 mm' },
        { l: 'Matrices incluidas', v: '50 / 70 / 95 / 120 / 150 / 185 / 240 / 300 / 400 mm²' },
        { l: 'Peso bruto', v: '11.5 kg' },
        { l: 'Medidas de empaque', v: '770 × 135 × 240 mm' }
      ]
    },
    { id: 28, name: 'Pinza Hidráulica HHY-400A', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '16–400 mm²', imgs: 3, folder: 'HHY-400A', ext: 'jpeg', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica de alta fuerza para indentar terminales. Incluye 12 matrices y maletín de transporte.',
      specs: [
        { l: 'Rango de crimpado', v: '16–400 mm²' },
        { l: 'Fuerza hidráulica', v: '14 Ton' },
        { l: 'Matrices incluidas', v: '12 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-400A' },
        { l: 'Rango de crimpado', v: '16–400 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '14 Ton' },
        { l: 'Carrera del pistón', v: '16.5 mm' },
        { l: 'Matrices incluidas', v: '16 / 25 / 35 / 50 / 70 / 95 / 120 / 150 / 185 / 240 / 300 / 400 mm²' },
        { l: 'Peso bruto', v: '15 kg' },
        { l: 'Medidas de empaque', v: '625 × 110 × 240 mm' }
      ]
    },
    { id: 29, name: 'Pinza Hidráulica HHY-500 + Bomba', category: 'pinzas', price: 100000, icon: 'fa-scissors', badge: '16–500 mm²', imgs: 3, folder: 'HHY-500 + Bomba', ext: 'jpeg', catFolder: 'Pinzas',
      desc: 'Pinza hidráulica de máxima capacidad con bomba manual HHB-600A. Cabeza tipo yugo, caja metálica incluida.',
      specs: [
        { l: 'Rango de crimpado', v: '16–500 mm²' },
        { l: 'Fuerza hidráulica', v: '20 Ton' },
        { l: 'Incluye bomba', v: 'HHB-600A' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHY-500' },
        { l: 'Tipo de cabeza', v: 'Yugo (sólida y durable)' },
        { l: 'Rango de crimpado', v: '16–500 mm²' },
        { l: 'Tipo de crimpado', v: 'Hexagonal' },
        { l: 'Fuerza hidráulica', v: '20 Ton' },
        { l: 'Carrera del pistón', v: '22 mm' },
        { l: 'Matrices incluidas', v: '70 / 95 / 120 / 150 / 185 / 240 / 300 / 400 / 500 mm²' },
        { l: 'Bomba incluida', v: 'HHB-600A' },
        { l: 'Manguera', v: '1.2 m alta presión' },
        { l: 'Incluye', v: 'Caja metálica de transporte' },
        { l: 'Peso bruto kit', v: '17.2 kg' },
        { l: 'Medidas de empaque', v: '490 × 260 × 130 mm' }
      ]
    },
    // Dobladoras de caño
    { id: 4, name: 'Dobladora de Caños HHW-2J', category: 'dobladoras', price: 100000, icon: 'fa-arrows-turn-right', badge: '1/2"–2"', imgs: 2, folder: 'HHW-2J', ext: 'webp', catFolder: 'Dobladoras',
      desc: 'Dobladora hidráulica de caños con trípode. Doblado en frío, no requiere precalentamiento. Incluye 6 zapatas.',
      specs: [
        { l: 'Rango de doblado', v: '1/2" – 2"' },
        { l: 'Fuerza hidráulica', v: '13 Ton' },
        { l: 'Zapatas incluidas', v: '6 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHW-2J' },
        { l: 'Ángulo de doblado', v: '0° a 90°' },
        { l: 'Método', v: 'Doblado en frío' },
        { l: 'Rango (Diám. exterior)', v: 'Ø21,3 a Ø60 mm' },
        { l: 'Fuerza hidráulica', v: '13 Ton' },
        { l: 'Carrera del pistón', v: '250 mm' },
        { l: 'Zapatas incluidas', v: '1/2" / 3/4" / 1" / 1 1/4" / 1 1/2" / 2"' },
        { l: 'Peso bruto', v: '48,2 kg' },
        { l: 'Medidas de empaque', v: '73 × 32 × 20 cm' }
      ]
    },
    { id: 5, name: 'Dobladora de Caños HHW-3J', category: 'dobladoras', price: 100000, icon: 'fa-arrows-turn-right', badge: '1/2"–3"', imgs: 3, folder: 'HHW-3J', ext: 'webp', catFolder: 'Dobladoras',
      desc: 'Dobladora hidráulica de caños para paredes gruesas con trípode. Doblado en frío hasta 3". Incluye 8 zapatas.',
      specs: [
        { l: 'Rango de doblado', v: '1/2" – 3"' },
        { l: 'Fuerza hidráulica', v: '20 Ton' },
        { l: 'Zapatas incluidas', v: '8 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHW-3J' },
        { l: 'Ángulo de doblado', v: '0° a 90°' },
        { l: 'Tipo', v: 'Paredes gruesas, con trípode' },
        { l: 'Rango (Diám. exterior)', v: 'Ø21,3 a Ø88,5 mm' },
        { l: 'Fuerza hidráulica', v: '20 Ton' },
        { l: 'Carrera del pistón', v: '290 mm' },
        { l: 'Zapatas incluidas', v: '1/2" / 3/4" / 1" / 1 1/4" / 1 1/2" / 2" / 2 1/2" / 3"' },
        { l: 'Peso bruto', v: '100,5 kg' },
        { l: 'Medidas de empaque', v: '94 × 40 × 21 cm' }
      ]
    },
    { id: 44, name: 'Dobladora de Caños Manual HHW-25S', category: 'dobladoras', price: 100000, icon: 'fa-arrows-turn-right', badge: '10–25 mm', imgs: 3, folder: 'HHW25S', ext: 'webp', catFolder: 'Dobladoras',
      desc: 'Dobladora manual de caños con 7 conformadores incluidos (10 a 25 mm). Flexión hasta 180°, resultados óptimos sin deformaciones ni ondulaciones. Matrices de acero casi irrompibles. Viene en maletín de plástico moldeado resistente. Aplicaciones universales: curvas en U, contracurvas, cuello de cisne y curvas de conexión en todos los niveles.',
      specs: [
        { l: 'Rango de doblado', v: '10 mm – 25 mm' },
        { l: 'Ángulo máximo', v: '180°' },
        { l: 'Conformadores incluidos', v: '7 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHW-25S' },
        { l: 'Tipo', v: 'Manual' },
        { l: 'Rango de doblado', v: '10 mm – 25 mm' },
        { l: 'Ángulo máximo', v: '180°' },
        { l: 'Espesor de pared', v: '0,8 mm – 2 mm' },
        { l: 'Conformadores', v: '3/8" (10mm) / 1/2" (12mm) / 9/16" (14mm) / 5/8" (16mm) / 3/4" (19mm) / 7/8" (22mm) / 1" (25mm)' },
        { l: 'Radio de curva (10mm)', v: 'R 4 cm — Ø int. 8 cm' },
        { l: 'Radio de curva (12mm)', v: 'R 5 cm — Ø int. 10 cm' },
        { l: 'Radio de curva (14mm)', v: 'R 6 cm — Ø int. 12 cm' },
        { l: 'Radio de curva (16mm)', v: 'R 7 cm — Ø int. 14 cm' },
        { l: 'Radio de curva (19mm)', v: 'R 8 cm — Ø int. 16 cm' },
        { l: 'Radio de curva (22mm)', v: 'R 9,5 cm — Ø int. 19 cm' },
        { l: 'Radio de curva (25mm)', v: 'R 10 cm — Ø int. 20 cm' },
        { l: 'Peso', v: '25 kg' },
        { l: 'Medidas de empaque', v: '660 × 460 × 180 mm' },
        { l: 'Incluye', v: 'Maletín de plástico moldeado resistente' }
      ]
    },
    { id: 6, name: 'Dobladora de Barras HHM-150W', category: 'dobladoras', price: 100000, icon: 'fa-arrows-turn-right', badge: 'Barras Cu/Al', imgs: 3, folder: 'HHM-150W', ext: 'webp', catFolder: 'Dobladoras',
      desc: 'Dobladora hidráulica para barras planas de cobre/aluminio. Ideal para tableros eléctricos, celdas y puesta a tierra.',
      specs: [
        { l: 'Ancho máx. de barra', v: '150 mm' },
        { l: 'Espesor máx.', v: '10 mm' },
        { l: 'Fuerza de salida', v: '16 Ton' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHM-150W' },
        { l: 'Tipo', v: 'Barras planas (cobre / aluminio)' },
        { l: 'Ancho máx. de barra', v: '150 mm' },
        { l: 'Espesor máx.', v: '10 mm' },
        { l: 'Fuerza de salida', v: '16 Ton' },
        { l: 'Sistema', v: 'Simple efecto, retorno por resorte' },
        { l: 'Presión de trabajo', v: '700 bar' },
        { l: 'Peso', v: '34,8 kg' },
        { l: 'Medidas de empaque', v: '34 × 23 × 46 cm' }
      ]
    },
    // Corta hierro
    { id: 7, name: 'Cortadora Hidráulica HHG-16', category: 'cortahierro', price: 100000, icon: 'fa-bolt', badge: 'hasta Ø16 mm', imgs: ['1.png','2.jpeg','3.webp'], folder: 'Cortadora de Varilla 16mm', catFolder: 'cortahierro',
      desc: 'Cortadora hidráulica de varillas de acero. Corte limpio sin deformación. Compacta y liviana.',
      specs: [
        { l: 'Diámetro máx.', v: 'Ø 16 mm' },
        { l: 'Fuerza hidráulica', v: '7 Ton' },
        { l: 'Peso', v: '3,6 kg' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHG-16' },
        { l: 'Diámetro máx.', v: 'Ø 16 mm' },
        { l: 'Fuerza hidráulica', v: '7 Ton' },
        { l: 'Peso', v: '3,6 kg' }
      ]
    },
    { id: 8, name: 'Cortadora Hidráulica HHG-22', category: 'cortahierro', price: 100000, icon: 'fa-bolt', badge: 'Ø4–22 mm', imgs: 1, folder: 'Cortadora de Varilla 22mm', ext: 'jpeg',
      desc: 'Cortadora hidráulica de mayor capacidad. Corta varillas de acero hasta Ø22mm sin esfuerzo.',
      specs: [
        { l: 'Rango de corte', v: 'Ø 4–22 mm' },
        { l: 'Fuerza hidráulica', v: '16 Ton' },
        { l: 'Peso', v: '6,2 kg' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHG-22' },
        { l: 'Rango de corte', v: 'Ø 4–22 mm' },
        { l: 'Fuerza hidráulica', v: '16 Ton' },
        { l: 'Peso', v: '6,2 kg' }
      ]
    },
    // Mordazas de torno
    { id: 10, name: 'Mordaza de Torno 80mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 80 mm', imgs: ['1.jpeg','2.png','5.webp'], folder: '80MM',
      desc: 'Plato de 3 mordazas autocentrantes con doble juego de mordazas. Para torno paralelo mecánico o cualquier máquina que requiera toma de piezas cilíndricas.',
      specs: [
        { l: 'Diámetro', v: 'Ø 80 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 16 mm' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'K11-80' },
        { l: 'Diámetro exterior', v: 'Ø 80 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 16 mm' },
        { l: 'Toma mínima ext.', v: 'Ø 2 mm' },
        { l: 'Fijación', v: '3 bulones M6 sobre Ø 66 mm' },
        { l: 'Incluye', v: '2 juegos de mordazas, manija y bulones' }
      ]
    },
    { id: 11, name: 'Mordaza de Torno 100mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 100 mm', imgs: ['1.jpeg','2.webp'], folder: '100MM',
      desc: 'Plato de 3 mordazas autocentrantes con doble juego de mordazas. Alta precisión, velocidad máxima 3.500 rpm. Para torno paralelo mecánico.',
      specs: [
        { l: 'Diámetro', v: 'Ø 100 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Vel. máxima', v: '3.500 rpm' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'K11-100' },
        { l: 'Diámetro exterior', v: 'Ø 100 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Vel. máxima', v: '3.500 rpm' },
        { l: 'Pasaje de barra', v: 'Ø 20 mm' },
        { l: 'Toma máx. ext.', v: 'Ø 90 mm' },
        { l: 'Toma máx. int.', v: 'Ø 80 mm' },
        { l: 'Altura sin mordazas', v: '55 mm' },
        { l: 'Peso', v: '4 kg' },
        { l: 'Fijación', v: '3 bulones M8 sobre Ø 84 mm' },
        { l: 'Incluye', v: '2 juegos de mordazas, manija y bulones' }
      ]
    },
    { id: 12, name: 'Mordaza de Torno 125mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 125 mm', imgs: ['1.jpeg','2.webp'], folder: '125MM',
      desc: 'Plato de 3 mordazas autocentrantes con doble juego de mordazas. Para torno paralelo mecánico o cualquier máquina que requiera toma de piezas cilíndricas.',
      specs: [
        { l: 'Diámetro', v: 'Ø 125 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 30 mm' }
      ],
      allSpecs: [
        { l: 'Diámetro exterior', v: 'Ø 125 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 30 mm' },
        { l: 'Toma mínima ext.', v: 'Ø 2,5 mm' },
        { l: 'Toma máx. ext.', v: 'Ø 125 mm' },
        { l: 'Toma máx. int.', v: 'Ø 110 mm' },
        { l: 'Altura sin mordazas', v: '58 mm' },
        { l: 'Fijación', v: '3 bulones M8 sobre Ø 108 mm' },
        { l: 'Incluye', v: '2 juegos de mordazas' }
      ]
    },
    { id: 35, name: 'Mordaza de Torno 160mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 160 mm', imgs: ['1.jpeg','2.jpg','3.jpg','4.webp'], folder: '160MM',
      desc: 'Plato de 3 mordazas autocentrantes con doble juego de mordazas. Para torno paralelo mecánico, montaje directo.',
      specs: [
        { l: 'Diámetro', v: 'Ø 160 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 45 mm' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'K11-160' },
        { l: 'Diámetro exterior', v: 'Ø 160 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 45 mm' },
        { l: 'Toma mínima ext.', v: 'Ø 3 mm' },
        { l: 'Toma máx. ext.', v: 'Ø 160 mm' },
        { l: 'Toma máx. int.', v: 'Ø 145 mm' },
        { l: 'Altura sin mordazas', v: '70 mm' },
        { l: 'Fijación', v: '3 bulones M8 sobre Ø 142 mm' },
        { l: 'Incluye', v: '2 juegos de mordazas, manual, manija y bulones' }
      ]
    },
    { id: 36, name: 'Mordaza de Torno 200mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 200 mm', imgs: ['1.webp','2.jpeg'], folder: '200MM',
      desc: 'Plato de 3 mordazas autocentrantes con doble juego de mordazas. Alta precisión para tornos grandes.',
      specs: [
        { l: 'Diámetro', v: 'Ø 200 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 65 mm' }
      ],
      allSpecs: [
        { l: 'Modelo', v: '200' },
        { l: 'Diámetro exterior', v: 'Ø 200 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Pasaje de barra', v: 'Ø 65 mm' },
        { l: 'Toma mínima ext.', v: 'Ø 4 mm' },
        { l: 'Toma máx. ext.', v: 'Ø 200 mm' },
        { l: 'Toma máx. int.', v: 'Ø 200 mm' },
        { l: 'Altura sin mordazas', v: '75 mm' },
        { l: 'Fijación', v: '3 bulones M10 sobre Ø 180 mm' },
        { l: 'Incluye', v: '2 juegos de mordazas, manual, manija y bulones' }
      ]
    },
    { id: 37, name: 'Mordaza de Torno 250mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 250 mm', imgs: ['1.jpeg','2.webp'], folder: '250MM',
      desc: 'Plato de 3 mordazas autocentrantes de gran capacidad para tornos industriales.',
      specs: [
        { l: 'Diámetro', v: 'Ø 250 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Montaje', v: 'Directo' }
      ],
      allSpecs: [
        { l: 'Diámetro exterior', v: 'Ø 250 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Montaje', v: 'Directo' },
        { l: 'Incluye', v: '2 juegos de mordazas' }
      ]
    },
    { id: 38, name: 'Mordaza de Torno 315mm', category: 'mordazas', price: 100000, icon: 'fa-grip-vertical', badge: 'Ø 315 mm', imgs: ['1.jpeg','2.webp','3.webp','4.webp'], folder: '315MM',
      desc: 'Plato de 3 mordazas autocentrantes con doble juego de mordazas. Para torno paralelo mecánico o cualquier máquina que requiera toma de piezas cilíndricas.',
      specs: [
        { l: 'Diámetro exterior', v: 'Ø 315 mm' },
        { l: 'Pasaje de barra', v: 'Ø 100 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' }
      ],
      allSpecs: [
        { l: 'Diámetro exterior', v: 'Ø 315 mm' },
        { l: 'Pasaje de barra', v: 'Ø 100 mm' },
        { l: 'Mordazas', v: '3 autocentrantes' },
        { l: 'Fijación', v: '3 bulones M16 sobre entrecentro Ø 285 mm' },
        { l: 'Toma mínima (ext.)', v: 'Ø 10 mm' },
        { l: 'Toma máxima (ext.)', v: 'Ø 140 mm' },
        { l: 'Toma máx. 2° escalón', v: 'Ø 315 mm' },
        { l: 'Incluye', v: '2 juegos de mordazas, manija y manual' }
      ]
    },
    // Bomba hidráulica
    { id: 13, name: 'Bomba Hidráulica Manual HHB-700', category: 'bombas', price: 100000, icon: 'fa-droplet', badge: 'Manual 700 bar', imgs: 2, folder: 'HHB-700', ext: 'jpeg',
      desc: 'Bomba hidráulica manual de alta presión. Manguera de 1.8m incluida con acople rápido R2 3/8". Ideal para cilindros y herramientas hidráulicas San Ou.',
      specs: [
        { l: 'Presión máx.', v: '700 bar' },
        { l: 'Manguera', v: '1,8 m' },
        { l: 'Acople', v: 'Rápido R2 3/8"' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHB-700' },
        { l: 'Tipo', v: 'Manual' },
        { l: 'Presión máx.', v: '700 bar' },
        { l: 'Manguera', v: '1,8 m alta presión' },
        { l: 'Acople', v: 'Rápido R2 3/8"' }
      ]
    },
    // Sacabocados
    { id: 16, name: 'Sacabocados Hidráulico HHK-8', category: 'sacabocados', price: 100000, icon: 'fa-bullseye', badge: 'Ø22–60 mm', imgs: ['1.jpeg','2.webp','3.webp'], folder: 'HHK-8',
      desc: 'Sacabocados hidráulico para chapas y tableros eléctricos. Incluye 6 matrices y llave.',
      specs: [
        { l: 'Rango de corte', v: 'Ø 22–60 mm' },
        { l: 'Fuerza hidráulica', v: '9 Ton' },
        { l: 'Matrices incluidas', v: '6 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHK-8' },
        { l: 'Rango de corte', v: 'Ø 22–60 mm' },
        { l: 'Fuerza hidráulica', v: '9 Ton' },
        { l: 'Incluye', v: '6 matrices + llave' }
      ]
    },
    { id: 17, name: 'Sacabocados Hidráulico HHK-15', category: 'sacabocados', price: 100000, icon: 'fa-bullseye', badge: 'Ø63–114 mm', imgs: 3, folder: 'HHK-15', ext: 'webp',
      desc: 'Sacabocados hidráulico de mayor capacidad para chapas y tableros eléctricos. Incluye 6 matrices y llave.',
      specs: [
        { l: 'Rango de corte', v: 'Ø 63–114 mm' },
        { l: 'Fuerza hidráulica', v: '13 Ton' },
        { l: 'Matrices incluidas', v: '6 piezas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHK-15' },
        { l: 'Rango de corte', v: 'Ø 63–114 mm' },
        { l: 'Fuerza hidráulica', v: '13 Ton' },
        { l: 'Incluye', v: '6 matrices + llave' }
      ]
    },
    { id: 18, name: 'Sacabocados Hidráulico HHK-8C', category: 'sacabocados', price: 100000, icon: 'fa-bullseye', badge: 'Ø22–60 mm', imgs: 3, folder: 'Hhk-8c', ext: 'webp',
      desc: 'Sacabocados hidráulico monoblock. Diseño compacto y robusto para tableros eléctricos.',
      specs: [
        { l: 'Rango de corte', v: 'Ø 22–60 mm' },
        { l: 'Tipo', v: 'Monoblock' },
        { l: 'Aplicación', v: 'Tableros eléctricos' }
      ],
      allSpecs: [
        { l: 'Tipo', v: 'Monoblock' },
        { l: 'Rango de corte', v: 'Ø 22–60 mm' },
        { l: 'Aplicación', v: 'Tableros eléctricos / chapas' }
      ]
    },
    // Cilindros hidráulicos telescópicos tipo pastilla (HHYG-D)
    { id: 19, name: 'Cilindro Hidráulico HHYG-10D',  category: 'cilindros', price: 100000, icon: 'fa-gauge-high', badge: '10 Toneladas', imgs: 3, folder: 'HHYG-10D', ext: 'jpeg',
      desc: 'Cilindro hidráulico telescópico tipo pastilla. Compacto y liviano, ideal para espacios reducidos. Bomba recomendada: HHB-700C.',
      specs: [{ l:'Capacidad', v:'10 Ton' }, { l:'Carrera', v:'25 mm' }, { l:'Altura cerrada', v:'45 mm' }],
      allSpecs: [{ l:'Capacidad', v:'10 Ton' }, { l:'Carrera', v:'25 mm' }, { l:'Altura cerrada', v:'45 mm' }, { l:'Cap. de aceite', v:'22 cc' }, { l:'Peso', v:'1,4 kg' }, { l:'Bomba recomendada', v:'HHB-700C' }] },
    { id: 20, name: 'Cilindro Hidráulico HHYG-20D',  category: 'cilindros', price: 100000, icon: 'fa-gauge-high', badge: '20 Toneladas', imgs: ['1.jpg', '2.jpeg'], folder: 'HHYG-20D',
      desc: 'Cilindro hidráulico telescópico tipo pastilla. Mayor capacidad de carga con diseño compacto. Bomba recomendada: HHB-700C.',
      specs: [{ l:'Capacidad', v:'20 Ton' }, { l:'Carrera', v:'26 mm' }, { l:'Altura cerrada', v:'52 mm' }],
      allSpecs: [{ l:'Capacidad', v:'20 Ton' }, { l:'Carrera', v:'26 mm' }, { l:'Altura cerrada', v:'52 mm' }, { l:'Cap. de aceite', v:'41 cc' }, { l:'Peso', v:'2,5 kg' }, { l:'Bomba recomendada', v:'HHB-700C' }] },
    { id: 21, name: 'Cilindro Hidráulico HHYG-30D',  category: 'cilindros', price: 100000, icon: 'fa-gauge-high', badge: '30 Toneladas', imgs: 1, folder: 'HHYG-30D',
      desc: 'Cilindro hidráulico telescópico tipo pastilla. Alta fuerza con estructura robusta de acero. Bomba recomendada: HHB-700C.',
      specs: [{ l:'Capacidad', v:'30 Ton' }, { l:'Carrera', v:'53 mm' }, { l:'Altura cerrada', v:'58 mm' }],
      allSpecs: [{ l:'Capacidad', v:'30 Ton' }, { l:'Carrera', v:'53 mm' }, { l:'Altura cerrada', v:'58 mm' }, { l:'Cap. de aceite', v:'67 cc' }, { l:'Peso', v:'4,1 kg' }, { l:'Bomba recomendada', v:'HHB-700C' }] },
    { id: 22, name: 'Cilindro Hidráulico HHYG-50D',  category: 'cilindros', price: 100000, icon: 'fa-gauge-high', badge: '50 Toneladas', imgs: ['1.jpg', '2.jpeg'], folder: 'HHYG-50D',
      desc: 'Cilindro hidráulico telescópico tipo pastilla. Para trabajos industriales de alta exigencia. Bomba recomendada: HHB-700C.',
      specs: [{ l:'Capacidad', v:'50 Ton' }, { l:'Carrera', v:'64 mm' }, { l:'Altura cerrada', v:'68 mm' }],
      allSpecs: [{ l:'Capacidad', v:'50 Ton' }, { l:'Carrera', v:'64 mm' }, { l:'Altura cerrada', v:'68 mm' }, { l:'Cap. de aceite', v:'113 cc' }, { l:'Peso', v:'6,4 kg' }, { l:'Bomba recomendada', v:'HHB-700C' }] },
    { id: 23, name: 'Cilindro Hidráulico HHYG-100D', category: 'cilindros', price: 100000, icon: 'fa-gauge-high', badge: '100 Toneladas', imgs: ['1.jpg', '2.webp', '3.webp'], folder: 'HHYG-100D',
      desc: 'Cilindro hidráulico telescópico tipo pastilla. Máxima capacidad de la línea, para aplicaciones industriales pesadas. Bomba recomendada: HHB-700C.',
      specs: [{ l:'Capacidad', v:'100 Ton' }, { l:'Carrera', v:'68 mm' }, { l:'Altura cerrada', v:'88 mm' }],
      allSpecs: [{ l:'Capacidad', v:'100 Ton' }, { l:'Carrera', v:'68 mm' }, { l:'Altura cerrada', v:'88 mm' }, { l:'Cap. de aceite', v:'225 cc' }, { l:'Peso', v:'14,5 kg' }, { l:'Bomba recomendada', v:'HHB-700C' }] },
    // Cortadoras para barras de cobre/aluminio
    { id: 30, name: 'Procesadora de Barras HHM-120HS', category: 'cortadoras', price: 100000, icon: 'fa-cut', badge: '3 en 1', imgs: 2, folder: '120HS', ext: 'webp', catFolder: 'cortadora para barras de cobrealuminio',
      desc: 'Procesadora hidráulica de barras de cobre/aluminio 3 en 1: corta, dobla y punzona cambiando el cabezal. Incluye 4 punzones.',
      specs: [
        { l: 'Capacidad de barra', v: '120 × 10 mm' },
        { l: 'Fuerza de salida', v: '23 Ton' },
        { l: 'Funciones', v: 'Corte + Doblado + Punzonado' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHM-120HS' },
        { l: 'Tipo', v: 'Procesadora 3 en 1 (por bomba hidráulica)' },
        { l: 'Funciones', v: 'Corte + Doblado + Punzonado' },
        { l: 'Fuerza de salida', v: '23 Ton' },
        { l: 'Capacidad de barra', v: '120 × 10 mm' },
        { l: 'Punzones incluidos', v: '3/8" / 1/2" / 5/8" / 3/4"' },
        { l: 'Peso bruto', v: '62,9 kg' },
        { l: 'Medidas de empaque', v: '63 × 27 × 29 cm' }
      ]
    },
    { id: 31, name: 'Cortadora Hidráulica HHM-150VQ', category: 'cortadoras', price: 100000, icon: 'fa-cut', badge: '150×10 mm', imgs: 3, folder: 'HHM-150VQ', ext: 'webp', catFolder: 'cortadora para barras de cobrealuminio',
      desc: 'Cortadora hidráulica para barras planas de cobre/aluminio. Ideal para tableros eléctricos y puesta a tierra.',
      specs: [
        { l: 'Ancho máx. de barra', v: '150 mm' },
        { l: 'Espesor máx.', v: '10 mm' },
        { l: 'Fuerza de corte', v: '20 Ton' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHM-150VQ' },
        { l: 'Aplicación', v: 'Barras Cu/Al (tableros, puesta a tierra)' },
        { l: 'Ancho máx. de barra', v: '150 mm' },
        { l: 'Espesor máx.', v: '10 mm' },
        { l: 'Fuerza de corte', v: '20 Ton' },
        { l: 'Sistema', v: 'Simple efecto, retorno por resorte' },
        { l: 'Presión de trabajo', v: '700 bar' }
      ]
    },
    { id: 32, name: 'Cortadora Hidráulica HHM-150Q', category: 'cortadoras', price: 100000, icon: 'fa-cut', badge: '150×10 mm', imgs: 3, folder: 'HHM-150Q', ext: 'webp', catFolder: 'cortadora para barras de cobrealuminio',
      desc: 'Cortadora hidráulica compacta para barras planas de cobre/aluminio. Simple efecto con retorno por resorte.',
      specs: [
        { l: 'Ancho máx. de barra', v: '150 mm' },
        { l: 'Espesor máx.', v: '10 mm' },
        { l: 'Fuerza de salida', v: '20 Ton' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHM-150Q' },
        { l: 'Aplicación', v: 'Barras planas de cobre / aluminio' },
        { l: 'Ancho máx. de barra', v: '150 mm' },
        { l: 'Espesor máx.', v: '10 mm' },
        { l: 'Fuerza de salida', v: '20 Ton' },
        { l: 'Sistema', v: 'Simple efecto, retorno por resorte' },
        { l: 'Presión de trabajo', v: '700 bar' },
        { l: 'Peso', v: '33,6 kg' },
        { l: 'Medidas de empaque', v: '32 × 23 × 44 cm' }
      ]
    },
    // Punzonadoras
    { id: 33, name: 'Punzonadora Hidráulica HHM-60', category: 'punzonadoras', price: 100000, icon: 'fa-circle-dot', badge: '3/8"–3/4"', catFolder: 'Punzadoras', imgs: 2, folder: 'HHM-60', ext: 'webp',
      desc: 'Punzonadora hidráulica para chapas de cobre y hierro. Punzona orificios de 3/8" a 3/4" sin necesidad de taladro.',
      specs: [
        { l: 'Rango de punzonado', v: '3/8" – 3/4"' },
        { l: 'Cobre máx.', v: '10 mm' },
        { l: 'Hierro máx.', v: '6 mm' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHM-60' },
        { l: 'Rango de punzonado', v: '3/8" – 3/4"' },
        { l: 'Espesor máx. cobre', v: '10 mm' },
        { l: 'Espesor máx. hierro', v: '6 mm' }
      ]
    },
    // Extractores hidráulicos
    { id: 34, name: 'Extractor Hidráulico HHL-5', category: 'extractores', extraCategories: ['motores'], price: 100000, icon: 'fa-up-from-bracket', badge: '5 Toneladas', catFolder: 'Extractor hidraulico', imgs: 3, folder: 'HHL-5', ext: 'webp',
      desc: 'Extractor hidráulico de rodamientos con bomba integrada. Funciona con 2 o 3 patas. Apertura regulable.',
      specs: [
        { l: 'Capacidad', v: '5 Ton' },
        { l: 'Apertura', v: '50–200 mm' },
        { l: 'Patas', v: '2 o 3 patas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'HHL-5' },
        { l: 'Capacidad', v: '5 Ton' },
        { l: 'Apertura', v: '50–200 mm' },
        { l: 'Patas', v: '2 o 3 patas intercambiables' },
        { l: 'Bomba', v: 'Integrada' }
      ]
    },
    // Herramientas para vehículos
    { id: 39, name: 'Multiplicador de Fuerza Torque Camión Tractor 7500 Nm', category: 'motores', price: 100000, icon: 'fa-wrench', badge: '7500 Nm', imgs: ['1.jpeg','2.webp','3.webp'], folder: 'Multiplicador De Fuerza Torque Camion Tractor 7500nm', catFolder: 'Herramientas para vehículos',
      desc: 'Multiplicador de torque manual para aflojar y ajustar tuercas de alta exigencia en camiones, tractores, colectivos y maquinaria pesada.',
      specs: [
        { l: 'Torque máximo', v: '7500 Nm' },
        { l: 'Relación de fuerza', v: '1:78' },
        { l: 'Encastre', v: '1 pulgada' }
      ],
      allSpecs: [
        { l: 'Torque máximo', v: '7500 Nm' },
        { l: 'Accionamiento', v: 'Manual por palanca' },
        { l: 'Encastre', v: '1 pulgada' },
        { l: 'Relación de fuerza', v: '1:78' },
        { l: 'Largo aproximado', v: '330 mm' },
        { l: 'Peso aproximado', v: '9 a 10 kg' },
        { l: 'Material', v: 'Acero reforzado' },
        { l: 'Tubos incluidos', v: '32 mm y 33 mm' },
        { l: 'Aplicación', v: 'Camiones, tractores, colectivos, trailers, maquinaria pesada' },
        { l: 'Presentación', v: 'Kit en maletín plástico' }
      ]
    },
    { id: 40, name: 'Kit Extractor de Rulemanes Cepo Grande 75 mm a 105 mm 9 Pzas', category: 'motores', price: 100000, icon: 'fa-wrench', badge: '75–105 mm', imgs: ['1.jpeg','2.webp','3.webp'], folder: 'Kit Extractor De Rulemanes Cepo Grande 75 Mm A 105 Mm 9 Pzs', catFolder: 'Herramientas para vehículos',
      desc: 'Kit extractor de rulemanes y rodamientos tipo cepo. Extrae rulemanes, poleas, engranajes y piezas ajustadas a presión. 9 piezas en maletín.',
      specs: [
        { l: 'Rango de apertura', v: '75 mm a 105 mm' },
        { l: 'Cantidad de piezas', v: '9 piezas' },
        { l: 'Tipo de agarre', v: 'Separador 2 garras / cepo' }
      ],
      allSpecs: [
        { l: 'Tipo de extractor', v: 'Cepo / separador de rulemanes' },
        { l: 'Rango de apertura', v: '75 mm a 105 mm' },
        { l: 'Cantidad de piezas', v: '9 piezas' },
        { l: 'Tipo de agarre', v: 'Separador de 2 garras / cepo' },
        { l: 'Función reversible', v: 'Sí' },
        { l: 'Largo tornillo principal', v: 'Aprox. 300 mm' },
        { l: 'Largo de garras', v: 'Aprox. 180 mm' },
        { l: 'Peso aproximado', v: '5 a 6,5 kg' },
        { l: 'Material', v: 'Acero reforzado' },
        { l: 'Aplicación', v: 'Mecánica automotor, talleres, maquinaria e industria' },
        { l: 'Presentación', v: 'Kit en maletín plástico' }
      ]
    },
    { id: 41, name: 'Extractor Rulemanes 3 Garras Kit Interior/Exterior', category: 'motores', price: 100000, icon: 'fa-wrench', badge: '3 garras', imgs: ['1.jpeg','2.webp','3.webp'], folder: 'Extractor Rulemanes 3 Garras Interior exterior', catFolder: 'Herramientas para vehículos',
      desc: 'Kit extractor de rulemanes de 3 garras interior y exterior. Extrae rodamientos, bujes, poleas y piezas ajustadas a presión. Maletín plástico rojo.',
      specs: [
        { l: 'Tipo de agarre', v: '3 garras' },
        { l: 'Función interior', v: 'Sí' },
        { l: 'Función exterior', v: 'Sí' }
      ],
      allSpecs: [
        { l: 'Tipo de extractor', v: '3 garras interior y exterior' },
        { l: 'Reversible', v: 'Sí' },
        { l: 'Material', v: 'Acero reforzado' },
        { l: 'Accesorios incluidos', v: 'Extractores de garras, barra/percutor deslizante, adaptadores y maletín' },
        { l: 'Aplicación', v: 'Mecánica automotor, talleres, maquinaria e industria' },
        { l: 'Presentación', v: 'Maletín plástico rojo' }
      ]
    },
    { id: 43, name: 'Juego Extractores de Rótulas Extremos Pitman Universal 5 Pz', category: 'motores', price: 100000, icon: 'fa-wrench', badge: '5 piezas', imgs: ['1.jpeg','2.webp','3.webp'], folder: 'Juego Extractores De Rotulas Extremos Pitman Universal 5 Pz', catFolder: 'Herramientas para vehículos',
      desc: 'Juego extractor de rótulas, extremos y pitman universal. 5 piezas de metal para autos y camionetas. Modelo MK14050.',
      specs: [
        { l: 'Modelo', v: 'MK14050' },
        { l: 'Cantidad de piezas', v: '5 piezas' },
        { l: 'Usos', v: 'Autos y camionetas' }
      ],
      allSpecs: [
        { l: 'Modelo', v: 'MK14050' },
        { l: 'Cantidad de piezas', v: '5 piezas' },
        { l: 'Material', v: 'Metal' },
        { l: 'Formas de las piezas', v: 'Variables' },
        { l: 'Usos recomendados', v: 'Autos y camionetas' },
        { l: 'Accesorios incluidos', v: '5 piezas' }
      ]
    },
    { id: 42, name: 'Extractor de Inyectores Diesel', category: 'motores', price: 100000, icon: 'fa-wrench', badge: '21 piezas', imgs: ['1.jpeg','2.webp','3.webp','4.webp'], folder: 'Extractor De Inyectores Diesel', catFolder: 'Herramientas para vehículos',
      desc: 'Extractor neumático de inyectores diésel. Retira inyectores trabados o atascados en motores common rail sin martillo de inercia manual.',
      specs: [
        { l: 'Presión de trabajo', v: '5 a 8 bar / 72–116 PSI' },
        { l: 'Cantidad de piezas', v: '21 piezas' },
        { l: 'Compatibilidad', v: 'Bosch, Delphi, Denso, Siemens' }
      ],
      allSpecs: [
        { l: 'Sistema de trabajo', v: 'Neumático / a golpe por vibración' },
        { l: 'Accionamiento', v: 'Por aire comprimido' },
        { l: 'Presión de trabajo', v: '72 a 116 PSI / 5 a 8 bar' },
        { l: 'Torque de trabajo', v: 'Aprox. 20 a 30 Nm' },
        { l: 'Cantidad de piezas', v: '21 piezas' },
        { l: 'Compatibilidad', v: 'Inyectores Bosch, Delphi, Denso y Siemens' },
        { l: 'Tipo de inyectores', v: 'Diésel / common rail' },
        { l: 'Adaptadores incluidos', v: 'M8, M12, M16, M17, M18, M20, M22, M25, M26, M27, M29 y M31' },
        { l: 'Material', v: 'Acero' },
        { l: 'Presentación', v: 'Kit completo en maletín' }
      ]
    },
];

const CAT_NAMES = {
    pinzas:      'Pinzas',
    dobladoras:  'Dobladoras de caño',
    cortahierro: 'Corta hierro',
    mordazas:    'Mordazas de torno',
    bombas:      'Bomba hidráulica',
    sacabocados: 'Sacabocados',
    cilindros:   'Cilindros hidráulicos',
    cortadoras:   'Cortadora para barras de cobre/aluminio',
    extractores:  'Extractor hidráulico',
    punzonadoras: 'Punzonadoras',
    motores:      'Herramientas para vehículos',
};

// ─── ESTADO ─────────────────────────────────────────────────────
let cart = [];

// ─── FORMATO ────────────────────────────────────────────────────
function fmt(n) {
    return '$' + n.toLocaleString('es-AR');
}

// ─── RENDER PRODUCTOS ───────────────────────────────────────────
function specsRows(specs) {
    if (!specs || specs.length === 0) return '';
    return specs.map(s => `
        <div class="spec-row">
            <span class="spec-label">${s.l}</span>
            <span class="spec-value">${s.v}</span>
        </div>`).join('');
}

function priceHTML(p) {
    if (!(p.price > 0)) return '';
    if (p.oldPrice > 0) {
        return `<div class="product-price-bar">
                   <span class="price-label">Precio</span>
                   <div class="price-values price-values--stack">
                       <span class="price-old">${fmt(p.oldPrice)}</span>
                       <span class="price-amount">${fmt(p.price)}</span>
                   </div>
               </div>`;
    }
    return `<div class="product-price-bar">
               <span class="price-label">Precio</span>
               <div class="price-values"><span class="price-amount">${fmt(p.price)}</span></div>
           </div>`;
}

function getImgs(p) {
    if (!p.imgs || p.imgs === 0) return [];
    const catFolder = p.catFolder || p.category;
    const folder = p.folder || p.name;
    if (Array.isArray(p.imgs)) {
        return p.imgs.map(f => `productos/${catFolder}/${folder}/${f}`);
    }
    const ext = p.ext || 'jpg';
    return Array.from({ length: p.imgs }, (_, i) =>
        `productos/${catFolder}/${folder}/${i + 1}.${ext}`
    );
}

function cardMedia(p) {
    const imgs = getImgs(p);
    if (imgs.length > 0) {
        return `<div class="product-media"><img src="${imgs[0]}" alt="${p.name}" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\\'product-media product-media-icon\\'><i class=\\'fas ${p.icon}\\'></i></div>'"></div>`;
    }
    return `<div class="product-media product-media-icon"><i class="fas ${p.icon}"></i></div>`;
}

function getVideo(p) {
    if (!p.video) return null;
    if (typeof p.video === 'string') return p.video; // URL de YouTube o ruta explícita
    const catFolder = p.catFolder || p.category;
    const folder = p.folder || p.name;
    return `productos/${catFolder}/${folder}/video.mp4`;
}

function buildVideoContent(url) {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (yt) {
        return `<iframe src="https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    }
    return `<video src="${url}" controls playsinline></video>`;
}

function modalMedia(p) {
    const imgs = getImgs(p);
    const videoSrc = getVideo(p);
    const items = [
        ...imgs.map(src => ({ type: 'img', src })),
        ...(videoSrc ? [{ type: 'video', src: videoSrc }] : [])
    ];

    if (items.length === 0) {
        return `<div class="modal-icon"><i class="fas ${p.icon}"></i></div>`;
    }
    if (items.length === 1 && items[0].type === 'img') {
        return `<div class="modal-img"><img src="${items[0].src}" alt="${p.name}" onerror="this.parentElement.outerHTML='<div class=\\'modal-icon\\'><i class=\\'fas ${p.icon}\\'></i></div>'"></div>`;
    }

    const slides = items.map((item, i) => {
        const active = i === 0 ? ' active' : '';
        const inner = item.type === 'video'
            ? buildVideoContent(item.src)
            : `<img src="${item.src}" alt="${p.name} ${i + 1}" onerror="this.style.display='none'">`;
        return `<div class="carousel-slide${active}">${inner}</div>`;
    }).join('');

    const dots = items.map((_, i) =>
        `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="carouselGo(${i})"></button>`
    ).join('');

    return `
        <div class="modal-carousel" id="modalCarousel" data-current="0" data-total="${items.length}">
            <div class="carousel-track">${slides}</div>
            <button class="carousel-prev" onclick="carouselStep(-1)"><i class="fas fa-chevron-left"></i></button>
            <button class="carousel-next" onclick="carouselStep(1)"><i class="fas fa-chevron-right"></i></button>
            <div class="carousel-dots">${dots}</div>
        </div>`;
}

function carouselStep(dir) {
    const el = document.getElementById('modalCarousel');
    if (!el) return;
    const total = parseInt(el.dataset.total);
    const current = parseInt(el.dataset.current);
    carouselGo((current + dir + total) % total);
}

function carouselGo(idx) {
    const el = document.getElementById('modalCarousel');
    if (!el) return;
    el.dataset.current = idx;
    el.querySelectorAll('.carousel-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
    el.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

let _currentFilter = 'all';

function renderProducts(filter, showAll = false) {
    _currentFilter = filter;
    const list = filter === 'all' ? products : products.filter(p => p.category === filter || (p.extraCategories && p.extraCategories.includes(filter)));
    const grid = document.getElementById('productsGrid');
    const verMasWrap = document.getElementById('verMasWrap');

    if (list.length === 0) {
        grid.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;text-align:center;padding:40px 0">No hay productos en esta categoría aún.</p>';
        if (verMasWrap) verMasWrap.style.display = 'none';
        return;
    }

    const limite = window.innerWidth <= 768 ? 4 : 8;
    const mostrar = (showAll || list.length <= limite) ? list : list.slice(0, limite);

    const cardHTML = p => {
        const isFav = getFavs().includes(p.id);
        return `
        <div class="product-card${p.inStock === false ? ' out-of-stock' : ''}" id="pc-${p.id}" onclick="openModal(${p.id})" style="cursor:pointer">
            <button class="fav-icon-btn${isFav ? ' active' : ''}" data-id="${p.id}" onclick="event.stopPropagation(); toggleFav(${p.id})" title="Guardar en favoritos">
                <i class="fas fa-heart"></i>
            </button>
            ${cardMedia(p)}
            <div class="product-info">
                <span class="product-badge">${p.badge || CAT_NAMES[p.category]}</span>
                <h3 class="product-name">${p.name}</h3>
                <p class="product-desc">${p.desc}</p>
                <div class="specs-table">${specsRows(p.specs)}</div>
                ${priceHTML(p)}
                <div class="product-buttons" onclick="event.stopPropagation()">
                    <button class="btn-add-cart" id="add-${p.id}" onclick="addToCart(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                        Agregar al carrito
                    </button>
                    <button class="btn-quick-buy" onclick="quickBuy(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                        Compra rápida
                    </button>
                </div>
                <button class="btn-ver-detalle" onclick="event.stopPropagation(); openModal(${p.id})">
                    Ver más detalles <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>`;
    };

    grid.innerHTML = mostrar.map(cardHTML).join('');

    // Mostrar u ocultar botón "Ver más"
    if (verMasWrap) {
        verMasWrap.style.display = (!showAll && list.length > limite) ? 'flex' : 'none';
    }
}

function mostrarTodosProductos() {
    renderProducts(_currentFilter, true);
    document.getElementById('verMasWrap').style.display = 'none';
}

// ─── MODAL DE DETALLE ────────────────────────────────────────────
function openModal(id) {
    const p = products.find(x => x.id === id);
    // GA4 — vista de producto
    if (typeof gtag !== 'undefined') {
        gtag('event', 'view_item', {
            items: [{ item_id: String(p.id), item_name: p.name, item_category: p.category, price: p.price || 0 }]
        });
    }
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-product">
            ${modalMedia(p)}
            <div class="modal-details">
                <span class="product-badge">${p.badge || CAT_NAMES[p.category]}</span>
                <h2 class="modal-title">${p.name}</h2>
                <p class="modal-desc">${p.desc}</p>
                <div class="specs-table modal-specs">${specsRows(p.allSpecs || p.specs)}</div>
                ${p.price > 0 ? `<div class="product-price-bar"><span class="price-label">Precio</span><div class="price-values">${p.oldPrice > 0 ? `<span class="price-old">${fmt(p.oldPrice)}</span>` : ''}<span class="price-amount">${fmt(p.price)}</span></div></div>` : '<div class="modal-consultar">Consultar precio por WhatsApp</div>'}
                <div class="modal-buttons">
                    <button class="btn-add-cart" onclick="addToCart(${p.id}); closeModal()">
                        Agregar al carrito
                    </button>
                    <button class="btn-quick-buy" onclick="quickBuy(${p.id})">
                        Compra rápida
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    history.replaceState(null, '', '#producto-' + id);
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('productModal').classList.remove('active');
    document.body.style.overflow = '';
    history.replaceState(null, '', window.location.pathname);
}

// ─── FILTRAR ────────────────────────────────────────────────────
function filterProducts(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    document.getElementById('searchInput').value = '';
    renderProducts(filter);
    document.getElementById('productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── BUSCADOR ────────────────────────────────────────────────────
function searchProducts(query) {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const grid = document.getElementById('productsGrid');
    const list = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
        (CAT_NAMES[p.category] || '').toLowerCase().includes(q) ||
        (p.badge || '').toLowerCase().includes(q)
    );
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (list.length === 0) {
        grid.innerHTML = `<p style="color:var(--gray);grid-column:1/-1;text-align:center;padding:40px 0">No se encontraron productos para "<strong style="color:var(--white)">${query}</strong>".</p>`;
    } else {
        grid.innerHTML = list.map(p => `
            <div class="product-card${p.inStock === false ? ' out-of-stock' : ''}" id="pc-${p.id}" onclick="openModal(${p.id})" style="cursor:pointer">
                ${cardMedia(p)}
                <div class="product-info">
                    <span class="product-badge">${p.badge || CAT_NAMES[p.category]}</span>
                    <h3 class="product-name">${p.name}</h3>
                    <p class="product-desc">${p.desc}</p>
                    <div class="specs-table">${specsRows(p.specs)}</div>
                    ${priceHTML(p)}
                    <div class="product-buttons" onclick="event.stopPropagation()">
                        <button class="btn-add-cart" id="add-${p.id}" onclick="addToCart(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                            Agregar al carrito
                        </button>
                        <button class="btn-quick-buy" onclick="quickBuy(${p.id})" ${p.inStock === false ? 'disabled' : ''}>
                            Compra rápida
                        </button>
                    </div>
                    <button class="btn-ver-detalle" onclick="event.stopPropagation(); openModal(${p.id})">
                        Ver más detalles <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    document.getElementById('productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── CARRITO ─────────────────────────────────────────────────────
function addToCart(id) {
    const product = products.find(p => p.id === id);
    // GA4 — agregar al carrito
    if (typeof gtag !== 'undefined') {
        gtag('event', 'add_to_cart', {
            currency: 'ARS',
            value: product.price || 0,
            items: [{ item_id: String(product.id), item_name: product.name, item_category: product.category, price: product.price || 0, quantity: 1 }]
        });
    }
    const existing = cart.find(i => i.id === id);
    // Klaviyo — mostrar modal si no tenemos email aún
    setTimeout(() => {
        if (!klUserEmail) abrirKlModal();
        else klTrackCart();
    }, 600);

    if (existing) {
        existing.qty++;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    updateCartUI();
    openCart();

    // Feedback visual en el botón
    const btn = document.getElementById(`add-${id}`);
    if (btn) {
        btn.classList.add('added');
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Agregado!';
        setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = '<i class="fas fa-cart-plus"></i> Agregar al carrito';
        }, 1800);
    }
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    updateCartUI();
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    updateCartUI();
}

function clearCart() {
    cart = [];
    updateCartUI();
}

function updateCartUI() {
    const total    = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const count    = cart.reduce((s, i) => s + i.qty, 0);
    const itemsEl  = document.getElementById('cartItems');
    const countEl  = document.getElementById('cartCount');
    const totalEl  = document.getElementById('cartTotal');
    const totalRow = document.getElementById('cartTotalRow');

    countEl.textContent = count;

    if (cart.length === 0) {
        itemsEl.innerHTML = `<div class="cart-empty"><p>Todavía no agregaste productos.</p></div>`;
        if (totalRow) totalRow.style.display = 'none';
        return;
    }

    if (totalRow) totalRow.style.display = 'flex';
    totalEl.textContent = fmt(total);

    itemsEl.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-icon">
                <i class="fas ${item.icon}"></i>
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-unit">Precio unitario: ${fmt(item.price)}</div>
                <div class="cart-item-subtotal">Subtotal: ${fmt(item.price * item.qty)}</div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)"><i class="fas fa-minus"></i></button>
                    <span class="qty-num">${item.qty}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, 1)"><i class="fas fa-plus"></i></button>
                    <button class="cart-item-remove" onclick="removeFromCart(${item.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// ─── ABRIR / CERRAR CARRITO ──────────────────────────────────────
function openCart() {
    document.getElementById('cartSidebar').classList.add('active');
    document.getElementById('cartOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    // Klaviyo — pedir email al abrir carrito si hay productos
    if (cart.length > 0) setTimeout(() => { if (!klUserEmail) abrirKlModal(); }, 800);
}

function closeCart() {
    document.getElementById('cartSidebar').classList.remove('active');
    document.getElementById('cartOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ─── WHATSAPP: CARRITO COMPLETO ──────────────────────────────────
function checkoutWhatsApp() {
    if (cart.length === 0) return;
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    let msg = '🛠 *Hola SanOu! Quiero cotizar los siguientes productos:*\n\n';
    cart.forEach(item => {
        msg += `▪ *${item.name}*\n`;
        msg += `  Cantidad: ${item.qty}\n`;
        msg += `  Precio unitario: ${fmt(item.price)}\n`;
        msg += `  Subtotal: ${fmt(item.price * item.qty)}\n\n`;
    });
    msg += `💰 *Total estimado: ${fmt(total)}*\n\n`;
    msg += '¿Pueden confirmar disponibilidad, stock y formas de pago? ¡Muchas gracias!';

    // Guardar en historial
    saveOrder(cart, total);

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── WHATSAPP: COMPRA RÁPIDA ─────────────────────────────────────
function quickBuy(id) {
    const p = products.find(x => x.id === id);
    // Klaviyo — pedir email antes de ir a WhatsApp
    if (!klUserEmail) {
        klModalMostrado = false; // forzar que aparezca
        abrirKlModal();
        // guardar el producto pendiente y continuar después
        document.getElementById('klModal').dataset.pendingQuickBuy = id;
        return;
    }
    _doQuickBuy(id);
}

function _doQuickBuy(id) {
    const p = products.find(x => x.id === id);
    // GA4 — compra rápida
    if (typeof gtag !== 'undefined') {
        gtag('event', 'compra_rapida', {
            currency: 'ARS',
            value: p.price || 0,
            items: [{ item_id: String(p.id), item_name: p.name, item_category: p.category, price: p.price || 0 }]
        });
    }
    let msg = `🛠 *Hola SanOu! Me interesa este producto:*\n\n`;
    msg += `▪ *${p.name}*\n`;
    msg += `  Categoría: ${CAT_NAMES[p.category]}\n`;
    msg += `  Precio de referencia: ${fmt(p.price)}\n\n`;
    msg += '¿Pueden confirmar disponibilidad, stock y formas de pago? ¡Muchas gracias!';

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── MENÚ MOBILE ────────────────────────────────────────────────
function toggleMenu() {
    const nav = document.getElementById('nav');
    const header = document.querySelector('.header');
    const icon = document.getElementById('menuToggle').querySelector('i');
    nav.classList.toggle('open');
    icon.className = nav.classList.contains('open') ? 'fas fa-times' : 'fas fa-bars';
    if (nav.classList.contains('open')) {
        nav.style.top = header.getBoundingClientRect().bottom + 'px';
    }
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        document.getElementById('nav').classList.remove('open');
        document.getElementById('menuToggle').querySelector('i').className = 'fas fa-bars';
    });
});

// ─── HEADER SCROLL ──────────────────────────────────────────────
window.addEventListener('scroll', () => {
    document.getElementById('header').style.padding = '0';
});

// ─── PRECIOS DESDE GOOGLE SHEETS ─────────────────────────────────
async function loadPricesFromSheet() {
    if (!PRICES_CSV_URL) return;
    try {
        const res = await fetch(PRICES_CSV_URL);
        const text = await res.text();
        const rows = text.trim().split('\n').slice(1); // saltar encabezado
        rows.forEach(row => {
            if (!row.trim()) return;
            const parts = row.split(',');
            // Buscar columna de stock (TRUE/FALSE/si/no) de derecha a izquierda
            let stockIdx = -1;
            for (let i = parts.length - 1; i >= 0; i--) {
                const val = parts[i].trim().toLowerCase();
                if (val === 'true' || val === 'false' || val === 'si' || val === 'no') {
                    stockIdx = i;
                    break;
                }
            }
            if (stockIdx < 1) return;
            const inStock = ['true', 'si'].includes(parts[stockIdx].trim().toLowerCase());
            const precio = parts[stockIdx - 1].trim();
            const nombre = parts.slice(0, stockIdx - 1).join(',').trim().replace(/^"|"$/g, '');
            const oldPriceRaw = parts.slice(stockIdx + 1).join(',').trim();
            const product = products.find(p => p.name.toLowerCase() === nombre.toLowerCase());
            if (product) {
                const priceVal    = precio      ? parseInt(precio.replace(/[$\.,]/g, ''))      : 0;
                const oldPriceVal = oldPriceRaw ? parseInt(oldPriceRaw.replace(/[$\.,]/g, '')) : 0;
                if (priceVal > 0 && oldPriceVal > 0) {
                    // Ambos precios: muestra el actual + tachado
                    product.price    = priceVal;
                    product.oldPrice = oldPriceVal;
                } else if (priceVal > 0) {
                    // Solo precio actual
                    product.price    = priceVal;
                    product.oldPrice = 0;
                } else if (oldPriceVal > 0) {
                    // Solo precio ML: usarlo como precio principal
                    product.price    = oldPriceVal;
                    product.oldPrice = 0;
                }
                product.inStock = inStock;
            }
        });
    } catch (e) {
        console.warn('No se pudieron cargar precios desde Google Sheets:', e);
    }
}

// ─── PRODUCTOS DESTACADOS ────────────────────────────────────────
const FEATURED_IDS = [1, 3, 8];
let featuredCurrent = 0;
let featuredTimer = null;

function renderFeatured() {
    const track = document.getElementById('featuredTrack');
    const dotsEl = document.getElementById('featuredDots');
    if (!track || !dotsEl) return;

    const items = FEATURED_IDS.map(id => products.find(p => p.id === id)).filter(Boolean);

    track.innerHTML = items.map((p, i) => {
        const imgs = getImgs(p);
        const imgHTML = imgs.length
            ? `<img src="${imgs[0]}" alt="${p.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas ${p.icon} featured-icon\\'></i>'">`
            : `<i class="fas ${p.icon} featured-icon"></i>`;
        const specsHTML = p.specs.filter(s => s.l).map(s =>
            `<div class="featured-spec-row"><span>${s.l}</span><span>${s.v}</span></div>`
        ).join('');
        return `
        <div class="featured-slide${i === 0 ? ' active' : ''}" data-id="${p.id}" style="cursor:pointer">
            <div class="featured-media">${imgHTML}</div>
            <div class="featured-info">
                <span class="featured-badge">${p.badge || ''}</span>
                <h3 class="featured-name">${p.name}</h3>
                <div class="featured-specs">${specsHTML}</div>
                <button class="featured-cta" onclick="event.stopPropagation();openModal(${p.id})">
                    <i class="fas fa-eye"></i> Ver más detalles
                </button>
            </div>
        </div>`;
    }).join('');

    dotsEl.innerHTML = items.map((_, i) =>
        `<button class="featured-dot${i === 0 ? ' active' : ''}" onclick="featuredGo(${i})"></button>`
    ).join('');

    featuredTimer = setInterval(() => featuredGo((featuredCurrent + 1) % items.length), 15000);

    // Swipe táctil
    let touchStartX = 0;
    let featuredSwiped = false;
    track.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        featuredSwiped = false;
    }, { passive: true });
    track.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) < 40) return;
        featuredSwiped = true;
        const total = FEATURED_IDS.length;
        if (diff > 0) featuredGo((featuredCurrent + 1) % total);
        else featuredGo((featuredCurrent - 1 + total) % total);
    }, { passive: true });
    track.addEventListener('click', e => {
        if (featuredSwiped) { featuredSwiped = false; return; }
        const slide = e.target.closest('.featured-slide');
        if (slide) {
            const id = parseInt(slide.dataset.id);
            if (id) openModal(id);
        }
    });
}

function featuredGo(idx) {
    const track = document.getElementById('featuredTrack');
    const dotsEl = document.getElementById('featuredDots');
    if (!track) return;
    track.querySelectorAll('.featured-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
    dotsEl.querySelectorAll('.featured-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    featuredCurrent = idx;
}

// ─── FILTER DROPDOWN ─────────────────────────────────────────────
function toggleFilterDropdown() {
    const menu  = document.getElementById('filterDropdownMenu');
    const btn   = document.getElementById('filterDropdownBtn');
    const arrow = document.getElementById('filterArrow');
    const open  = menu.classList.toggle('open');
    btn.classList.toggle('open', open);
    arrow.classList.toggle('open', open);
}

function selectFilter(cat, label) {
    document.getElementById('filterDropdownLabel').textContent = label;
    document.querySelectorAll('.filter-option').forEach(o => o.classList.toggle('active', o.dataset.filter === cat));
    toggleFilterDropdown();
    // Actualizar URL con la categoría seleccionada
    if (cat === 'all') {
        history.replaceState(null, '', window.location.pathname);
    } else {
        history.replaceState(null, '', '#categoria-' + cat);
    }
    filterProducts(cat);
}

// Cerrar al hacer click fuera
document.addEventListener('click', e => {
    const wrap = document.getElementById('filterBar');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('filterDropdownMenu')?.classList.remove('open');
        document.getElementById('filterDropdownBtn')?.classList.remove('open');
        document.getElementById('filterArrow')?.classList.remove('open');
    }
});

// ─── MAYORISTAS ──────────────────────────────────────────────────
function enviarMayorista() {
    const nombre    = document.getElementById('mayoristaNombre').value.trim();
    const localidad = document.getElementById('mayoristaLocalidad').value.trim();
    const rubro     = document.getElementById('mayoristaRubro').value.trim();
    const msg       = document.getElementById('mayoristaMsg').value.trim();

    let texto = `🏪 *Consulta de Revendedor / Mayorista*\n\n`;
    if (nombre)    texto += `👤 *Nombre:* ${nombre}\n`;
    if (localidad) texto += `📍 *Localidad:* ${localidad}\n`;
    if (rubro)     texto += `🔧 *Rubro:* ${rubro}\n`;
    if (msg)       texto += `\n💬 *Mensaje:*\n${msg}\n`;
    texto += `\n¡Quiero más información sobre precios mayoristas y cómo ser revendedor de San Ou!`;

    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(texto), '_blank');
}

// ─── CATÁLOGO PDF ────────────────────────────────────────────────
function openCatalog() {
    const base = window.location.href.replace(/[^\/]*$/, '');

    function firstImg(p) {
        const catFolder = p.catFolder || p.category;
        const folder    = p.folder || p.name;
        if (Array.isArray(p.imgs)) return base + `productos/${catFolder}/${folder}/${p.imgs[0]}`;
        const ext = p.ext || 'jpg';
        return base + `productos/${catFolder}/${folder}/1.${ext}`;
    }

    const catOrder = ['pinzas','dobladoras','cortahierro','mordazas','bombas','sacabocados','cilindros','cortadoras','extractores','punzonadoras','motores'];

    let body = '';
    catOrder.forEach(cat => {
        const prods = products.filter(p => p.category === cat || (p.extraCategories || []).includes(cat));
        if (!prods.length) return;
        body += `<div class="cat-section">
            <div class="cat-header">${CAT_NAMES[cat] || cat}</div>
            <div class="prods-grid">`;
        prods.forEach(p => {
            const img = firstImg(p);
            const price = p.price ? `$${p.price.toLocaleString('es-AR')}` : 'Consultar precio';
            const allSpecsList = p.allSpecs || p.specs || [];
            const specs = allSpecsList.map(s =>
                `<tr><td class="sl">${s.l}</td><td class="sv">${s.v}</td></tr>`).join('');
            body += `<div class="pc">
                <div class="pi"><img src="${img}" alt="${p.name}" onerror="this.src='';this.parentElement.innerHTML='<div class=ni>⚙</div>'"></div>
                <div class="pd">
                    <span class="pb">${p.badge || CAT_NAMES[p.category] || ''}</span>
                    <h3 class="pn">${p.name}</h3>
                    ${p.desc ? `<p class="pdesc">${p.desc}</p>` : ''}
                    ${specs ? `<table class="st"><tbody>${specs}</tbody></table>` : ''}
                    <div class="pp">${price}</div>
                </div>
            </div>`;
        });
        body += `</div></div>`;
    });

    const logoUrl = base + 'Logo 2.png';
    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catálogo SanOu</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#f2f2f2;color:#111}
/* COVER */
.cover{background:#0D0D0D;color:#fff;padding:60px 24px;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cover img{height:140px;margin-bottom:10px}
.cover .slogan{font-size:1.3rem;font-weight:900;margin-bottom:24px;line-height:1.3}
.cover .slogan-white{color:#fff}
.cover .slogan-yellow{color:#FFD700;display:block}
.cover .line{width:60px;height:4px;background:#FFD700;margin:18px auto}
.cover h1{font-size:2.4rem;color:#FFD700;letter-spacing:4px;margin-bottom:6px}
.cover .sub{color:#aaa;font-size:0.9rem;margin-bottom:4px}
.cover .contact{margin-top:28px;width:100%;max-width:780px}
.cover .contact-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:left}
.cover .contact-item{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:14px 16px}
.cover .contact-icon{font-size:1.4rem;width:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.icon-wa{color:#25D366}
.icon-mail{color:#1a73e8}
.icon-web{color:#aaa}
.icon-loc{color:#ea4335}
.icon-ig{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.icon-tt{color:#fff}
.cover .contact-label{font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
.cover .contact-val{font-size:0.88rem;color:#fff;font-weight:700}
/* SECTION */
.cat-section{margin-bottom:4px}
.cat-header{background:#FFD700;color:#0D0D0D;font-size:0.95rem;font-weight:900;padding:9px 16px;text-transform:uppercase;letter-spacing:2px}
/* GRID */
.prods-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#ddd;margin-bottom:4px}
/* CARD */
.pc{background:#fff;display:flex;flex-direction:column}
.pi{width:100%;height:160px;overflow:hidden;background:#f5f5f5;display:flex;align-items:center;justify-content:center}
.pi img{width:100%;height:100%;object-fit:contain}
.ni{font-size:3rem;color:#ccc;display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.pd{padding:10px;display:flex;flex-direction:column;gap:5px;flex:1}
.pb{display:inline-block;background:#FFF8CC;color:#7a5c00;border:1px solid #FFD700;border-radius:3px;font-size:0.6rem;font-weight:700;padding:2px 6px;text-transform:uppercase;letter-spacing:1px}
.pn{font-size:0.85rem;font-weight:800;line-height:1.3;color:#111}
.pdesc{font-size:0.67rem;color:#777;line-height:1.4}
.st{width:100%;border-collapse:collapse;font-size:0.65rem;margin-top:2px}
.st tr{border-bottom:1px solid #f0f0f0}
.sl{color:#999;padding:3px 4px 3px 0;font-weight:600;width:52%}
.sv{color:#333;font-weight:700;text-align:right;padding:3px 0}
.pp{margin-top:auto;padding-top:6px;font-size:0.9rem;font-weight:900;color:#7a5c00;border-top:1px solid #f0f0f0}
/* FOOTER */
.cat-footer{background:#0D0D0D;color:#aaa;text-align:center;padding:18px;font-size:0.78rem;margin-top:4px}
.cat-footer b{color:#FFD700}
/* DOWNLOAD BAR */
.dl-bar{position:sticky;top:0;z-index:999;background:#FFD700;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;box-shadow:0 2px 12px rgba(0,0,0,0.2);flex-wrap:wrap}
.dl-bar p{font-size:0.8rem;font-weight:600;color:#0D0D0D;text-align:center}
.dl-btn{background:#0D0D0D;color:#FFD700;border:none;padding:9px 22px;border-radius:50px;font-size:0.9rem;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:8px;transition:opacity 0.2s;white-space:nowrap}
.dl-btn:hover{opacity:0.85}
/* MOBILE */
@media(max-width:640px){
    .cover{padding:40px 16px;min-height:auto}
    .cover img{height:90px}
    .cover .slogan{font-size:1rem}
    .cover h1{font-size:1.6rem;letter-spacing:2px}
    .cover .contact-grid{grid-template-columns:1fr 1fr;gap:8px}
    .cover .contact-val{font-size:0.78rem}
    .prods-grid{grid-template-columns:1fr 1fr;gap:3px}
    .pi{height:130px}
    .pn{font-size:0.78rem}
    .pd{padding:8px}
    .dl-bar p{display:none}
    .dl-btn{width:100%;justify-content:center}
}
@media(max-width:380px){
    .prods-grid{grid-template-columns:1fr}
    .pi{height:180px}
    .cover .contact-grid{grid-template-columns:1fr}
}
@media print{
    .dl-bar{display:none}
    body{background:#fff}
    .cover{page-break-after:always}
    .pc{page-break-inside:avoid}
}
</style></head><body>
<div class="cover">
    <img src="${logoUrl}" alt="SanOu" onerror="this.style.display='none'">
    <p class="slogan"><span class="slogan-white">Equípate con</span><span class="slogan-yellow">herramientas de verdad</span></p>
    <div class="line"></div>
    <h1>CATÁLOGO</h1>
    <p class="sub">Herramientas hidráulicas e industriales</p>
    <div class="line"></div>
    <div class="contact">
        <div class="contact-grid">
            <div class="contact-item">
                <span class="contact-icon"><i class="fab fa-whatsapp icon-wa"></i></span>
                <div><div class="contact-label">WhatsApp</div><div class="contact-val">+54 9 11 3175-1517</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fas fa-envelope icon-mail"></i></span>
                <div><div class="contact-label">Email</div><div class="contact-val">sanou.argentina@gmail.com</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fas fa-globe icon-web"></i></span>
                <div><div class="contact-label">Web</div><div class="contact-val">sanou.com.ar</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fas fa-location-dot icon-loc"></i></span>
                <div><div class="contact-label">Dirección</div><div class="contact-val">Marcelo Camboa 6306, Bs. As.</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fab fa-instagram icon-ig"></i></span>
                <div><div class="contact-label">Instagram</div><div class="contact-val">@sanou.arg</div></div>
            </div>
            <div class="contact-item">
                <span class="contact-icon"><i class="fab fa-tiktok icon-tt"></i></span>
                <div><div class="contact-label">TikTok</div><div class="contact-val">@san.ou</div></div>
            </div>
        </div>
    </div>
</div>
${body}
<div class="cat-footer"><b>SanOu</b> — Herramientas hidráulicas profesionales &nbsp;|&nbsp; sanou.com.ar &nbsp;|&nbsp; +54 9 11 3175-1517</div>
<script>
function descargarPDF() {
    const btn = document.getElementById('dlBtn');
    btn.textContent = '⏳ Generando...';
    btn.disabled = true;
    const bar = document.querySelector('.dl-bar');
    bar.style.display = 'none';
    html2pdf().set({
        margin: 0,
        filename: 'catalogo-sanou.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(document.body).save().then(() => {
        bar.style.display = 'flex';
        btn.textContent = '⬇ Descargar PDF';
        btn.disabled = false;
    });
}
<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}

// ─── WHATSAPP WIDGET ─────────────────────────────────────────────
(function() {
    const timeEl = document.getElementById('waBubbleTime');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    }
})();

function toggleWaWidget() {
    const popup = document.getElementById('waWidgetPopup');
    if (!popup) return;
    const isOpen = popup.classList.contains('open');
    if (isOpen) {
        popup.style.opacity = '0';
        popup.style.transform = 'scale(0.85) translateY(20px)';
        setTimeout(() => { popup.classList.remove('open'); }, 280);
    } else {
        popup.classList.add('open');
        // forzar reflow para que la transición funcione
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'scale(1) translateY(0)';
        });
        document.getElementById('waWidgetInput').focus();
    }
}

function sendWaMessage() {
    const input = document.getElementById('waWidgetInput');
    const msg = input.value.trim();
    // GA4 — mensaje por widget WhatsApp
    if (typeof gtag !== 'undefined') {
        gtag('event', 'whatsapp_widget', { event_category: 'contacto', event_label: msg || '(sin mensaje)' });
    }
    const prefix = 'Hola San Ou!! quisiera hacer una consulta.\n\n';
    const text = encodeURIComponent(msg ? prefix + msg : prefix);
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + text, '_blank');
    input.value = '';
}

// ─── INIT ────────────────────────────────────────────────────────
loadPricesFromSheet().then(() => {
    const hash = window.location.hash;

    // Abrir categoría si viene en la URL (#categoria-XXX)
    const catMatch = hash.match(/^#categoria-(\w+)$/);
    if (catMatch) {
        const cat = catMatch[1];
        const label = CAT_NAMES[cat];
        if (label) {
            renderProducts(cat);
            renderFeatured();
            document.getElementById('filterDropdownLabel').textContent = label;
            document.querySelectorAll('.filter-option').forEach(o => o.classList.toggle('active', o.dataset.filter === cat));
            setTimeout(() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
            return;
        }
    }

    renderProducts('all');
    renderFeatured();

    // Abrir producto si viene en la URL (#producto-ID)
    const match = hash.match(/^#producto-(\d+)$/);
    if (match) {
        const id = parseInt(match[1]);
        setTimeout(() => openModal(id), 500);
    }
});

// Abrir widget WhatsApp automáticamente al entrar (solo desktop)
window.addEventListener('load', () => {
    if (window.innerWidth >= 769) {
        setTimeout(() => {
            const popup = document.getElementById('waWidgetPopup');
            if (popup && !popup.classList.contains('open')) {
                toggleWaWidget();
            }
        }, 2500);
    }

    // Iniciar módulos nuevos
    initWishlist();
    initStagger();
    initStats();
    injectStructuredData();
});

// ─────────────────────────────────────────────────────────────────
// 4. SHARE BUTTON
// ─────────────────────────────────────────────────────────────────
function shareProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const url = `${location.origin}${location.pathname}?p=${id}`;
    if (navigator.share) {
        navigator.share({ title: p.name, text: `Mirá este producto de San Ou: ${p.name}`, url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('🔗 Link copiado al portapapeles');
        });
    }
}

// Auto-abrir producto desde URL param ?p=ID
(function checkUrlProduct() {
    const params = new URLSearchParams(location.search);
    const pid = parseInt(params.get('p'));
    if (pid) {
        // Esperar a que los productos carguen
        const tryOpen = () => {
            if (products.length) {
                openModal(pid);
                history.replaceState(null, '', location.pathname);
            } else {
                setTimeout(tryOpen, 100);
            }
        };
        setTimeout(tryOpen, 300);
    }
})();

function showToast(msg) {
    let t = document.getElementById('sanouToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'sanouToast';
        t.className = 'sanou-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
}

// Inyectar botón compartir en el modal (se llama desde openModal)
const _origOpenModal = openModal;
openModal = function(id) {
    _origOpenModal(id);
    // Agregar botón share + corazón al modal luego de renderizar
    setTimeout(() => {
        const details = document.querySelector('.modal-details');
        if (!details || details.querySelector('.modal-share-row')) return;
        const p = products.find(x => x.id === id);
        const isFav = getFavs().includes(id);
        const row = document.createElement('div');
        row.className = 'modal-share-row';
        row.innerHTML = `
            <button class="btn-share-modal" onclick="shareProduct(${id})">
                <i class="fas fa-share-alt"></i> Compartir
            </button>
            <button class="btn-fav-modal ${isFav ? 'active' : ''}" id="favModalBtn-${id}" onclick="toggleFav(${id})">
                <i class="fas fa-heart"></i> ${isFav ? 'Guardado' : 'Guardar'}
            </button>`;
        const btns = details.querySelector('.modal-buttons');
        if (btns) btns.after(row);
    }, 50);
};

// ─────────────────────────────────────────────────────────────────
// 5. STAGGER ANIMACIONES (anime.js)
// ─────────────────────────────────────────────────────────────────
function initStagger() {
    if (typeof anime === 'undefined') return;

    // Stagger en category cards al entrar en viewport
    const catObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                catObserver.disconnect();
                const cats = document.querySelectorAll('.category-card');
                // Safety: asegurar visibilidad si la animación falla
                const safety = setTimeout(() => {
                    cats.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none'; });
                }, 2000);
                anime({
                    targets: '.category-card',
                    opacity: [0, 1],
                    translateY: [30, 0],
                    scale: [0.92, 1],
                    duration: 500,
                    easing: 'easeOutExpo',
                    delay: anime.stagger(70),
                    complete() { clearTimeout(safety); }
                });
            }
        });
    }, { threshold: 0.1 });

    const catGrid = document.querySelector('.categories-grid');
    if (catGrid) {
        catObserver.observe(catGrid);
    }

    // Stagger en product cards al filtrar (hook en renderProducts)
    const _origRender = window.renderProducts;
    if (typeof renderProducts !== 'undefined') {
        const origRenderProducts = renderProducts;
        window.renderProducts = function(...args) {
            origRenderProducts(...args);
            setTimeout(() => staggerProductCards(), 30);
        };
    }
}

function staggerProductCards() {
    const cards = document.querySelectorAll('.product-card');
    if (!cards.length) return;

    // Garantizar visibilidad siempre, incluso si anime.js falla
    cards.forEach(c => {
        c.style.opacity = '1';
        c.style.transform = 'none';
    });

    if (typeof anime === 'undefined') return;

    // Pre-set solo translateY (no opacity) para que las cards no queden invisibles si la animación falla
    cards.forEach(c => { c.style.transform = 'translateY(20px)'; });

    // Safety fallback: si anime no completa en 1500ms, forzar estado final
    const safety = setTimeout(() => {
        cards.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none'; });
    }, 1500);

    anime({
        targets: '.product-card',
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 400,
        easing: 'easeOutExpo',
        delay: anime.stagger(45),
        complete() { clearTimeout(safety); }
    });
}

// ─────────────────────────────────────────────────────────────────
// 6. CONTADORES ANIMADOS
// ─────────────────────────────────────────────────────────────────
function initStats() {
    const statsBar = document.querySelector('.stats-bar');
    if (!statsBar) return;

    let fired = false;

    function runCounters() {
        if (fired) return;
        fired = true;

        document.querySelectorAll('.stat-num').forEach(el => {
            const target = parseInt(el.dataset.target);
            if (typeof anime !== 'undefined') {
                anime({
                    targets: el,
                    innerHTML: [0, target],
                    duration: 1800,
                    easing: 'easeOutExpo',
                    round: 1
                });
            } else {
                // Fallback sin anime.js
                let current = 0;
                const step = Math.ceil(target / 40);
                const timer = setInterval(() => {
                    current = Math.min(current + step, target);
                    el.textContent = current;
                    if (current >= target) clearInterval(timer);
                }, 40);
            }
        });

        if (typeof anime !== 'undefined') {
            anime({
                targets: '.stat-item',
                opacity: [0, 1],
                translateY: [20, 0],
                duration: 600,
                easing: 'easeOutExpo',
                delay: anime.stagger(120)
            });
        }
    }

    // Observer con threshold bajo para que dispare fácil
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                runCounters();
                observer.disconnect();
            }
        });
    }, { threshold: 0.05 });

    observer.observe(statsBar);

    // Fallback: si después de 3s no disparó el observer, mostrar igual
    setTimeout(() => { if (!fired) runCounters(); }, 3000);
}

// ─────────────────────────────────────────────────────────────────
// 8. WISHLIST / FAVORITOS
// ─────────────────────────────────────────────────────────────────
function getFavs() {
    try { return JSON.parse(localStorage.getItem('sanou_favs') || '[]'); }
    catch(e) { return []; }
}
function saveFavs(arr) {
    localStorage.setItem('sanou_favs', JSON.stringify(arr));
    updateFavCount();
}
function updateFavCount() {
    const n = getFavs().length;
    const el = document.getElementById('favCount');
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
}
function toggleFav(id) {
    let favs = getFavs();
    const idx = favs.indexOf(id);
    if (idx === -1) {
        favs.push(id);
        showToast('❤️ Guardado en favoritos');
    } else {
        favs.splice(idx, 1);
        showToast('🤍 Eliminado de favoritos');
    }
    saveFavs(favs);
    // Actualizar botones de fav en cards
    document.querySelectorAll(`.fav-icon-btn[data-id="${id}"]`).forEach(btn => {
        btn.classList.toggle('active', favs.includes(id));
    });
    // Actualizar botón en modal si está abierto
    const favModalBtn = document.getElementById(`favModalBtn-${id}`);
    if (favModalBtn) {
        favModalBtn.classList.toggle('active', favs.includes(id));
        favModalBtn.innerHTML = `<i class="fas fa-heart"></i> ${favs.includes(id) ? 'Guardado' : 'Guardar'}`;
    }
}

function initWishlist() {
    updateFavCount();
    // Inyectar ícono fav en cards (se hace al renderizar)
    const origCardHTML = window._origCardHTML; // no existe aún, ver hook abajo
}

function openFavs() {
    const favs = getFavs();
    const panel = document.getElementById('favPanel');
    const body  = document.getElementById('favBody');
    const favProds = products.filter(p => favs.includes(p.id));
    if (favProds.length === 0) {
        body.innerHTML = '<div class="panel-empty"><i class="fas fa-heart-broken"></i><p>Todavía no guardaste favoritos.</p></div>';
    } else {
        body.innerHTML = favProds.map(p => {
            const imgs = getImgs(p);
            const imgSrc = imgs[0] || '';
            return `<div class="panel-product-row" onclick="openModal(${p.id}); closeFavs()">
                ${imgSrc ? `<img src="${imgSrc}" alt="${p.name}" class="panel-prod-img">` : `<div class="panel-prod-icon"><i class="fas ${p.icon}"></i></div>`}
                <div class="panel-prod-info">
                    <strong>${p.name}</strong>
                    <span>${p.price > 0 ? fmt(p.price) : 'Consultar precio'}</span>
                </div>
                <button class="panel-remove-btn" onclick="event.stopPropagation(); toggleFav(${p.id}); openFavs()">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        }).join('');
    }
    document.getElementById('favOverlay').classList.add('active');
    panel.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeFavs() {
    document.getElementById('favPanel').classList.remove('active');
    document.getElementById('favOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────────────────
// 10. HISTORIAL DE PEDIDOS
// ─────────────────────────────────────────────────────────────────
function saveOrder(cartItems, total) {
    const orders = JSON.parse(localStorage.getItem('sanou_orders') || '[]');
    orders.unshift({
        id: Date.now(),
        date: new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        items: cartItems.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
        total
    });
    // Guardar máximo 20 pedidos
    localStorage.setItem('sanou_orders', JSON.stringify(orders.slice(0, 20)));
}

function openOrders() {
    const orders = JSON.parse(localStorage.getItem('sanou_orders') || '[]');
    const body = document.getElementById('ordersBody');
    if (orders.length === 0) {
        body.innerHTML = '<div class="panel-empty"><i class="fas fa-inbox"></i><p>Todavía no enviaste pedidos.</p></div>';
    } else {
        body.innerHTML = orders.map(o => `
            <div class="order-card">
                <div class="order-card-header">
                    <span class="order-date"><i class="fas fa-clock"></i> ${o.date}</span>
                    <span class="order-total">${fmt(o.total)}</span>
                </div>
                <ul class="order-items">
                    ${o.items.map(i => `<li><span>${i.name}</span><span>x${i.qty} · ${fmt(i.price * i.qty)}</span></li>`).join('')}
                </ul>
            </div>`).join('');
    }
    document.getElementById('ordersOverlay').classList.add('active');
    document.getElementById('ordersPanel').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeOrders() {
    document.getElementById('ordersPanel').classList.remove('active');
    document.getElementById('ordersOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────────────────
// 11. STRUCTURED DATA (JSON-LD)
// ─────────────────────────────────────────────────────────────────
function injectStructuredData() {
    // Schema para la organización
    const orgSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "San Ou",
        "url": "https://sanou.com.ar",
        "logo": "https://sanou.com.ar/Logo 2.png",
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+54-9-11-3175-1517",
            "contactType": "customer service",
            "availableLanguage": "Spanish"
        }
    };

    // Schema para cada producto
    const productSchemas = products.map(p => ({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p.name,
        "description": p.desc || '',
        "brand": { "@type": "Brand", "name": "San Ou" },
        "offers": {
            "@type": "Offer",
            "priceCurrency": "ARS",
            "price": p.price > 0 ? p.price : undefined,
            "availability": p.inStock === false
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            "url": `https://sanou.com.ar?p=${p.id}`,
            "seller": { "@type": "Organization", "name": "San Ou" }
        }
    }));

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify([orgSchema, ...productSchemas]);
    document.head.appendChild(script);
}

// ─── RESEÑAS DE USUARIOS ─────────────────────────────────────────
// Pegá acá la URL de tu Google Apps Script después de desplegarlo
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxH3Mb50iIDoL_njaEDUODDmD0K2HJ1UNp4GIHe_veSrkVYfgG03TCWp4NlWuQyK_7h/exec';

const REVIEWS_KEY = 'sanou_reviews';
let allUserReviews = [];
let reviewsShown = 4;

// Guardar en localStorage como backup
function saveReviewLocal(review) {
    try {
        const reviews = JSON.parse(localStorage.getItem(REVIEWS_KEY) || '[]');
        reviews.unshift(review);
        localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
    } catch(e) {}
}

// Mezclar array aleatoriamente (distinto orden en cada visita)
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function renderUserReviews() {
    const container = document.getElementById('userReviewsList');
    const btnVerMas = document.getElementById('btnVerMasReviews');
    if (!container) return;

    const visible = allUserReviews.slice(0, reviewsShown);

    if (!visible.length) {
        container.innerHTML = '<p class="no-reviews-msg">Sé el primero en dejar tu reseña.</p>';
        if (btnVerMas) btnVerMas.style.display = 'none';
        return;
    }

    container.innerHTML = visible.map(r => `
        <div class="testimonial-card user-review-card">
            <div class="testi-stars">${'★'.repeat(Number(r.stars))}${'☆'.repeat(5 - Number(r.stars))}</div>
            <p class="testi-text">"${r.text}"</p>
            <div class="testi-author">
                <div class="testi-avatar">${String(r.name).charAt(0).toUpperCase()}</div>
                <div>
                    <strong>${r.name}</strong>
                    <span>${r.role ? r.role + (r.city ? ' — ' + r.city : '') : (r.city || '')}</span>
                </div>
            </div>
        </div>
    `).join('');

    if (btnVerMas) {
        btnVerMas.style.display = allUserReviews.length > reviewsShown ? 'flex' : 'none';
    }
}

function verMasReviews() {
    reviewsShown += 4;
    renderUserReviews();
}

async function loadUserReviews() {
    // Si no tiene URL configurada, usa localStorage
    if (!SHEETS_URL || SHEETS_URL === 'TU_URL_AQUI') {
        try {
            const local = JSON.parse(localStorage.getItem(REVIEWS_KEY) || '[]');
            allUserReviews = shuffleArray(local);
        } catch(e) { allUserReviews = []; }
        renderUserReviews();
        return;
    }

    try {
        const res = await fetch(SHEETS_URL);
        const data = await res.json();
        allUserReviews = shuffleArray(data);
    } catch(e) {
        // Fallback a localStorage si falla la conexión
        try {
            const local = JSON.parse(localStorage.getItem(REVIEWS_KEY) || '[]');
            allUserReviews = shuffleArray(local);
        } catch(e2) { allUserReviews = []; }
    }
    renderUserReviews();
}

async function submitReview(e) {
    e.preventDefault();
    const name  = document.getElementById('reviewName').value.trim();
    const role  = document.getElementById('reviewRole').value.trim();
    const city  = document.getElementById('reviewCity').value.trim();
    const text  = document.getElementById('reviewText').value.trim();
    const stars = parseInt(document.querySelector('.star-btn.selected')?.dataset.val || '0');

    const errEl = document.getElementById('reviewError');
    if (!name || !text || !stars) {
        errEl.style.display = 'block';
        errEl.textContent = !stars ? 'Seleccioná una puntuación.' : 'Nombre y reseña son obligatorios.';
        return;
    }
    errEl.style.display = 'none';

    const review = { name, role, city, text, stars, date: new Date().toLocaleDateString('es-AR') };

    // Enviar a Google Sheets
    if (SHEETS_URL && SHEETS_URL !== 'TU_URL_AQUI') {
        try {
            const params = new URLSearchParams({ action: 'submit', ...review });
            await fetch(SHEETS_URL + '?' + params.toString(), { mode: 'no-cors' });
        } catch(err) {}
    }

    // Guardar localmente como backup
    saveReviewLocal(review);

    // Agregar a la lista visible sin recargar
    allUserReviews.unshift(review);
    reviewsShown = Math.max(reviewsShown, 1);
    renderUserReviews();

    // Reset form
    document.getElementById('reviewForm').reset();
    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected', 'hovered'));

    document.getElementById('reviewFormWrap').style.display = 'none';
    document.getElementById('reviewSuccess').style.display = 'block';
    setTimeout(() => {
        document.getElementById('reviewSuccess').style.display = 'none';
        document.getElementById('reviewFormWrap').style.display = 'block';
    }, 3500);
}

function initStarRating() {
    const stars = document.querySelectorAll('.star-btn');
    stars.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            const val = parseInt(btn.dataset.val);
            stars.forEach(b => b.classList.toggle('hovered', parseInt(b.dataset.val) <= val));
        });
        btn.addEventListener('mouseleave', () => {
            stars.forEach(b => b.classList.remove('hovered'));
        });
        btn.addEventListener('click', () => {
            stars.forEach(b => b.classList.remove('selected'));
            stars.forEach(b => {
                if (parseInt(b.dataset.val) <= parseInt(btn.dataset.val)) b.classList.add('selected');
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadUserReviews();
    initStarRating();
    const form = document.getElementById('reviewForm');
    if (form) form.addEventListener('submit', submitReview);
    initHeroVideo();
});

// ─── VIDEO HERO ALEATORIO ─────────────────────────────────────────
function initHeroVideo() {
    const videos = [
        'video1 70mm.mp4',
        'video2.mp4',
        'video3.mp4',
        'video4.mp4'
    ];
    const video = document.getElementById('heroVideo');
    const src   = document.getElementById('heroVideoSrc');
    if (!video || !src) return;
    const chosen = videos[Math.floor(Math.random() * videos.length)];
    src.src = chosen;
    video.load();
    video.play().catch(() => {});
}
