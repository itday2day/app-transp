# Contexto del proyecto — app-transp

_Última actualización: 2026-09-04._

Documento de referencia técnica para cualquier IA (o persona) que retome trabajo en este
repositorio. Refleja el **estado real del código**, no el plan original — donde la implementación
se apartó de una especificación anterior por una razón concreta, queda anotado con ⚠️.

## 1. Visión general y propósito

Sistema de control de jornadas y flotas compuesto por dos aplicaciones independientes que
comparten el mismo backend (Supabase):

- **App móvil** (raíz de este repo): Expo + React Native + TypeScript. La usan los choferes para
  hacer check-in/check-out de sus jornadas: fotos, kilometraje, combustible, GPS e incidencias.
- **Dashboard web administrativo** (`dashboard/`): Next.js (App Router) + TypeScript + Tailwind.
  Panel interno para ver la flota en un mapa en vivo, revisar jornadas con sus fotos y exportar
  reportes.

**Metodología de trabajo**: Spec-Driven Development (SDD) — Fase 1 (especificación técnica,
aprobación explícita del usuario antes de tocar código) → Fase 2 (implementación) → Fase 3
(verificación: `npx tsc --noEmit`, `npm run lint`, `npm run format:check`).

### Estructura de alto nivel

```
app_transp_project/
├── src/                      # App móvil (Expo) — ver sección 3
├── dashboard/                 # Dashboard web (Next.js) — proyecto independiente, ver sección 4
├── server/
│   ├── mock/                  # Único servidor que corre de verdad — ver sección 2
│   └── src/                   # Referencia NO ejecutable de un backend PostgreSQL "desde cero"
├── supabase/
│   ├── schema.sql              # Esquema base (tablas, RLS, Storage, Realtime)
│   ├── schema_v2_tracking_auth.sql  # Migración incremental (RPC tracking, políticas extra)
│   ├── schema_v3_combustible_porcentaje.sql  # combustible: enum de texto -> porcentaje 0-100
│   └── schema_v4_fotos_incidencia.sql  # columna fotos_incidencia text[]
├── eslint.config.js / .prettierrc.json   # Lint/formato de la app móvil
└── tsconfig.json               # Excluye "server" y "dashboard" (cada uno tiene el suyo)
```

## 2. Infraestructura y configuración cloud

**Base de datos**: PostgreSQL + PostGIS vía **Supabase real** (no un mock — proyecto
`tgmfopfekwlucofjlssn.supabase.co`). Esquema completo en `supabase/schema.sql` +
`supabase/schema_v2_tracking_auth.sql` (correr ambos, en ese orden, en el SQL Editor de un
proyecto nuevo; el segundo archivo es idempotente, se puede reintentar sin romper nada).

Tablas y objetos clave:

- `choferes` — `id` = `auth.users.id`, `numero_empleado`, `nombre`, `apellidos`, `dni`,
  `fecha_nacimiento`, `pais_nacimiento`, `sexo`.
- `jornadas` — mismos campos que el tipo `Jornada` del móvil, en `snake_case`.
- `ubicaciones_tracking` — `chofer_id`, `jornada_ids uuid[]`, `ubicacion geography(Point,4326)`,
  `velocidad_kmh`, `timestamp`.
- vista `ultimas_posiciones` — última posición por chofer, con `lat`/`lng` ya planos (no
  `geography`) — la consume el Dashboard.
- función RPC `insertar_ubicacion(...)` — construye el punto PostGIS server-side; la llama
  `trackingService.ts` del móvil vía `supabase.rpc(...)`.

RLS: cada chofer solo lee/escribe sus propias filas (`auth.uid() = chofer_id`). El Dashboard
necesita ver la flota completa, así que **no pasa por RLS**: sus Route Handlers usan el
`service_role` key del lado servidor (nunca expuesto al cliente).

