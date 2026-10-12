# San Ou — Escalabilidad, rendimiento y crecimiento

Auditoría técnica del 12/10/2026 sobre el proyecto real (web + cotizador + mayorista + CRM).
Punto de restauración: tag `antes-escalabilidad-20261012`. Cambios en la rama `escalabilidad`.

## 1. Arquitectura real (verificada en el código)

```
Visitante ──► GitHub Pages (estático: index.html, categoria/, producto/, mayorista.html, envios.html…)
   │            ├─ catalogo-productos.js  (catálogo embebido, precio 0)
   │            ├─ precios: CSV PUBLICADO del Sheet "Precios web"  (script.js:607, PRICES_CSV_URL)
   │            ├─ fotos.json / recortes.json  (los escribe el CRM vía GitHub API)
   │            └─ GA4 (gtag) + anime.js + Font Awesome desde CDN
   │
   └──► Apps Script "CRM" (UNA sola implementación, misma URL en script.js, cotizador.js,
        panel.js y mayorista.html) ──► Google Sheets:
              · "SanOu CRM"   (Clientes, Cotizaciones, Pedidos, Seguimientos, Eventos, Logs)
              · "Precios web" (productos: precio, stock, ML, destacado, costo USD)
              · "Mayorista"   (lista que se comparte por link)
        y ──► GitHub API (fotos, fotos.json, recortes.json; token GH_TOKEN en Propiedades del script)
        y ──► Telegram (avisos; TG_TOKEN / TG_CHAT en Propiedades del script)
```

**Quién llama a qué (desde la web pública, sin clave):**

| Origen | Acción | Cuándo | Costo en el backend |
|---|---|---|---|
| `script.js` `sanouTrack()` | `evento_add` | 1 visita/persona/día + 1 por producto/categoría/carrito vistos por día; compras y abandonos siempre | 1 `appendRow` |
| `script.js` `guardarCotizacionWeb()` | `add` Cotizaciones | al pedir presupuesto | lectura de ids + `appendRow` + Telegram |
| `script.js` login/registro | `login` / `registrar` | cuenta de cliente | `getDataRange` de Clientes |
| `mayorista.html` | `mayorista_list` | cada visita a la lista mayorista | `getDataRange` del Sheet mayorista (ahora con caché 5 min) |
| `cotizar.html` (`cotizador.js`) | `panel_login`, `list` Clientes, `add` Cotizaciones/Clientes | uso interno con clave | varios `getDataRange` |
| `panel.html` (`panel.js`) | todo lo demás (requiere clave) | solo Nicolás | lecturas completas por pestaña |

**Lo que NO existe (confirmado):** triggers programados, `MailApp`, `apps-script-clientes.gs` en uso
(es el backend viejo; quedó local y gitignorado, la web ya no lo llama). Antes de la v22 tampoco
había `LockService` ni `CacheService`.

**Precios y catálogo ya están fuera del Apps Script**: el catálogo viaja embebido en
`catalogo-productos.js` y los precios en el CSV publicado por Google (CDN de Google, sin cuota de
Apps Script). Ese es el punto más importante: **una visita normal no toca el Apps Script salvo
para el tracking**, que es *fire-and-forget* (`sendBeacon`).

## 2. Cuotas que importan (cuenta Google personal) y cuándo se alcanzan

| Cuota | Límite | Lo usa | Escenario en que se alcanza |
|---|---|---|---|
| Ejecuciones simultáneas del script | **30** | cada request al Apps Script | ~15–25 requests por **segundo** sostenidos (cada ejecución dura 0,5–2 s). Visitas: con el dedupe por día, 5.000 visitantes **simultáneos** recién llegados = pico de `evento_add`; se frena con `aplicarLimites` (1.500/min) y el resto se descarta (tracking, no pedidos). |
| Tiempo por ejecución | 6 min | lecturas completas de una pestaña | nunca con < 100.000 filas (una lectura de 50.000 × 13 celdas tarda ~3–6 s). |
| URL Fetch por día | 20.000 | Telegram (1 por cotización/registro web) + GitHub (fotos/recortes desde el CRM) | 2.000 pedidos/día + uso normal del CRM ≈ 2.500/día → **lejos**. |
| Mails por día | 100 | no se usa | — |
| Celdas por planilla | 10.000.000 | CRM (Eventos es la que más crece: 15 col.) | Eventos: 1.000 visitas/día × ~4 eventos ≈ 4.000 filas/día → 60.000 celdas/día → **~4,5 años**. Pero la **lectura completa** (`eventosStats`) se vuelve lenta mucho antes (ver 3.3). |
| CacheService | 100 KB por valor | caché de `mayorista_list` | lista > ~900 productos no entra en caché (hoy ~40). |

## 3. Cuellos de botella reales, ordenados por gravedad

