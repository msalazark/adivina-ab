# Adivina el A/B

Juego web para adivinar qué versión ganó en tests A/B reales, al estilo de GuessTheTest. Cada test muestra las capturas reales de cada versión; el visitante vota y recién entonces ve la ganadora, el lift, la confianza, el lift por segmento, lo que votaron los demás y los aprendizajes.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Supabase (Postgres, Storage, Auth) · TypeScript.

## Qué incluye

| Ruta | Para qué |
| --- | --- |
| `/` | Portada con los últimos tests |
| `/jugar` | Lleva al primer test que el visitante no ha jugado |
| `/tests/[slug]` | El test: capturas, voto y resultado. La ganadora no viaja al navegador hasta que el visitante vota |
| `/archivo` | Todos los tests (paginado), con filtros por categoría y estado —incluido «Solo catálogo»— y búsqueda |
| `/login` | Acceso al panel (correo y contraseña de Supabase Auth) |
| `/admin` | Lista, alta, edición y borrado de tests, con subida de capturas (arrastrar, elegir o pegar) |

Los votos son anónimos: el `proxy.ts` asigna a cada visitante un id en una cookie `httpOnly`, y el voto se guarda desde el servidor con la clave secreta.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta `supabase/migrations/0001_init.sql`. Crea las tablas, las políticas RLS, el bucket público `test-images` y las funciones `is_admin()` y `test_poll()`. Después ejecuta `supabase/migrations/0002_import_archivo.sql` (ganadora opcional y campos para el archivo importado).
3. (Opcional) Ejecuta `supabase/seed.sql` para cargar el test de ejemplo de Lomax. Sus capturas se suben luego desde el panel.
4. En **Authentication → Users → Add user**, crea tu usuario con contraseña y marca *Auto Confirm User*.
5. Hazlo administrador en el SQL Editor:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tu@correo.com';
   ```

6. En **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up*: solo entran los usuarios que crees tú.

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Copia de **Project Settings → API Keys** la URL, la *publishable key* y la *secret key*. La secret key solo se usa en el servidor; nunca le pongas el prefijo `NEXT_PUBLIC_`.

### 3. Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:3000, entra en `/login` y carga tu primer test desde `/admin`.

## Despliegue

- **Vercel** (recomendado para Next.js 16): importa el repo y agrega las cuatro variables de `.env.example`.
- **Netlify** o **Cloud Run** también funcionan; Netlify detecta Next.js automáticamente.

Ajusta `NEXT_PUBLIC_SITE_URL` a la URL final para que las vistas previas al compartir salgan bien.

## Modelo de datos

```
tests            pregunta, contexto, hipótesis, ganadora, métrica, lift, confianza,
                 resumen, segmentos (jsonb), aprendizajes, ideas, etiquetas, fuente, estado
 └ variants      A / B / C: nombre corto y qué cambia
    └ variant_images   capturas reales en Storage (ruta, ancho, alto, tipo: Desktop/Mobile/Detalle)