**Auth**: Supabase Auth. El chofer se identifica por `numeroEmpleado`, pero Auth exige correo, así
que se usa un correo sintético determinístico:
`apptransp.chofer.{numeroEmpleado}.f83a1c@gmail.com` (`numeroEmpleadoAEmail()` en
`src/services/authService.ts`). Detalle importante: Supabase Auth valida que el dominio del correo
tenga MX real — dominios inventados (`*.internal`, un `.com` sin registrar) son rechazados con
`email_address_invalid`, por eso se usa `gmail.com` con un sufijo fijo de alta entropía en vez de
un dominio propio. "Confirm email" está desactivado en el proyecto (el chofer no puede leer ese
correo). El Dashboard **no** usa Supabase Auth — tiene su propio login de administrador (ver §4).

El proyecto Supabase está registrado bajo `it@day2day.es`, cuenta corporativa de la empresa
(day2day) — no es una cuenta personal del desarrollador.

**Tiempo real / tracking en vivo**: ⚠️ el mapa del Dashboard **no usa Supabase Realtime**
(`postgres_changes`). Fue una decisión deliberada: Realtime respeta RLS igual que las queries
normales, y el Dashboard no tiene sesión de ningún chofer — con el `anon key` no vería ninguna
fila, y usar el `service_role key` directo en el navegador expondría acceso total a la base de
datos a cualquiera que abra devtools. En su lugar,
`dashboard/app/api/tracking/ultimas-posiciones/route.ts` hace **polling server-side cada 8s** (vía
TanStack Query, `service_role` key) contra la vista `ultimas_posiciones`. Los pings GPS del móvil
llegan cada ~20s de todos modos, así que no se pierde percepción de "en vivo".

**Almacenamiento de fotos**: Supabase Storage, bucket `evidencias` (lectura pública; escritura
restringida a la propia carpeta del chofer, `evidencias/{choferId}/...`, vía política RLS de
`storage.objects`). El móvil sube con `fetch(uri) → blob() → supabase.storage.upload()`
(`src/services/storageService.ts`) — a propósito **no** usa `expo-file-system` (ver §3, política de
no sumar módulos nativos nuevos).

**Mapas**: 100% OpenStreetMap vía `react-leaflet` + `leaflet`, sin API key, para el visor en vivo del
Dashboard. ⚠️ **Corrección**: OSRM (cálculo de rutas) y Nominatim (geocodificación) **no están
implementados** — solo se construyó el visor de mapa en vivo con marcadores de posición. Si se
necesita trazar el trayecto recorrido o convertir coordenadas a direcciones, es trabajo pendiente.

**Enlaces a Google/Apple Maps para coordenadas puntuales** (check-in/check-out de una jornada,
distinto del visor en vivo de arriba): en vez de mostrar lat/lng como texto plano, se abre la
ubicación en la app de mapas nativa.

- **App móvil** (`DetalleJornadaScreen.tsx` → componente `FilaUbicacion` → `src/services/mapasService.ts`):
  `Platform.select` arma `maps:0,0?q=lat,lng` en iOS (Apple Maps) o `geo:0,0?q=lat,lng` en Android,
  con fallback a la URL web de Google Maps. Sin `Linking.canOpenURL()` previo (exigiría declarar
  `<queries>` en el manifiesto nativo de Android).
- **Reporte Excel** (`server/mock/reportes.js`): columnas "Ubicación Check-In"/"Ubicación Check-Out"
  con hipervínculo a `https://www.google.com/maps/search/?api=1&query=lat,lng` (Google Maps URLs
  API, formato documentado — no el legado `?q=`).
- ⚠️ **El Dashboard web NO tiene esto** — `jornada-detalle-dialog.tsx` no muestra lat/lng ni enlaces
  de mapa en ningún lado todavía. Solo la app móvil y el Excel lo tienen.

