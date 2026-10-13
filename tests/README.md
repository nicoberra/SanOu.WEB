# Pruebas de SanOu

| Prueba | Qué verifica | Dónde corre |
|---|---|---|
| `node tests/test-gs.js` | El Apps Script real (`apps-script-crm.gs`) contra planillas simuladas: permisos, límites anti-abuso, honeypot, idempotencia, borrado por id, catálogo sin costo, cachés, JSONP seguro. | **Local** (el `.gs` no está en el repo; en CI se saltea) |
| `node tests/test-front.js` | Sintaxis de todos los JS, links locales, JSON-LD válido, sitemap, un H1 por página indexable. | Local y GitHub Actions |
| `node tests/smoke.mjs` | Abre las páginas principales en Chromium (390px y 1440px): sin errores de JS ni scroll horizontal. Bloquea Apps Script y analytics. | GitHub Actions (local si Playwright está instalado) |
| `tests/carga/` | Prueba de carga k6, **solo contra una copia** de la planilla. | Manual |

Antes de pegar un `.gs` nuevo en Apps Script: `node tests/test-gs.js` tiene que dar 0 errores.
