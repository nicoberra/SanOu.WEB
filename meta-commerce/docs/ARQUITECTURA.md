# Arquitectura — Meta Commerce AI

Departamento de Facebook de la agencia de IA. Primer cliente: San Ou.

## Auditoría del punto de partida

- **sanou.com.ar** es un sitio estático publicado en GitHub Pages. Su backend es Google Apps Script con Google Sheets.
- No tiene API REST, ni base SQL, ni Supabase.
- El catálogo tiene dos fuentes autorizadas, que son las mismas que usa el propio sitio:
  1. `catalogo-productos.js`: la "fuente única" con las fichas (nombre, categoría, descripción, especificaciones, fotos). Hoy son 47 productos.
  2. La acción pública `catalogo` del Apps Script. Devuelve **solo columnas públicas**, sin costos: `Nombre, Precios, Stock, Precio anterior, DESTACADO`.
- **Stock actual**: la planilla solo dice "hay / no hay". No informa unidades. El inventario del sistema admite los dos modos (ver más abajo). Si la planilla suma una columna "Stock unidades", el sincronizador la toma sola.
- **No se hace scraping de HTML.** El conector es **solo lectura** y no modifica nada del sitio, de la planilla ni de Mercado Libre.

## Componentes

```
                ┌──────────────── Orquestador de la agencia (futuro) ────────────────┐
                │  POST /api/v1/agency/tasks  (HMAC)      ← callback firmado         │
                └───────────────────────────────┬─────────────────────────────────────┘
                                                │ contrato agent-task/v1
┌──────────────┐   ┌────────────────────────────▼─────────────────────────────┐   ┌──────────────┐
│ Panel web    │──▶│ Servidor HTTP (src/server)                                │   │ Meta (oficial)│
│ (web/, SPA)  │   │  auth · API REST · feed de catálogo · webhooks de Meta    │◀──│ webhooks      │
└──────────────┘   └───────┬──────────────────────────────┬───────────────────┘   └──────▲───────┘
                           │ servicios                     │ cola de tareas              │ Graph API
                   ┌───────▼────────┐             ┌────────▼─────────┐                   │ (escrituras
                   │ Dominio        │             │ Worker           │───────────────────┘  bloqueadas
                   │ inventario,    │             │ scheduler, retry │                     por defecto)
                   │ publicaciones, │             │ agentes          │
                   │ aprobaciones   │             └────────┬─────────┘
                   └───────┬────────┘                      │
                   ┌───────▼───────────────────────────────▼──────┐     ┌────────────────────────┐
                   │ Store: Supabase (Postgres + RLS) | archivo   │     │ sanou.com.ar (lectura) │
                   └──────────────────────────────────────────────┘     └────────────────────────┘
```

| Carpeta | Qué hay |
|---|---|
| `db/migrations` | Esquema Postgres/Supabase: multiempresa, RLS, inventario atómico, auditoría inmutable |
| `src/core` | Reglas puras: estados de publicación, cálculo de inventario, contrato de tareas |
| `src/store` | `FileStore` (local/demo) y `SupabaseStore` (producción) con la misma interfaz. `scoped()` fuerza el aislamiento por empresa |
| `src/connectors/sanou` | Lectura del catálogo, importación incremental e idempotente |
| `src/connectors/meta` | Matriz de capacidades reales, cliente Graph API (escrituras bloqueadas por defecto), feed y Batch API |
| `src/services` | Inventario con la cascada de agotados, publicaciones, aprobaciones, tareas, auditoría, vistas |
| `src/agents` | Definiciones de los 4 agentes, planificador del Director y ejecutores |
| `src/ai` | Capa de IA independiente del proveedor, tope de gasto y validador "no inventar" |
| `src/worker` | Cola de tareas con reintentos y sincronización periódica |
| `web/` | Panel de control |

## Decisiones clave

1. **Supabase (Postgres) para producción.** El sitio no tiene una base reutilizable, y el pedido menciona Supabase para la agencia. Las migraciones están en `db/migrations`. Para la demo y el desarrollo local se usa un archivo JSON con la misma interfaz, así no hacen falta credenciales.
2. **Un inventario por variante.** Las publicaciones **no tienen stock propio**: la vista `listing_overview` y `listingOverview()` leen precio y stock del maestro. Todo cambio pasa por `apply_inventory_movement()`, que es atómico, idempotente por clave y guarda el estado antes y después.
   - Modo `flag`: el sitio solo dice "hay / no hay".
   - Modo `units`: unidades en depósito, reservadas, vendidas y disponibles.
   - **El sitio manda**: si dice "sin stock", el producto queda agotado aunque haya unidades cargadas.
3. **Cascada de agotado** (`src/services/inventory.js`). Cuando un producto se agota:
   - Se marca agotado.
   - Los borradores quedan bloqueados.
   - Las publicaciones visibles pasan a *pendiente de desactivación*.
   - En canales con API se encola la baja. En Marketplace personal se crea una tarea manual.
   - Se emite una alerta.

   Las publicaciones pasan a "desactivado" **solo** con confirmación. Cuando vuelve el stock, se pide una revisión y **no se reactiva nada automáticamente**.
4. **Máquina de estados** de publicaciones: `borrador → pendiente_aprobacion → listo_para_publicar → publicado → pendiente_actualizacion / pendiente_desactivacion → desactivado`, y `error`. "Publicado" y "desactivado" exigen confirmación. Un producto agotado no puede pasar a "listo para publicar" ni a "publicado".
5. **Aprobaciones sobre contenido exacto.** Se aprueba el hash del payload: si el agente lo cambia después, la aprobación ya no vale. Cada aprobación se usa una sola vez y vence a los 7 días.
6. **Seguridad Meta.** `META_WRITE_ENABLED=false` por defecto: ninguna escritura sale hacia Meta. Los tokens viajan en la cabecera y se usa `appsecret_proof`. Los webhooks se verifican con HMAC.
7. **Multiempresa desde el diseño.** Todas las tablas comerciales llevan `organization_id`.
   - En Supabase, la RLS limita lo que ve cada usuario.
   - En la aplicación, `scoped()` filtra todas las consultas por organización. Esto también protege al worker, que usa `service_role`.
   - Cada empresa tiene su propio catálogo, credenciales, canales, agentes y límites.
8. **IA intercambiable.**
   - Proveedores: `offline` (plantillas, sin costo), `anthropic` (Claude, SDK oficial) y lugares previstos para OpenAI y Gemini.
   - Cada agente tiene presupuesto diario.
   - Todo texto comercial se valida contra la ficha real con `validateGrounded`: cifras y promesas no verificadas se marcan.
9. **Funciona sin Claude Code.** El servidor y el worker son procesos normales de Node 20+, sin dependencias de ejecución. Pueden correr en Railway, Render, Fly.io o un VPS. Como alternativa, el worker puede correr con un cron externo usando `npm run sync`.

## Contrato con la agencia

Ver [CONTRATO-AGENCIA.md](CONTRATO-AGENCIA.md) y `contracts/agent-task.v1.schema.json`.
