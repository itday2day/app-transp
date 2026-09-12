# app-transp — Control de Jornadas y Flotas

Sistema de control de jornadas para choferes, compuesto por **tres proyectos independientes**
que comparten el mismo backend (Supabase):

| Proyecto             | Carpeta           | Stack                                           | Quién lo usa                        |
| -------------------- | ----------------- | ----------------------------------------------- | ----------------------------------- |
| App móvil            | raíz de este repo | Expo (~57) + React Native + TypeScript          | Choferes (check-in/check-out)       |
| Dashboard web        | `dashboard/`      | Next.js 16 (App Router) + TypeScript + Tailwind | Administrador de flota              |
| Servidor de reportes | `server/mock/`    | Node + Express                                  | Genera y envía el Excel de jornadas |

Documentación técnica exhaustiva (decisiones de arquitectura, desviaciones respecto a
especificaciones anteriores, deuda técnica conocida): **[`contexto_proyecto.md`](contexto_proyecto.md)**.
Este README es una guía de arranque rápido; para el detalle, ese es el documento de referencia.

## 1. Arquitectura

```
┌─────────────────┐        ┌──────────────────────┐
│   App móvil      │        │   Dashboard web        │
│   (Expo)          │        │   (Next.js)             │
│                    │        │                          │
│  SQLite local ──┐  │        │  Route Handlers ──┐     │
│  (offline-first)│  │        │  (service_role key)│     │
└──────────────────┼──┘        └─────────────────────┼──┘
                    │                                  │
                    ▼                                  ▼
            ┌───────────────────────────────────────────┐
            │              Supabase                       │
            │  PostgreSQL + PostGIS + Auth + Storage       │
            │  (choferes, jornadas, ubicaciones_tracking)  │
            └───────────────────────────────────────────┘
                                                          │
                                    ┌─────────────────────┘
                                    ▼
                          ┌──────────────────────┐
                          │  server/mock (Express) │
                          │  POST /reports/         │
                          │  export-excel            │
                          │  → ExcelJS + Resend API  │
                          └──────────────────────┘
```

- La app móvil escribe **directo a Supabase** (Auth + tablas + Storage) — no pasa por ningún
  backend intermedio.
- El Dashboard lee/escribe Supabase del lado del servidor con la `service_role key` (bypassa
  RLS: necesita ver la flota completa, no solo un chofer).
- `server/mock` es el único servicio que sigue corriendo del viejo backend Express — hoy solo
  para generar el reporte Excel y enviarlo por correo. Todo lo demás (auth, tracking, CRUD de
  jornadas) migró a Supabase.

## 2. Puesta en marcha (desarrollo local)

Necesitás Node 20+ y una cuenta de [Supabase](https://supabase.com) (o acceso al proyecto real
del equipo).

### 2.1. App móvil (raíz del repo)

```bash
npm install
cp .env.example .env    # completá EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run start           # abre Expo Dev Tools; "w" para web, o escaneá el QR con Expo Go
```

### 2.2. Dashboard web

```bash
cd dashboard
npm install
cp .env.example .env.local    # completá las variables (ver tabla abajo)
npm run dev                    # http://localhost:3000
```

### 2.3. Servidor de reportes (`server/mock`)

```bash
cd server/mock
npm install
npm start    # http://localhost:4000
```

Sin `RESEND_API_KEY` configurada, cae automáticamente a una cuenta de prueba Ethereal (sin
credenciales, genera un link de previsualización del correo) — alcanza para desarrollo local.

## 3. Variables de entorno

### Raíz (app móvil) — `.env`

| Variable                        | Descripción                                            |
| ------------------------------- | ------------------------------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`      | URL del proyecto Supabase                              |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clave anon/publicable (segura de exponer, respeta RLS) |

### `dashboard/.env.local`

| Variable                        | Descripción                                                           |
| ------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto Supabase                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon/publicable                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Clave service_role — **salta RLS**, solo se usa en Route Handlers     |
| `DASHBOARD_SESSION_SECRET`      | Secreto para firmar la cookie de sesión (HMAC-SHA256, ver `lib/auth.ts`) |
| `MOCK_SERVER_URL`               | URL de `server/mock` (`http://localhost:4000` en local)               |

### `server/mock` (variables de entorno del proceso, sin archivo `.env` propio en producción)

| Variable                                        | Descripción                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                          | Puerto del servidor (Render lo inyecta automáticamente)                                                                            |
| `RESEND_API_KEY`                                | API key de [Resend](https://resend.com) para enviar el reporte por correo                                                          |
| `RESEND_FROM_EMAIL`                             | Remitente verificado en Resend (opcional; sin dominio verificado, Resend solo entrega al correo de la cuenta)                      |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` | SMTP real, alternativa a Resend — **solo funciona en desarrollo local**: Render bloquea los puertos SMTP salientes en el plan free |

## 4. Despliegue

`render.yaml` define dos Web Services en [Render](https://render.com), desplegados desde
`github.com/itday2day/app-transp` (rama `master`) con auto-deploy en cada push:

- **`app-transp-dashboard`** — `rootDir: dashboard`
- **`app-transp-mock-server`** — `rootDir: server/mock`

Todas las variables sensibles están marcadas `sync: false` en `render.yaml`: se cargan a mano en
cada servicio, Environment, en el dashboard de Render — no viajan en el blueprint ni en el repo.

⚠️ Ambos servicios están en plan `free`: se duermen tras ~15 min sin tráfico (la primera petición
tras eso puede tardar o devolver 502 mientras despierta) y Render bloquea los puertos SMTP
salientes (por eso `server/mock` usa la API HTTPS de Resend en producción, no SMTP directo).

## 5. Base de datos

El esquema vive en `supabase/` y se corre en orden en el SQL Editor de un proyecto Supabase
nuevo — cada archivo `schema_vN_*.sql` es una migración incremental idempotente (segura de
reintentar):

```
supabase/schema.sql                          # esquema base: tablas, RLS, Storage, Realtime
supabase/schema_v2_tracking_auth.sql          # RPC de tracking GPS, políticas extra
supabase/schema_v3_combustible_porcentaje.sql # combustible: enum de texto -> porcentaje 0-100
supabase/schema_v4_fotos_incidencia.sql       # fotos de respaldo de una incidencia
supabase/schema_v5_edicion_jornadas.sql       # auditoría de edición manual desde el Dashboard
```

## 6. Verificación antes de un cambio

Cada sub-proyecto tiene su propio `tsconfig`/lint/formato, independientes entre sí:

```bash
# raíz (app móvil)
npx tsc --noEmit && npm run lint && npm run format:check

# dashboard/
cd dashboard && npx tsc --noEmit && npm run lint && npm run format:check

# server/mock/
cd server/mock && npm run lint && npm run format:check
```

## 7. Qué NO es este repo

`server/src/` (`db/schema.sql`, `routes/auth.example.ts`) es una **especificación de referencia**
de un backend Node/Express + PostgreSQL "desde cero" que se evaluó al inicio del proyecto y nunca
se terminó de construir — quedó obsoleta frente al esquema real de `supabase/schema.sql` (usa
nombres de campo distintos) y **no se mantiene sincronizada**. No es el backend real del sistema;
no usarla como fuente de verdad.

## 8. Más documentación

- **[`contexto_proyecto.md`](contexto_proyecto.md)** — referencia técnica exhaustiva: decisiones
  de arquitectura, por qué cada cosa se hizo como se hizo, deuda técnica conocida.
- **[`dashboard/README.md`](dashboard/README.md)** — guía específica del Dashboard.
