# APIs oficiales de Meta: qué se puede automatizar (octubre de 2026)

Este documento resume la investigación hecha antes de integrar Facebook. Las URLs son de la documentación oficial de Meta cuando existían. Lo que no se pudo confirmar en una fuente oficial está marcado **[NV]** (no verificado). Hay que revalidarlo antes de cada etapa, porque Meta cambia sus APIs con frecuencia.

> Desde el entorno de desarrollo no se pudo abrir developers.facebook.com directamente. Las afirmaciones salen de resultados de búsqueda que citan esas páginas. Antes de activar cada integración, hay que leer la página oficial enlazada.

## Resumen

| Capacidad | ¿Hay API oficial? | Permisos | ¿Requiere App Review? | ¿Disponible en Argentina? | Decisión en el sistema |
|---|---|---|---|---|---|
| Publicar, editar o bajar publicaciones **personales** de Marketplace | **No**. Solo existe para socios aprobados de [Marketplace Partnerships](https://developers.facebook.com/docs/marketplace/partnerships/) | — | — | No | **Cola asistida**: el sistema prepara, una persona publica y confirma |
| Leer o responder mensajes de Marketplace personal | **No** | — | — | No | **Respuestas sugeridas** para copiar y pegar |
| Mensajes de Marketplace dirigidos a una **Página** | Posiblemente por el webhook de Messenger [NV] | pages_messaging | No (Página propia) | [NV] | Probarlo con un caso real en la Etapa 3 |
| Facebook/Instagram Shops con checkout | No se puede: Shops quedó fuera de Argentina desde ago-2023 y el checkout nativo se retiró en 2025 | — | — | No | No se usa |
| **Catálogo** de Commerce Manager (feed o `items_batch`) | **Sí** | catalog_management, business_management (token de System User) | No, si es para uso propio | Sí | **Automatizado**: feed programado + Batch API |
| **Messenger** de la Página (Send API y webhooks) | **Sí** | pages_messaging, pages_manage_metadata, pages_show_list | No para la Página propia; sí para Páginas de terceros | Sí | Etapa 3: respuestas automáticas dentro de la ventana de 24 h |
| Instagram Direct | **Sí** | instagram_business_manage_messages | No (cuenta propia) | Sí | Futuro |
| **Marketing API**: campañas, ad sets, anuncios e Insights | **Sí** (v26.0) | ads_management, ads_read | No para la cuenta propia (*Limited Access*) | Sí | Etapa 4: todo se crea en PAUSED y se activa con aprobación y tope de gasto |
| Anuncios de catálogo (Advantage+), con Marketplace como **ubicación** | **Sí** | ads_management + catálogo | No (uso propio) | Sí | Etapa 4 |

## Detalles por canal

### Marketplace personal
- No hay API pública para crear, editar o desactivar publicaciones personales, ni para leer sus mensajes. Las librerías que usan el GraphQL interno de Facebook no son oficiales y violan los Términos de Meta. **No se usan.**
- **Cómo lo resuelve el sistema** (`src/connectors/meta/capabilities.js`, canal `marketplace_personal`):
  1. MarketplaceAgent prepara el borrador con los datos reales.
  2. La publicación pasa por aprobación.
  3. Queda "Listo para publicar".
  4. Una persona la publica en Facebook y confirma en el panel, pegando la URL.
  5. Si el producto se agota, se crea una **tarea manual** de desactivación. El estado "desactivado" se registra solo cuando la persona lo confirma.
- **Política anti-duplicados**: hay una sola publicación viva por producto y cuenta (índice único en la base de datos). Los distintos enfoques comerciales se guardan como *variantes creativas*, para elegir entre ellas o usarlas en anuncios. No se publican como copias del mismo artículo.

### Catálogo de Meta
- **Feed programado**: Commerce Manager descarga cada cierto tiempo un CSV desde una URL. El sistema expone `/feeds/<empresa>/meta-catalog.csv?key=…` con estos campos: `id`, `title`, `description`, `availability`, `condition`, `price`, `link`, `image_link` y `brand`. El precio y la disponibilidad salen del inventario maestro. Los productos sin precio, sin fotos o con stock desconocido se **excluyen**: no se inventan datos.
- **Batch API**: `POST /{catalog_id}/items_batch` con `item_type=PRODUCT_ITEM`. Acepta hasta 5.000 ítems por llamada, aunque Meta recomienda no pasar de 3.000. Es asíncrona: devuelve un `handle` que se consulta en `/{catalog_id}/check_batch_request_status`. El sistema marca "desactivado" **solo** cuando el lote figura como terminado y sin errores. El endpoint viejo `/{catalog_id}/batch` no se debe usar en integraciones nuevas.
- **Límites de uso**: cada catálogo tiene una cuota propia. Si se supera, Meta devuelve el error 80014, y el sistema lo trata como reintentable con backoff.
- El catálogo sirve para **anuncios**, no como tienda: Shops no está disponible en Argentina.

### Messenger Platform (Etapa 3)
- Se envía con `POST /{PAGE_ID}/messages` y el token de la Página. Se reciben los webhooks `messages`, `messaging_postbacks` y `message_echoes`.
- **Ventana de 24 h** desde el último mensaje del cliente. La etiqueta `HUMAN_AGENT` la extiende a 7 días, pero **solo para respuestas escritas por una persona**. Las etiquetas `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` y `POST_PURCHASE_UPDATE` fueron dadas de baja.
- El webhook ya está preparado en `/webhooks/meta`: verifica `hub.verify_token` y la firma `X-Hub-Signature-256`. Por ahora solo registra los eventos, sin actuar.

### Marketing API (Etapa 4)
- La versión estable es **v26.0** (julio de 2026). La versión se configura con `META_GRAPH_VERSION`.
- Endpoints: `POST /act_{id}/campaigns`, `/adsets`, `/adcreatives`, `/ads` y `GET …/insights`. Todo se crea con `status=PAUSED`.
- Topes de gasto: `spend_cap` de la campaña, expresado en centavos. El `spend_cap` de la cuenta se puede cambiar como máximo 10 veces por día.
- `special_ad_categories=[]` (las herramientas no entran en categorías especiales).
- Marketplace como ubicación se configura con `targeting.facebook_positions` (el valor `marketplace` está [NV]). Esto es **pautar en Marketplace**, no promocionar una publicación personal.
- Argentina: Meta factura desde el exterior. Con tarjeta se suman el IVA 21 % y percepciones sobre el gasto. **Conviene confirmarlo con el contador.**

## Pendientes de verificar con cuentas reales
1. Si los mensajes de Marketplace dirigidos a la Página llegan por el webhook de Messenger.
2. El valor exacto del enum de ubicación Marketplace en la Marketing API v26.
3. La especificación vigente de los campos del feed (página oficial de especificación de catálogos).