votes            un voto por visitante anónimo y test
admins           usuarios que pueden editar
api_tokens       hash de los tokens para la carga por API (siguiente etapa)
```

Lectura pública solo de tests publicados; los borradores los ven únicamente los admins. Toda escritura de tests y capturas pasa por RLS con `is_admin()`.

## Importar el archivo (`archivo/`)

La carpeta `archivo/` (no se versiona: son datos de terceros) trae dos fuentes con carencias opuestas. Para importar, déjala en la raíz del proyecto con los CSV/JSON, más `imagenes-casos.json` y `titulos-es.json` que generan/escriben los scripts:

| Fuente | Casos | Capturas A/B | Resultado |
| --- | --- | --- | --- |
| Casos con resultado (JSON/CSV) | 620 (616 tras quitar 4 duplicados) | No | Sí (lift, métrica, aprendizajes) |
| Catálogo GoodUI (CSV) | 644 | Sí (2 por test) | No: GoodUI lo deja tras membresía |

Por eso el modelo admite tests **sin ganadora** (`winner` nulo): se muestran con sus capturas y su ficha, pero no se juegan. Las demás cifras de GoodUI (muestra, poder estadístico, patrón, autoría, fecha) quedan en columnas propias, y el registro original completo en `tests.raw` (jsonb).

```bash
npm run import:archivo -- --dry-run     # valida y cuenta, sin escribir nada
npm run import:archivo                  # importa como borradores y sube las capturas
```

- Necesita `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `.env.local`, y haber corrido la migración 0002.
- Es idempotente: cada test se identifica por `source_id` (`AB-0001`, `GU-672`). Al volver a correr solo se descargan las capturas que falten.
- Las capturas se copian al bucket `test-images` (≈1.300 imágenes, unos 300 MB). `--no-images` crea los tests sin ellas.
- Todo entra como `borrador`. Antes de publicar revisa los avisos en `tests.review_flags`:

  | Aviso | Qué significa |
  | --- | --- |
  | `winner_inferred` | La ganadora se dedujo de `outcome` (win → B, loss → A). Confírmala |
  | `control_may_have_won` | El texto sugiere que ganó el control aunque `outcome` diga «win» |
  | `title_may_leak_result` | El título menciona el resultado; reescríbelo como pregunta |
  | `variant_description_missing` | No se pudo describir la variación sin revelar el resultado |
  | `outcome_mixed / flat / unknown` | Sin ganadora clara: quedan como catálogo |

  ```sql
  select source_id, title from public.tests
  where 'title_may_leak_result' = any(review_flags) order by source_id;
  ```

- **Capturas de los casos con resultado.** Esos casos no traen imágenes, pero sus páginas de origen sí muestran control y variación. `node scripts/harvest-images.mjs` las localiza (por texto alternativo, nombre de archivo o frase previa) y escribe `archivo/imagenes-casos.json`; el importador lo usa si existe. Descarta las parejas con una imagen menor de 400 px, las páginas que reúnen varios casos y las que no se pueden emparejar. Avisos nuevos: `images_from_source_page`, `images_multiple_tests` (la página muestra más de un test; confirma que el par corresponde), `images_composite_only` (solo hay una imagen con ambas versiones), `images_shared_page`, `images_discarded`.
- Para publicar en bloque lo que ya revisaste: `update public.tests set status = 'publicado' where source_id like 'GU-%';`

Los textos de origen están en inglés; el título, el contexto y los aprendizajes se importan tal cual y conviene traducirlos al revisar.

## Capturas

- Se suben al bucket `test-images` (máx. 5 MB, PNG/JPG/WebP/GIF) y se sirven con `next/image`.
- Las capturas de más de 2400 px de ancho o más de 4,5 MB se convierten a WebP de 2000 px antes de subirse.
- Cada versión admite varias capturas (por ejemplo Desktop y Mobile); la primera es la principal. En la página del test se pueden ampliar y comparar lado a lado.

## Contenido de terceros

Los casos vienen de sitios como GuessTheTest, VWO, Optimizely, GoodUI o Growth.Design. Las capturas de GoodUI son material de su membresía: copiarlas a un sitio público puede incumplir sus términos; confirma con ellos o publica solo el catálogo con enlace a la fuente. Escribe el contexto y los aprendizajes con tus palabras y enlaza siempre la fuente. Si el sitio va a ser público, revisa los términos de cada fuente antes de publicar sus capturas.

## Siguiente etapa: carga por API con token

La tabla `api_tokens` ya existe (guarda solo el hash SHA-256). El plan:

1. Generar y revocar tokens desde `/admin/tokens`.
2. `POST /api/v1/tests` con `Authorization: Bearer <token>`: recibe el test en JSON y las capturas (URL o base64), las sube a Storage y crea el test como borrador.
3. Revisar y publicar desde el panel.