### 3.1 🔴 Dos pedidos en el mismo segundo / doble clic → duplicados (RESUELTO en v22)
- `apps-script-crm.gs` `agregar()`: no había lock ni idempotencia; un reintento del navegador o un
  doble clic creaba dos cotizaciones iguales.
- **Ahora:** la web manda `cid` (hash del contenido + hora: `script.js` `sanouCid()`,
  `cotizador.js`), `agregar()` devuelve la fila existente si el `cid` ya está, y las escrituras
  del CRM van con `conLock()` (LockService). Para la web el lock es "blando": si en 10 s no se
  libera **se escribe igual** (nunca se pierde un pedido) y queda en `Logs`.

### 3.2 🔴 Escrituras públicas sin freno (RESUELTO en v22)
- `evento_add`, `add`, `registrar`, `login`, `panel_login` eran públicas sin límite ni largo máximo.
- **Ahora:** `limpiarParams()` corta cada campo (500 caracteres; `notas` 40.000; `detalle` 5.000),
  `aplicarLimites()` frena por minuto / 10 minutos (global y por email/teléfono/sesión),
  honeypot `web` (campo oculto: si viene lleno, responde ok y no guarda) y `panel_login`
  limitado a 30 intentos cada 10 min (fuerza bruta).

### 3.3 🟠 Lecturas de rango completo en cada request (`getDataRange`, 13 lugares)
- `listar()`, `agregar()` (dedupe de Clientes), `registrar()`, `login()`, `actualizar()`,
  `borrar()`, `eventosStats()`, `abandonosList()`, `productosListar()`, `mayoristaListar()`.
- Con **< 10.000 filas** por pestaña: 0,3–1,5 s, aceptable. Con **50.000+** (Eventos lo alcanza
  en ~1 año con 500 visitas/día): 3–8 s por llamada y el panel de Estadísticas se siente lento.
- **Hecho:** caché de `mayorista_list` (la única lectura pública pesada). `login`/`registrar`
  leen solo cuando alguien crea cuenta (poco frecuente).
- **Pendiente (etapa 1):** `eventosStats` incremental (totales guardados en Propiedades/pestaña
  "Resumen" y recalculados solo para el día) y rotación de Eventos (mover filas > 12 meses a otra
  planilla). Requiere tu OK porque toca la estructura.

### 3.4 🟠 El CRM renderiza todas las filas (`panel.js`: `list` + `innerHTML` por pestaña)
- Con 2.000 clientes anda; con 20.000 el navegador tarda y el `list` pesa ~5 MB por JSONP.
- **Pendiente (etapa 1):** `list` con `desde`/`limite` y búsqueda en el servidor; en el panel,
  carga de a 200 con "ver más". Cambio mediano, sin tocar la planilla.

### 3.5 🟡 Tracking propio duplicado con GA4
- `sanouTrack` guarda en Sheets lo mismo que GA4 ya mide (visitas, fuentes, dispositivos). Es lo que
  más filas genera. Si Eventos crece de más, la opción barata es dejar visitas/categorías en GA4 y
  mandar al Sheet solo compras, carritos y abandonos (los que tienen contacto). Decisión tuya.

### 3.6 🟡 Front
- `index.html` carga 632 KB de JS/CSS propios (script.js 127 KB, styles.css 167 KB, catálogo 52 KB)
  + anime.js + Font Awesome. Para 5.000 visitantes simultáneos **no es problema** (GitHub Pages +
  CDN), sí para el tiempo de carga en 3G: minificar script.js/styles.css ahorra ~40 %.
- `recortes/` pesa 5,4 MB en PNG (se cargan solo al hacer hover/entrar en viewport).
- Falta `recortes/Hhk-8c.png` (404 en consola, preexistente).

### 3.7 ✅ Lo que ya estaba bien
- Catálogo y precios servidos como estático/CSV (no dependen del Apps Script).
- La web **degrada bien**: si el Apps Script no responde, el catálogo, el carrito, el presupuesto
  PDF y WhatsApp siguen funcionando (todas las llamadas son `try/catch` + *fire-and-forget*).
- Escapado en el CRM (`esc()` en 106 lugares), auth por hash en todas las acciones privadas.

## 4. Seguridad (resumen; detalle en el reporte del 12/10)
- 🔴 **Token de Telegram en el historial público del repo** (commits `c155d65`…`9cbdd88`, hasta
  `81dcf47`). Acción tuya: revocarlo en @BotFather y cargar el nuevo en `TG_TOKEN`.
- ✅ `GH_TOKEN` y `PANEL_PASS_HASH` nunca estuvieron en el repo; `.gs` gitignorados.
- ✅ v22: límites, honeypot, largo máximo, callback JSONP validado (`/^[\w.$]{1,80}$/`).
- Datos personales (Ley 25.326): el CRM guarda nombre, teléfono, email, CUIT, dirección. Mínimo
  necesario para cotizar/entregar. Accede solo quien tiene la clave del panel; la planilla vive en
  tu cuenta Google (backup = historial de versiones de Sheets + copia mensual recomendada:
  Archivo → Hacer una copia). La columna `clave` (hash) nunca se devuelve por la API.

