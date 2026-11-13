# SanOu → Supabase · Guía de migración

Base de datos nueva: **Supabase en Brasil, región South America (São Paulo), código `sa-east-1`**.
La planilla de Google sigue funcionando todo el tiempo; nada se apaga hasta que esté probado.

---

## Qué está preparado

| Archivo | Para qué |
|---|---|
| `migrations/20261113000000_esquema_inicial.sql` | Crea las 9 tablas (clientes, cotizaciones, pedidos, leads, seguimientos, precios, mayorista, eventos, logs) con seguridad activada. Probado en un Postgres de prueba. |
| `apps-script-supabase.gs` | Archivo nuevo para el Apps Script del CRM: conecta con Supabase, copia todo (una sola vez, protegido) y verifica que esté igual. No cambia nada de lo que hace hoy el CRM. |

Seguridad: todas las tablas con RLS y **sin acceso público**. Solo el Apps Script entra, con la clave
secreta guardada en sus Propiedades. El esquema se llama `sanou` (no `public`).

---

## Paso 1 · Crear el proyecto EN BRASIL (lo hacés vos)

1. Entrá a **supabase.com** → **Dashboard** → **New project**.
2. **Organization:** la tuya. **Name:** `sanou`.
3. **Database password:** generá una y guardala en tu gestor de contraseñas. **No me la pases.**
4. **Region:** abrí la lista y elegí **South America (São Paulo)**.
   - Si la lista muestra solo zonas generales (por ejemplo "Americas"), buscá la opción para elegir una
     **región específica** y ahí elegí **São Paulo / sa-east-1**. No dejes la que viene por defecto:
     suele proponer Estados Unidos.
5. Plan: ver la nota de costos al final. Tocá **Create new project** y esperá 1-2 minutos.
6. **Comprobá la región:** Project Settings → General → tiene que decir **South America (São Paulo)**.
   ⚠️ La región **no se puede cambiar después**. Si quedó en otra, borrá ese proyecto y crealo de nuevo
   **antes** de cargar datos.

## Paso 2 · Crear las tablas

1. En el proyecto: **SQL Editor** → **New query**.
2. Pegá todo el contenido de `migrations/20261113000000_esquema_inicial.sql` → **Run**.
3. Tiene que decir "Success". En **Table Editor** → esquema `sanou` vas a ver las 9 tablas.

## Paso 3 · Habilitar el esquema para el Apps Script

**Project Settings → Data API** (o Integrations → Data API → Settings) → **Exposed schemas** →
agregá **`sanou`** → Save.
(Es seguro: los roles públicos no tienen ningún permiso sobre esas tablas.)

## Paso 4 · Clave secreta para el Apps Script

1. **Project Settings → API Keys → Secret keys → Create new secret key**, nombre `apps-script-sanou`.
2. Copiala (empieza con `sb_secret_…`). **No la pegues en el chat ni en ningún archivo.**
3. Copiá también la **Project URL** (`https://xxxx.supabase.co`), en Project Settings → Data API.

## Paso 5 · Cargarla en el Apps Script

En el proyecto de Apps Script del CRM → ⚙️ **Configuración del proyecto** → **Propiedades del script** → Agregar:

| Propiedad | Valor |
|---|---|
| `SUPABASE_URL` | la Project URL |
| `SUPABASE_SECRET` | la clave `sb_secret_…` |

## Paso 6 · Copiar los datos (lo hacemos juntos)

1. En el editor del Apps Script: **+ → Script**, nombre `supabase`, pegá el contenido de `apps-script-supabase.gs` y guardá.
   (Es un archivo **nuevo**; el código del CRM no se toca.)
2. Elegí la función **`sbxEstado`** → Ejecutar → tiene que mostrar las 9 tablas en 0.
3. Elegí **`sbxMigrarTodo`** → Ejecutar. Copia clientes, cotizaciones, pedidos, leads, seguimientos,
   eventos, precios y lista mayorista. Si Supabase ya tuviera datos, se frena solo y no pisa nada.
4. Elegí **`sbxVerificar`** → Ejecutar → tiene que decir `"ok": true` (mismas filas y misma suma de montos que la planilla).
5. Avisame el resultado y sigo con la fase 2.

---

## Las fases que siguen (las hago yo, con tu OK en cada una)

| Fase | Qué pasa | Cómo se vuelve atrás |
|---|---|---|
| **1. Copia** (esta guía) | Supabase tiene una copia; el CRM sigue usando la planilla. | Nada que volver. |
| **2. Doble escritura** | Cada alta/edición del CRM y cada compra web se guarda en la planilla **y** en Supabase. Se compara todos los días que coincidan. | Borrar una propiedad del script. |
| **3. Supabase manda** | El CRM lee de Supabase (más rápido); la planilla queda como respaldo y exportación. | Borrar la propiedad `FUENTE_DATOS`. |
| **4. Web más rápida** | La tienda lee precios y stock directo de Supabase (solo esos datos, solo lectura), con la planilla como plan B. | Volver a la versión anterior de la web. |

Antes de cada fase: pruebas automáticas (`test-gs`, `test-front`), prueba en una copia y verificación en vivo.
Pedidos reales, Mercado Pago y avisos no se tocan en las pruebas.

---

## Notas

- **Velocidad:** la base queda en São Paulo, cerca de Argentina (~30-40 ms). El Apps Script corre en servidores
  de Google en EE. UU., así que mientras siga siendo la "puerta" del CRM cada consulta suma ~0,15 s; igual es
  mucho más rápido que leer la planilla (~1,5 s). En la fase 4 la web consulta directo a Brasil.
- **Costos:** el plan gratis alcanza para este volumen (≈60 pedidos, ≈60 clientes, ≈1.000 eventos), pero
  **pausa el proyecto tras una semana sin uso** y **no tiene copias de seguridad automáticas**; además permite
  pocos proyectos gratis por cuenta (Virtual Shop y NutriSigo ya usan Supabase). Para usarlo en serio conviene
  el plan Pro (≈ USD 25/mes por organización). La decisión es tuya; no contrato nada.
- **Datos personales (Ley 25.326):** se copian los mismos datos que ya están en la planilla, sin agregar nada.
