# Configuración para producción

El orden recomendado es de menor a mayor riesgo. Ninguno de estos pasos ejecuta acciones comerciales por sí mismo.

## 1. Precios y stock reales (indispensable)

El sincronizador lee la acción pública `catalogo` del Apps Script. Es la misma que usa la tienda y devuelve solo columnas públicas.

- Verificá que el servidor donde corra el sistema tenga salida a `script.google.com`.
- **Recomendado**: agregá una columna **"Stock unidades"** en la pestaña Clientes y hacé que la acción `catalogo` la incluya. El sistema la detecta sola por el encabezado y pasa a controlar unidades: reservadas, vendidas y disponibles. Hoy la planilla solo dice "hay / no hay".
- El backend `.gs` no está versionado. Para sumar la columna hay que tocar `doGet → catalogo`, y conviene probarlo antes con `node tests/test-gs.js`.

## 2. Base de datos (Supabase)

1. Creá un proyecto en Supabase. Lo ideal es uno propio de la agencia, separado de cualquier otro negocio.
2. Ejecutá, en este orden, `db/migrations/0001_fundacion.sql`, `0002_rls.sql` y `db/seed_sanou.sql`.
3. En el servidor definí `STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET`.
4. Creá los usuarios del panel en Supabase Auth y cargalos en `organization_users` con su rol: owner, admin, operator o viewer.

> La `service_role` key va **solo** en el servidor y en el worker. Nunca en el frontend ni en el repositorio.

## 3. Despliegue (sin depender de Claude Code)

- **Servidor**: `npm start`, con `WORKER_IN_PROCESS=false` si el worker corre aparte.
- **Worker**: `npm run worker`. Procesa la cola, hace los reintentos y programa la sincronización.
- **Dónde correrlo**: sirven Railway, Render, Fly.io o un VPS. Es Node 20+ sin dependencias de ejecución.
- **Ubicación del código**: este repo es **público** y GitHub Pages publica todo su contenido. El código de `meta-commerce/` no tiene secretos y `robots.txt` lo excluye de buscadores. Aun así, conviene moverlo a un **repositorio privado de la agencia** antes de sumar más clientes.

## 4. Catálogo de Meta (primera integración oficial, bajo riesgo)

1. En Business Manager, creá un **Catálogo** (Commerce Manager → Catálogos → Comercio electrónico).
2. Agregá un origen de datos de tipo **feed programado** con la URL que muestra el panel en *Configuración → Feed para el Catálogo de Meta*. Programalo cada 1 hora o una vez por día.
3. Revisá el diagnóstico del catálogo en Commerce Manager. Los productos sin precio, sin fotos o con stock desconocido no se envían.

Para que un agotado se baje **al instante**, sin esperar al feed, se usa la Batch API:

4. Creá un **System User** con rol de administrador del catálogo y generá un token con `catalog_management` y `business_management`.
5. Definí `META_SYSTEM_USER_TOKEN`, `META_CATALOG_ID`, `META_APP_ID` y `META_APP_SECRET`.
6. Activá `META_WRITE_ENABLED=true` **solo cuando lo autorices**.

## 5. Messenger de la Página (Etapa 3)

- Necesitás una app de Meta (tipo Business) con el producto Messenger, y la Página San Ou vinculada.
- Permisos: `pages_messaging`, `pages_manage_metadata` y `pages_show_list`. Si la app solo atiende la Página propia, no hace falta App Review.
- Configurá el webhook con la URL `https://<tu-servidor>/webhooks/meta` y un token que definas en `META_WEBHOOK_VERIFY_TOKEN`.
- Definí `META_PAGE_ID` y `META_PAGE_ACCESS_TOKEN`.

## 6. Meta Ads (Etapa 4)

- Necesitás el ID de la cuenta publicitaria (`act_…`) en `META_AD_ACCOUNT_ID`, más los permisos `ads_management` y `ads_read`. Con *Limited Access* alcanza para la cuenta propia.
- Definí los topes de gasto de la empresa en `organizations.settings.limits`: `ads_daily_spend_cap` y `ads_total_spend_cap`. Mientras valgan 0, MetaAdsAgent no puede proponer activar nada.
- **Impuestos**: con tarjeta, Meta factura desde el exterior y se suman IVA y percepciones. Confirmalo con el contador.

## 7. IA (opcional)

Sin configuración, el sistema usa `AI_PROVIDER=offline`: plantillas deterministas con datos reales y sin costo. Para usar Claude:

```bash
cd meta-commerce && npm i @anthropic-ai/sdk
```

Después definí `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` y `AI_DAILY_BUDGET_USD`.

## 8. Integración con la agencia

Definí `AGENCY_SHARED_SECRET` (32 bytes aleatorios o más) y compartilo con el orquestador. Ver [CONTRATO-AGENCIA.md](CONTRATO-AGENCIA.md).