## 5. Qué se cambió ahora (v22, seguro, sin tocar la planilla)

| Archivo | Cambio |
|---|---|
| `apps-script-crm.gs` | `limpiarParams`, `conLock`, `contar/limitar/aplicarLimites`, `registrarLog` (pestaña **Logs** que se crea sola + Telegram máx. 1 aviso/30 min por error), honeypot, callback validado, idempotencia por `cid` en `agregar`, caché 5 min en `mayoristaListar` (se invalida al guardar), versión `v22-escala`. |
| `script.js` | `sanouCid()`; `guardarCotizacionWeb` manda `cid`, usa `keepalive` y reintenta 1 vez si falla la red. |
| `cotizador.js` | ídem para las cotizaciones del cotizador interno. |
| `mayorista.html` | copia local de la lista (7 días): se muestra al instante y sobrevive a una caída del backend. |
| `tests/carga/` | script k6 + README para medir contra una COPIA. |

**Para activar el backend:** pegar `apps-script-crm.gs` completo en el editor de Apps Script →
*Implementar → Administrar implementaciones → ✏️ → Versión: Nueva → Implementar* (misma URL; la
web no cambia). Verificar con `…/exec?action=version` → `v22-escala`.

## 6. Límites medidos
*Todavía sin medir.* Correr `tests/carga/README.md` contra la copia y anotar acá:

| Fecha | Escenario | VUs | p50 | p95 | errores | limitados | duplicados |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Hasta tener estos números, **no afirmamos** cuántos usuarios simultáneos soporta. La estimación
teórica (cuota de 30 ejecuciones simultáneas × ~1 s) es ~15–25 requests/s al backend; como una
visita normal hace 0–2 requests y los pedidos son fire-and-forget, eso equivale a **cientos de
visitantes simultáneos y decenas de pedidos por minuto** sin tocar nada más.

## 7. Plan por etapas e indicadores

| Etapa | Disparador (medible) | Qué hacer | Costo | Trabajo |
|---|---|---|---|---|
| **0 — hoy (v22)** | — | lock, idempotencia, límites, caché, logs | USD 0 | hecho |
| **1 — CRM grande** | > 5.000 filas en una pestaña, o `list` > 3 s, o Estadísticas > 5 s | `list` paginado + búsqueda en servidor; `eventosStats` incremental; rotar Eventos a planilla de archivo | USD 0 | 1–2 días |
| **2 — mucho tráfico** | p95 del backend > 4 s en horario normal, o errores "Too many simultaneous invocations" en *Ejecuciones*, o > 1.000 pedidos/día | Mayorista y datos de solo lectura como **JSON estático** regenerado desde el CRM (igual que fotos.json) y servido por GitHub Pages; tracking de visitas solo en GA4 | USD 0 | 1 día |
| **3 — picos de campaña** | > 20 pedidos en el mismo minuto de forma habitual, o pérdida de pedidos en Logs | **Cloudflare Worker + KV** delante del Apps Script: recibe el pedido en < 50 ms, lo encola y lo escribe al Sheet de a uno (sin cuota de simultáneos) | Free (100k req/día) o USD 5/mes | 2–3 días |
| **4 — base de datos** | > 100.000 clientes/pedidos, varios usuarios del CRM al mismo tiempo, o necesidad de reportes complejos | **Supabase (Postgres)** con RLS; Sheets queda como export | Free (500 MB) → USD 25/mes (Pro) | 1–2 semanas + migración (con tu OK, nunca sin backup) |

Costos en ARS: multiplicar por el dólar del día (ej. a $1.500/USD: USD 5 ≈ $7.500/mes;
USD 25 ≈ $37.500/mes). Nada de servidores propios ni microservicios: no hacen falta antes de la
etapa 4, y aun ahí Supabase es administrado.

**Indicadores a mirar una vez por mes** (5 minutos):
1. Apps Script → *Ejecuciones*: tiempo promedio y errores de los últimos 7 días.
2. Planilla CRM: filas por pestaña (Eventos es la que crece).
3. Pestaña `Logs`: cuántos "lock ocupado" o errores hubo.
4. GA4: visitantes por día y pico por hora.
5. Pedidos por día (Cotizaciones + Pedidos del mes ÷ 30).

## 8. Lo que queda para tu OK (no se hizo)
- Etapa 1 (paginación del CRM, estadísticas incrementales, archivo de Eventos).
- Dejar el tracking de visitas solo en GA4.
- Minificar `script.js` / `styles.css` en el build (`gen-seo-paginas.js` podría hacerlo).
- Revocar el token de Telegram expuesto (lo hacés vos).
