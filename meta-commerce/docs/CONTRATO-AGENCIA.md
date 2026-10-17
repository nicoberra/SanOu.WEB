# Contrato con el orquestador de la agencia (`agent-task/v1`)

El departamento de Facebook recibe tareas del orquestador central y le devuelve los resultados por una API firmada. El esquema JSON está en `contracts/agent-task.v1.schema.json`.

## Autenticación

- **Firma**: `X-Agency-Signature = hex(HMAC-SHA256(AGENCY_SHARED_SECRET, "<timestamp>.<cuerpo>"))`.
- **Timestamp**: `X-Agency-Timestamp` va en segundos Unix. Se aceptan diferencias de hasta ±5 minutos, para evitar reenvíos.
- **Qué se firma**:
  - En un POST se firma el cuerpo crudo.
  - En un GET se firma el path con su query, por ejemplo `/api/v1/agency/tasks/<id>?organization=sanou`.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/v1/agency/tasks` | Crear una tarea. Si se repite la misma `idempotency_key`, devuelve la tarea existente con `duplicate: true` |
| GET | `/api/v1/agency/tasks/:id?organization=<slug>` | Ver estado, resultado y registro de ejecución |
| (callback) | `callback_url` de la tarea | POST firmado igual, con el *envelope*, cuando la tarea termina |

## Ejemplo: "Esta semana vamos a promocionar las dobladoras hidráulicas de San Ou"

```json
POST /api/v1/agency/tasks
{
  "organization": "sanou",
  "agent": "FacebookDirectorAgent",
  "type": "director.plan",
  "priority": 2,
  "idempotency_key": "marketing-semana-42-dobladoras",
  "correlation_id": "6f1c…",
  "callback_url": "https://agencia.example/callbacks/facebook",
  "requested_by": "MarketingDirectorAgent",
  "input": { "instruction": "Esta semana vamos a promocionar las dobladoras hidráulicas de San Ou" }
}
```

El Director hace lo siguiente:

1. Verifica qué dobladoras están activas, con precio publicado y con stock. Excluye las que no cumplen y explica el motivo.
2. Crea subtareas con el mismo `correlation_id`:
   - `MarketplaceAgent: marketplace.prepare_angles`
   - `MetaAdsAgent: ads.propose_campaign`
   - `FacebookSalesAgent: sales.prepare_knowledge`
3. Devuelve el plan consolidado.

Las subtareas de etapas que todavía no están implementadas terminan en `no_disponible` y explican en qué etapa llegan. **Nunca se simula un resultado.**

## Estados

| Estado | Significado |
|---|---|
| `pendiente` | En cola |
| `en_progreso` | Un worker la está procesando |
| `esperando_aprobacion` | Necesita una decisión humana |
| `completada` | Terminó bien |
| `fallida` | Agotó los reintentos |
| `cancelada` | Se canceló |
| `no_disponible` | La capacidad todavía no existe o la integración no está habilitada |

## Tipos disponibles en la Etapa 1

| Agente | Tipo | Qué hace |
|---|---|---|
| MarketplaceAgent | `catalog.sync` | Sincroniza el catálogo con sanou.com.ar |
| MarketplaceAgent | `inventory.review` | Resumen de stock |
| MarketplaceAgent | `channel.set_availability` | Baja o alta de disponibilidad en el catálogo de Meta por API oficial. Requiere habilitación |
| FacebookDirectorAgent | `director.plan` | Arma el plan a partir de una instrucción |
| FacebookDirectorAgent | `report.inventory` | Reporte de inventario |
