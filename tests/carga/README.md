# Pruebas de carga del backend (Apps Script)

**Regla número uno: nunca contra producción.** La planilla real, la implementación real del
Apps Script y los avisos de Telegram no se tocan. Todo se hace sobre una **copia**.

## 1. Armar el entorno de prueba (lo hacés vos, 10 minutos, una sola vez)

1. **Copia de la planilla del CRM**: Google Sheets → abrí "SanOu CRM" → Archivo → *Hacer una copia*
   → nombrala `SanOu CRM (PRUEBAS)`. Borrá las filas de datos reales de Clientes / Cotizaciones /
   Pedidos / Seguimientos / Eventos (dejá los títulos). Copiá el ID de la URL
   (`/spreadsheets/d/<ID>/edit`).
2. **Copia de la planilla mayorista** (opcional, solo para el escenario `lectura`): igual que arriba.
3. **Apps Script de prueba**: script.google.com → *Nuevo proyecto* → pegá `apps-script-crm.gs`
   completo → cambiá arriba `CRM_ID` por el ID de la copia (y `MAYORISTA_ID`/`MAYORISTA_GID`
   si copiaste el mayorista). **No cargues** `GH_TOKEN` ni `TG_TOKEN` en Propiedades del script
   de este proyecto: así la copia no puede tocar GitHub ni mandarte avisos. Sí cargá un
   `PANEL_PASS_HASH` cualquiera.
4. *Implementar → Nueva implementación → Aplicación web* (Ejecutar como: vos / Acceso: cualquier
   usuario). Copiá la URL que termina en `/exec`. **Esa** es la que se usa abajo.

## 2. Instalar k6 (una vez)

```bash
winget install k6 --source winget
```

## 3. Correr

Desde la carpeta del proyecto (`SanOu`). Reemplazá la URL por la de la **copia**:

```bash
k6 run -e URL="https://script.google.com/macros/s/COPIA/exec" -e ESCENARIO=lectura -e VUS=50 -e DUR=60s tests/carga/k6-apps-script.js
```

```bash
k6 run -e URL="https://script.google.com/macros/s/COPIA/exec" -e ESCENARIO=mixto -e VUS=200 -e DUR=90s tests/carga/k6-apps-script.js
```

```bash
k6 run -e URL="https://script.google.com/macros/s/COPIA/exec" -e ESCENARIO=pedidos -e VUS=500 -e DUR=60s tests/carga/k6-apps-script.js
```

Escenarios: `lectura` (mayorista_list), `eventos` (tracking), `pedidos` (add Cotizaciones con cid
repetido), `mixto` (70/20/10). VUS = personas simultáneas. Cada corrida deja un JSON en
`tests/carga/resultado-*.json` con p50/p95/máx, errores, requests limitados y la marca de la corrida.

## 4. Qué mirar

| Dato | Dónde | Qué significa |
|---|---|---|
| `p95_ms` | resumen k6 | 95 % de las respuestas tardan menos que esto. Con Apps Script, < 3.000 ms es normal; > 6.000 ms = saturado. |
| `errores_backend` | resumen k6 | respuestas `ok:false` que no son límite de uso. Si crecen con los VUS, se tocó la cuota de ejecuciones simultáneas (30). |
| `limitados_429` | resumen k6 | pedidos frenados por el límite anti-abuso (`aplicarLimites`). Esperable en `eventos` con > 1.500/min. |
| Duplicados | copia del Sheet → Cotizaciones | filtrá `notas = k6|<corrida>`: tiene que haber **una** fila por cid (los pedidos se repiten de a 5 con el mismo cid). Si hay más, falló la idempotencia. |
| Pestaña `Logs` | copia del Sheet | errores reales y avisos de "lock ocupado". |
| Ejecuciones | Apps Script → *Ejecuciones* | tiempo de cada request y errores "Too many simultaneous invocations". |

Anotá los resultados en `docs/ESCALABILIDAD.md` (sección "Límites medidos").