**Envío de reportes**: ⚠️ no se usa Resend. `server/mock/reportes.js` genera el `.xlsx` (ExcelJS)
y lo envía con `nodemailer` — usa SMTP real solo si existen las env vars
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`; si no, cae a una cuenta de prueba Ethereal (sin credenciales,
genera un link de previsualización). Las columnas de foto son solo hipervínculo a la imagen en el
bucket público de Supabase Storage — ya no se incrustan miniaturas (se quitó a propósito: evitaba
tener que descargar cada foto al generar el reporte). Incluye 3 columnas fijas "Foto Incidencia
1/2/3" (⚠️ tope de 3 — Excel no soporta varios hipervínculos en una sola celda; si una incidencia
tiene más fotos, las adicionales solo se ven, sin límite, en el detalle de jornada del Dashboard) y
2 columnas de ubicación con hipervínculo a Google Maps (ver arriba). El endpoint `POST /reports/export-excel` es
**el único que sigue vivo** del mock server tras la migración a Supabase — es _stateless_ (recibe
el arreglo completo de jornadas en el body). ⚠️ **La exportación de reportes ya no existe en la app
móvil** (se quitó `ModalExportarReporte.tsx`, `reportesService.ts` y `listarJornadasPorRango()`) —
es una función exclusiva del Dashboard web; `/reports/export-excel` ahora solo lo llama
`dashboard/app/api/reportes/exportar/route.ts`. El resto de rutas del mock (`/auth/*`, `/jornadas`,
`/tracking/*`) quedaron en el código pero **ya no las usa nadie** — es deuda técnica pendiente de
limpiar si se confirma que no hace falta conservarlas de referencia.

## 3. Módulo móvil (raíz del repo)

Stack: Expo (~57), React Native 0.86, TypeScript estricto, React Navigation (native-stack +
bottom-tabs).

**Arquitectura de datos — offline-first**: check-in/check-out escriben primero a SQLite local
(`src/db/`), nunca bloqueados por falta de red, con estado `sincronizacion:
pendiente|sincronizando|sincronizado|error`. `src/services/syncService.ts` sube en segundo plano lo
pendiente hacia Supabase (máx. 5 intentos por jornada), disparado por `NetworkContext` (poll de
conectividad cada 15s). El GPS (`src/services/trackingService.ts`) es distinto: _best-effort_, sin
cola de reintentos en SQLite — perder un ping no importa, el siguiente llega en 20s.

**Pantallas**: `LoginScreen`, `RegistroScreen`, `CheckInScreen` (+ lista de rutas activas),
`HistorialScreen` (+ botón exportar), `DetalleJornadaScreen`. No existe una pantalla
`CheckOutScreen` propia — el check-out se hace desde `DetalleJornadaScreen` (revela `CheckOutForm`
in situ). Navegación **totalmente tipada, sin `any`** (`src/navigation/types.ts`):
`RootStackNavigationProp`, `TabsNavigationProp<T>` (composite type — los tabs necesitan navegar a
rutas del stack raíz, como `DetalleJornada`), `DetalleJornadaRouteProp`.

**Campos de una jornada** (`src/types/index.ts`): empresa, matrícula, ruta, km inicial/final,
combustible inicial/final (`NivelCombustible` — porcentaje `number` 0-100, ver más abajo),
incidencias (tipo + detalle), 3 fotos (tacómetro inicial, hoja de ruta opcional, tacómetro final),
lat/lng de inicio y cierre.

**Combustible como porcentaje**: `NivelCombustible` era un enum de texto de 5 niveles
(`"Reserva"|"1/4"|"1/2"|"3/4"|"Lleno"`) y pasó a ser `number` (0-100). El selector
(`SelectorCombustible.tsx`) es una barra de progreso tocable + chips de paradas redondas
(0/10/25/50/75/100) construida con `Pressable`/`View` puros — sin librería de slider (sería un
módulo nativo nuevo, contra la política de no reconstruir el dev client). La migración de datos
existentes (mapeo Reserva→0, 1/4→25, 1/2→50, 3/4→75, Lleno→100) corrió en tres capas: SQLite local
(`database.ts`, `UPDATE` idempotente en cada apertura de la app), Supabase
(`supabase/schema_v3_combustible_porcentaje.sql`, `ALTER COLUMN TYPE` con `CASE` — ya aplicada en
el proyecto real) y el reporte Excel (`server/mock/reportes.js`, ahora formatea `"75%"`).

**Fotos de respaldo en incidencias**: `IncidenciasForm.tsx` (usado solo dentro de `CheckOutForm` —
es el único punto de captura de incidencia _estructurada_, con tipo + detalle; distinto del campo
`incidencias` de texto libre del check-in, que no tiene fotos) permite adjuntar 0 o más fotos
opcionales vía el componente `GaleriaFotosIncidencia.tsx` (grilla de miniaturas, ✕ para eliminar
individualmente, nunca obligatorio). Persistencia: `Jornada.fotosIncidenciaUris` (local, arreglo) /
`fotosIncidencia` (URLs públicas tras sincronizar) — en SQLite se guardan como JSON stringificado
(no hay arrays nativos) y en Supabase como `text[]` (`fotos_incidencia`, columna agregada en
`schema_v4`). `syncService.ts` las sube todas juntas en un solo lote (simplificación consciente: a
diferencia de tacómetro/ruta, no rastrea qué foto individual ya se subió en un reintento parcial).

**Layout de texto largo en `DetalleJornadaScreen.tsx`**: el componente `Fila` original (fila
`flexDirection:"row"` + `justifyContent:"space-between"`, dos `Text` sin `flex`/`flexShrink`) hacía
que mensajes largos (detalle de incidencia, observaciones de check-in) se desbordaran del
contenedor. Se agregó `FilaTexto` (etiqueta arriba, texto a ancho completo abajo, en columna) para
esos dos casos específicos — `Fila` se mantiene para los pares corto "etiqueta: valor" normales.

**i18n**: `i18next`/`react-i18next`, español por defecto, selector visual de banderas 🇪🇸/🇬🇧
(componente `LanguageSelector`, único punto de cambio de idioma, vive solo en `LoginScreen`).
Diccionarios `es.json`/`en.json` con paridad exacta de claves. ⚠️ **Corrección**: la persistencia
**no usa `AsyncStorage`** — usa `src/services/almacenamientoSeguro.ts` (`expo-secure-store` nativo
/ `localStorage` en web). Es una decisión deliberada y recurrente en todo el proyecto: nunca se
agregan módulos nativos nuevos que exijan reconstruir el dev client (`AsyncStorage`,
`expo-file-system`, `expo-localization`, etc.) — se resuelve con lo ya compilado.

**Integración Supabase** (`src/lib/supabase.ts`): cliente con `persistSession: true` usando un
adaptador de storage propio sobre `almacenamientoSeguro.ts` (mismo motivo que arriba, no
`AsyncStorage`). `authService.ts`, `storageService.ts`, `syncService.ts` y `trackingService.ts`
hablan directo con Supabase. ⚠️ La app móvil **ya no habla con el mock server en absoluto** —
`src/services/api.ts` solo sobrevive por la clase `ErrorApi` (la usa `authService.ts` para
distinguir 401/409). La exportación de reportes se quitó de la app (era el último uso de
`EXPO_PUBLIC_API_URL`, también eliminada); es ahora exclusiva del Dashboard web (ver §4).

## 4. Módulo Dashboard web (`dashboard/`)

Proyecto Next.js **independiente y autocontenido** (su propio `package.json`/`node_modules`),
hermano de `server/mock/` dentro de este mismo repo. **Excluido** del `tsconfig.json` de la raíz
porque tiene el suyo propio con otros alias `@/*` (correr `npx tsc --noEmit` desde `dashboard/`
para tipar ese proyecto, no desde la raíz).

Stack: Next.js App Router, TypeScript, Tailwind CSS v4, componentes UI hechos a mano en
`components/ui/` (no se corrió el CLI de shadcn — son primitivas propias con
`cva`/`clsx`/`tailwind-merge`, sin Radix, para mantener el build 100% autocontenido),
`react-leaflet` (carga dinámica `ssr:false`, obligatoria porque Leaflet necesita `window`),
TanStack Query, `next-themes` para modo claro/oscuro.

**Auth**: ⚠️ no usa Supabase Auth ni las cuentas de chofer. Login de administrador único por
contraseña compartida (env var `DASHBOARD_ADMIN_PASSWORD`), cookie firmada con HMAC-SHA256
(`lib/auth.ts`, Web Crypto nativo, sin librería de JWT). `proxy.ts` (el `middleware.ts` de Next 16)
protege todas las rutas menos `/login` y `/api/auth/*`.

**Rutas**:

- `/login` — formulario de contraseña.
- `/mapa` — mapa Leaflet a pantalla completa, polling a `/api/tracking/ultimas-posiciones` cada 8s,
  marcadores verde (en movimiento) / ámbar (detenido) / rojo (incidencia), panel lateral de
  choferes activos.
- `/jornadas` — tabla filtrable (empresa/chofer/estado/rango de fechas) desde `/api/jornadas`,
  modal de detalle (`jornada-detalle-dialog.tsx`) con las 3 fotos de la jornada (tacómetro
  inicial/ruta/final) + galería sin límite de fotos de respaldo de la incidencia
  (`jornada.fotos_incidencia`, mismo bucket `evidencias`). No muestra lat/lng ni enlaces de mapa.
- Botón exportar → `POST /api/reportes/exportar`, que reenvía a `server/mock`'s
  `/reports/export-excel`.

Todas las rutas `/api/*` usan `lib/supabase/server.ts` (cliente con el `service_role` key, marcado
`server-only` — el build falla si se importa por error desde código de cliente). `lib/supabase/client.ts`
(con el `anon` key) existe pero no se usa todavía — quedaría preparado para un futuro login de
chofer si se decide agregar uno.

## 5. Estándares de calidad y reglas de código

- **TypeScript estricto, sin `any`**: cumplido en la app móvil (los 6 usos que quedaban, todos
  `useNavigation`/`useRoute` sin tipar, se resolvieron con los tipos de `src/navigation/types.ts`).
  El Dashboard nació sin ningún `any`.
- **ESLint + Prettier**: configurados de forma independiente en cada sub-proyecto (no hay un lint
  compartido a nivel monorepo — son 3 `package.json` distintos):
  - **Raíz (app móvil)**: `eslint.config.js` (flat config, `eslint-config-expo` +
    `eslint-config-prettier`), `.prettierrc.json`. Scripts: `npm run lint`, `npm run format`,
    `npm run format:check`.
  - **`dashboard/`**: `eslint.config.mjs` (`eslint-config-next` + `eslint-config-prettier` al
    final, para que las reglas de estilo no choquen), `.prettierrc.json` (`singleQuote: false`,
    igual que los otros dos sub-proyectos). Scripts: `npm run lint`, `npm run format`,
    `npm run format:check`.
  - **`server/mock/`**: `eslint.config.js` (flat config, `@eslint/js` recommended + reglas de
    Node/CommonJS), `.prettierrc.json`. Mismos 3 scripts que la raíz.
- **UI móvil**: estilos y colores centralizados exclusivamente en `src/theme/` (`colors.ts`,
  `spacing.ts`, `typography.ts`) — nada de colores/tamaños hardcodeados fuera de ahí.
- Verificación estándar antes de cerrar una tarea: `npx tsc --noEmit` **en cada sub-proyecto que se
  haya tocado** (raíz y `dashboard/` tienen tsconfigs independientes) + `npm run lint` +
  `npm run format:check` donde aplique.

## 6. Deuda técnica y pendientes conocidos

- Rutas legacy del mock server (`/auth/login`, `/auth/registro`, `/jornadas`, `/tracking/ping`,
  `/tracking/ultimas-posiciones`, el WebSocket `/ws/tracking`) ya no las usa nadie — solo se
  conservó `/reports/export-excel`. Limpiar si se confirma que no hacen falta de referencia.
- OSRM/Nominatim no implementados (solo visor de mapa, sin ruteo ni geocodificación).
- El Dashboard no tiene roles de administrador (tabla `admins`, etc.) — es una sola contraseña
  compartida por env var. Suficiente para el MVP interno actual, no para múltiples administradores
  con distintos permisos.
- `server/src/` (`db/schema.sql`, `routes/auth.example.ts`) es documentación de referencia de un
  backend "desde cero" que nunca se llegó a construir — quedó obsoleta frente al Supabase real de
  `supabase/schema.sql` y no se mantuvo sincronizada (usa nombres de campo distintos, ej.
  `licencia_conducir` en vez de `dni`). No usar como fuente de verdad del esquema.
- El Dashboard web no tiene enlaces a Google Maps en su propia UI (solo la app móvil y el Excel) —
  ver §2.
- El reporte Excel muestra como máximo 3 fotos de respaldo por incidencia (columnas fijas); el
  Dashboard sí las muestra todas sin límite en el modal de detalle.
