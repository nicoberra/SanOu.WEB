# Meta Commerce AI

Departamento de Facebook gestionado por agentes de IA: catálogo, inventario, Marketplace, Messenger y Meta Ads. Está preparado para trabajar con varias empresas a la vez. El primer cliente es **San Ou** (sanou.com.ar).

**Estado actual: Etapa 1 (fundación).** El sistema no ejecuta ninguna acción comercial externa: las escrituras a Meta están deshabilitadas por defecto.

## Probarlo en local (Node 20 o superior, sin instalar nada)

```bash
cd meta-commerce
cp .env.example .env          # completá ADMIN_TOKEN (o dejalo vacío y se genera uno al arrancar)
npm start                     # panel en http://localhost:8787 + worker integrado
npm test                      # 26 pruebas: inventario, publicaciones, agentes, API, multiempresa
npm run sync                  # sincronización única del catálogo (diagnóstico o cron externo)
```

Al arrancar, el worker sincroniza el catálogo y después repite cada `CATALOG_SYNC_EVERY_MIN` minutos:

- Las **fichas** se leen de sanou.com.ar/catalogo-productos.js. Con `SANOU_LOCAL_REPO=..` se leen del repositorio local.
- Los **precios y el stock** se leen de la acción pública `catalogo` del backend del sitio.

## Documentación

| Archivo | Contenido |
|---|---|
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Auditoría del sitio, componentes y decisiones |
| [docs/META-APIS.md](docs/META-APIS.md) | Qué permite Meta oficialmente y qué no (Marketplace, Catálogo, Messenger, Ads) |
| [docs/CONTRATO-AGENCIA.md](docs/CONTRATO-AGENCIA.md) | Cómo el orquestador de la agencia envía tareas y recibe resultados |
| [docs/CONFIGURACION.md](docs/CONFIGURACION.md) | Pasos para producción y lo que hace falta configurar |
| `db/migrations/` | Esquema de Supabase/Postgres con RLS |

## Reglas que el sistema hace cumplir

- No inventa características, precios ni stock. Lo que falta en la ficha queda vacío y se informa.
- Una sola publicación viva por producto y cuenta. Los distintos enfoques se guardan como variantes creativas, no como copias.
- Marketplace personal no tiene API oficial: se trabaja con una cola asistida y confirmación humana.
- "Publicado" y "desactivado" se registran solo cuando hay confirmación.
- Ningún gasto, publicación o baja se hace sin la aprobación configurada.
- Los datos de cada empresa están aislados entre sí, y las credenciales nunca llegan al navegador.
