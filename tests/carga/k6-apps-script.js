// Prueba de carga del backend (Apps Script) de San Ou — SOLO contra una COPIA.
// NUNCA apuntar a la implementación real: usa la planilla real y manda avisos reales a Telegram.
//
// Cómo correrla (ver README.md de esta carpeta):
//   k6 run -e URL="https://script.google.com/macros/s/XXXX/exec" -e VUS=50 -e DUR=60s tests/carga/k6-apps-script.js
//
// Escenarios (se eligen con -e ESCENARIO=...):
//   lectura   → mayorista_list (lectura pública; con caché debería ser rápida y estable)
//   eventos   → evento_add (tracking de visitas: muchas escrituras chicas, sin lock)
//   pedidos   → add Cotizaciones con cid repetido cada 5 pedidos (sirve para verificar que NO se duplican)
//   mixto     → 70 % lectura + 20 % eventos + 10 % pedidos (parecido a una campaña real)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const URL = __ENV.URL;
if (!URL || URL.indexOf('/exec') < 0) throw new Error('Pasá -e URL=<url /exec de la COPIA del Apps Script>');
const VUS = parseInt(__ENV.VUS || '50', 10);
const DUR = __ENV.DUR || '60s';
const ESCENARIO = __ENV.ESCENARIO || 'mixto';
const RUN = Date.now().toString(36);   // marca de esta corrida (para encontrar las filas en la copia)

export const options = {
  vus: VUS,
  duration: DUR,
  thresholds: {
    http_req_duration: ['p(95)<4000'],   // Apps Script suele andar entre 0,5 y 3 s
    'checks': ['rate>0.97'],
  },
};

const errores = new Counter('errores_backend');
const limitados = new Counter('limitados_429');
const tLectura = new Trend('t_mayorista_list', true);
const tEvento = new Trend('t_evento_add', true);
const tPedido = new Trend('t_add_cotizacion', true);

function llamar(params, trend) {
  const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  // Apps Script redirige (302) a script.googleusercontent.com: k6 sigue el redirect solo.
  const res = http.get(URL + '?' + qs, { tags: { accion: params.action } });
  trend.add(res.timings.duration);
  let ok = false, body = null;
  try { body = JSON.parse(res.body); ok = body && body.ok === true; } catch (e) {}
  if (body && /Demasiadas solicitudes/.test(body.error || '')) limitados.add(1);
  else if (!ok) errores.add(1);
  check(res, { 'status 200': r => r.status === 200, 'ok:true': () => ok });
  return body;
}

export default function () {
  const vu = __VU, it = __ITER;
  const dado = Math.random();
  const esc = ESCENARIO === 'mixto' ? (dado < 0.7 ? 'lectura' : dado < 0.9 ? 'eventos' : 'pedidos') : ESCENARIO;

  if (esc === 'lectura') {
    llamar({ action: 'mayorista_list' }, tLectura);
  } else if (esc === 'eventos') {
    llamar({ action: 'evento_add', tab: 'Clientes', tipo: 'visita', sesion: 'k6-' + RUN + '-' + vu,
             fuente: 'k6', pais: 'AR', disp: 'test' }, tEvento);
  } else {
    // Cada 5 pedidos repetimos el cid: el backend tiene que devolver el mismo id y NO crear otra fila.
    const grupo = Math.floor(it / 5);
    const cid = 'ck6' + RUN + vu + 'g' + grupo;
    llamar({ action: 'add', tab: 'Cotizaciones', cid: cid,
             cliente: 'Prueba k6 ' + RUN, telefono: '1100000' + String(vu).padStart(4, '0'),
             detalle: '1x Prueba de carga', monto: '1000', estado: 'Abierta',
             notas: 'k6|' + RUN }, tPedido);
  }
  sleep(Math.random() * 2 + 0.5);   // una persona real no dispara requests sin pausa
}

export function handleSummary(data) {
  const m = data.metrics;
  const p = (n) => (m[n] && m[n].values) ? m[n].values : {};
  const resumen = {
    corrida: RUN, escenario: ESCENARIO, vus: VUS, duracion: DUR,
    requests: p('http_reqs').count,
    p50_ms: Math.round(p('http_req_duration')['p(50)'] || 0),
    p95_ms: Math.round(p('http_req_duration')['p(95)'] || 0),
    max_ms: Math.round(p('http_req_duration').max || 0),
    errores_backend: p('errores_backend').count || 0,
    limitados_429: p('limitados_429').count || 0,
    fallas_http: p('http_req_failed').passes || 0,
    nota: 'Duplicados: en la COPIA de la planilla, pestaña Cotizaciones, contá filas con notas = "k6|' + RUN + '". Tienen que ser 1 por cada cid distinto (pedidos / 5 por VU).'
  };
  return {
    stdout: '\n=== RESUMEN ===\n' + JSON.stringify(resumen, null, 2) + '\n',
    ['tests/carga/resultado-' + ESCENARIO + '-' + VUS + 'vus-' + RUN + '.json']: JSON.stringify(resumen, null, 2),
  };
}
