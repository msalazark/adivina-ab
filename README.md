# Adivina el A/B

Juego web para adivinar qué versión ganó en tests A/B reales, al estilo de GuessTheTest. Cada test muestra las capturas reales de cada versión; el visitante vota y recién entonces ve la ganadora, el lift, la confianza, el lift por segmento, lo que votaron los demás y los aprendizajes.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Supabase (Postgres, Storage, Auth) · TypeScript.

## Qué incluye

| Ruta | Para qué |
| --- | --- |
| `/` | Portada con los últimos tests |
| `/jugar` | Lleva al primer test que el visitante no ha jugado |
| `/tests/[slug]` | El test: capturas, voto y resultado. La ganadora no viaja al navegador hasta que el visitante vota |
| `/archivo` | Todos los tests, con filtros por categoría y estado y búsqueda |
| `/login` | Acceso al panel (correo y contraseña de Supabase Auth) |
| `/admin` | Lista, alta, edición y borrado de tests, con subida de capturas (arrastrar, elegir o pegar) |

Los votos son anónimos: el `proxy.ts` asigna a cada visitante un id en una cookie `httpOnly`, y el voto se guarda desde el servidor con la clave secreta.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta `supabase/migrations/0001_init.sql`. Crea las tablas, las políticas RLS, el bucket público `test-images` y las funciones `is_admin()` y `test_poll()`.
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

## Capturas

- Se suben al bucket `test-images` (máx. 5 MB, PNG/JPG/WebP/GIF) y se sirven con `next/image`.
- Las capturas de más de 2400 px de ancho o más de 4,5 MB se convierten a WebP de 2000 px antes de subirse.
- Cada versión admite varias capturas (por ejemplo Desktop y Mobile); la primera es la principal. En la página del test se pueden ampliar y comparar lado a lado.

## Contenido de terceros

Los casos vienen de sitios como GuessTheTest, VWO, Optimizely, GoodUI o Growth.Design. Escribe el contexto y los aprendizajes con tus palabras y enlaza siempre la fuente. Si el sitio va a ser público, revisa los términos de cada fuente antes de publicar sus capturas.

## Siguiente etapa: carga por API con token

La tabla `api_tokens` ya existe (guarda solo el hash SHA-256). El plan:

1. Generar y revocar tokens desde `/admin/tokens`.
2. `POST /api/v1/tests` con `Authorization: Bearer <token>`: recibe el test en JSON y las capturas (URL o base64), las sube a Storage y crea el test como borrador.
3. Revisar y publicar desde el panel.
