# Contexto del proyecto — app-transp

_Última actualización: 2026-09-12._

Documento de referencia técnica para cualquier IA (o persona) que retome trabajo en este
repositorio. Refleja el **estado real del código**, no el plan original — donde la implementación
se apartó de una especificación anterior por una razón concreta, queda anotado con ⚠️.

## 1. Visión general y propósito

Sistema de control de jornadas y flotas compuesto por tres proyectos independientes que
comparten el mismo backend (Supabase):

- **App móvil** (raíz de este repo): Expo + React Native + TypeScript. La usan los choferes para
  hacer check-in/check-out de sus jornadas: fotos, kilometraje, combustible, GPS e incidencias.
- **Dashboard web administrativo** (`dashboard/`): Next.js 16 (App Router) + TypeScript + Tailwind
  v4. Panel interno para ver la flota en un mapa en vivo, revisar y **corregir** jornadas con
  auditoría, y exportar reportes en Excel filtrados.
- **Servidor de reportes** (`server/mock/`): Node + Express, reducido a un único endpoint
  (`POST /reports/export-excel`) que genera el `.xlsx` y lo envía por correo vía la API de Resend.

**Stack tecnológico de un vistazo**: Next.js (Dashboard) · Node/Express (servidor de reportes) ·
Supabase (PostgreSQL + PostGIS + Auth + Storage + RLS) · Expo/React Native (móvil) · Leaflet +
OSRM (mapa en vivo y trazado de rutas, ambos sobre OpenStreetMap, sin API key) · Render (hosting de
Dashboard y servidor de reportes) · Resend (envío de correo vía API HTTPS, producción) · GitHub
(`github.com/itday2day/app-transp`, rama `master`, auto-deploy a Render en cada push).

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
│   ├── schema_v4_fotos_incidencia.sql  # columna fotos_incidencia text[]
│   ├── schema_v5_edicion_jornadas.sql  # auditoría de edición manual (ver §4)
│   ├── schema_v6_ruta_jornada.sql  # vista para el trazado histórico de rutas (ver §4)
│   └── schema_v7_admins.sql  # tabla `admins` — cuentas individuales del Dashboard (ver §4)
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
- `jornadas` — mismos campos que el tipo `Jornada` del móvil, en `snake_case`, más 4 columnas de
  auditoría agregadas en `schema_v5_edicion_jornadas.sql`: `fue_editado boolean`, `editado_por
text`, `editado_en timestamptz`, `motivo_edicion text` (ver "Edición de jornadas y auditoría" en
  §4).
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
Dashboard. **Corrección (2026-09-10)**: tanto OSRM (cálculo de rutas) como Nominatim
(geocodificación inversa) **ya están implementados** — ver "Trazado histórico de rutas" y
"Geocodificación inversa" en §4. El ecosistema OSM del proyecto (Leaflet + OSRM + Nominatim, los
tres sobre OpenStreetMap, sin API key) queda completo.

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
- **Dashboard web** (`jornada-detalle-dialog.tsx`, componente `Ubicacion`): mismo enlace de Google
  Maps que el Excel, más la dirección legible por geocodificación inversa (ver "Geocodificación
  inversa" en §4). ⚠️ Corrección: este documento decía que el Dashboard no tenía esto — se agregó el
  2026-09-10, junto con Nominatim.

**Envío de reportes**: `server/mock/reportes.js` genera el `.xlsx` (ExcelJS) y lo envía por dos
caminos posibles. ⚠️ **Corrección (2026-09-07)**: Render bloquea el tráfico saliente a los puertos
SMTP (25/465/587) en servicios del plan `free` (changelog de Render, sept. 2025) — eso rompía tanto
un SMTP real como el fallback de Ethereal en producción (ambos hablan SMTP puro), con
`Error: Connection timeout`. Por eso:

- Si está configurada `RESEND_API_KEY`, se envía vía la **API HTTPS de Resend**
  (`POST https://api.resend.com/emails`, puerto 443 — no bloqueado). Es el camino que usa
  producción. ⚠️ **Sin dominio propio verificado en Resend** (no se configuró — la empresa no tenía
  uno disponible), el remitente queda fijo en `onboarding@resend.dev` y Resend solo entrega al mismo
  correo con el que se creó la cuenta — cualquier otro destinatario en el campo "Correo de destino"
  del Dashboard devuelve 403. Verificar un dominio propio (registros DNS) levantaría esa
  restricción; `RESEND_FROM_EMAIL` permite fijar un remitente propio una vez que eso pase.
- Si no, cae al camino anterior con `nodemailer`: SMTP real si existen `SMTP_HOST`/`SMTP_USER`/
  `SMTP_PASS`, o si no, una cuenta de prueba Ethereal (sin credenciales, genera un link de
  previsualización). Este camino solo se usa en desarrollo local, donde SMTP no está bloqueado.

Las columnas de foto son solo hipervínculo a la imagen en el
bucket público de Supabase Storage — ya no se incrustan miniaturas (se quitó a propósito: evitaba
tener que descargar cada foto al generar el reporte). Incluye 3 columnas fijas "Foto Incidencia
1/2/3" (⚠️ tope de 3 — Excel no soporta varios hipervínculos en una sola celda; si una incidencia
tiene más fotos, las adicionales solo se ven, sin límite, en el detalle de jornada del Dashboard) y
2 columnas de ubicación con hipervínculo a Google Maps (ver arriba). El endpoint `POST /reports/export-excel` es
**el único que existe** en el mock server — `/reports/export-excel` lo llama únicamente
`dashboard/app/api/reportes/exportar/route.ts`, y es _stateless_ (recibe el arreglo completo de
jornadas en el body, generado server-side por ese Route Handler, no por el cliente). ⚠️ **La
exportación de reportes ya no existe en la app móvil** (se quitó `ModalExportarReporte.tsx`,
`reportesService.ts` y `listarJornadasPorRango()`) — es una función exclusiva del Dashboard web.

⚠️ **Límite de payload** (2026-09-08): `express.json()` en `server/mock/index.js` usaba el límite
por defecto de 100kb, insuficiente para el arreglo completo de jornadas (hasta 5000,
`MAX_JORNADAS_POR_REPORTE`) con URLs de fotos y texto de incidencias embebidos — con datos reales,
~40 jornadas ya lo superaban y el body-parser respondía 413 con body vacío, indistinguible para el
Dashboard de un rechazo genérico. Subido a 20mb.

**Limpieza de deuda técnica (2026-09-09)**: las rutas legacy del mock server que quedaban del viejo
backend Express pre-Supabase (`/auth/login`, `/auth/registro`, `/jornadas/sincronizar`, `GET
/jornadas`, `/tracking/ping`, `/tracking/ultimas-posiciones`, el WebSocket `/ws/tracking`) **se
eliminaron por completo**, junto con todo lo que quedaba huérfano por su culpa: la función
`exigirToken()`, los `Map` en memoria, la config de `multer` para subir fotos a disco
(`CARPETA_UPLOADS`, `/uploads` estático), y las dependencias `multer`/`ws` en `package.json`.
`server/mock/index.js` pasó de 285 a 47 líneas — solo `express`, `cors`, `express.json({ limit:
"20mb" })` y `POST /reports/export-excel`.

**Despliegue (`render.yaml`, raíz del repo)**: blueprint de Render con dos Web Services aislados,
**en producción y en uso real** (⚠️ corrección: este documento decía "pre-deploy" hasta el
2026-09-09; ya está desplegado):

- `app-transp-dashboard` — `rootDir: dashboard`, `npm install && npm run build` / `npm run start`
  → `https://app-transp-dashboard.onrender.com`.
- `app-transp-mock-server` — `rootDir: server/mock`, `npm install` / `npm start`
  → `https://app-transp-mock-server.onrender.com`.

Ambos en plan `free`, con dos limitaciones reales de esa plataforma (no bugs de este código):

- **Cold start**: un servicio sin tráfico ~15 min se duerme; la primera petición que le llega
  después puede devolver 502 mientras despierta (unos segundos). El segundo intento normalmente
  funciona. Pasa sobre todo con `app-transp-mock-server`, que solo recibe tráfico al exportar un
  reporte.
- **SMTP bloqueado en el plan free** (ver "Envío de reportes" más arriba) — por eso el envío de
  correo en producción pasa por la API HTTPS de Resend, no por SMTP directo.

Todas las variables sensibles (`SUPABASE_SERVICE_ROLE_KEY`, `DASHBOARD_ADMIN_PASSWORD`,
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) están
marcadas `sync: false` — no viajan en el blueprint, se cargan a mano en cada servicio, Environment,
en el dashboard de Render. `MOCK_SERVER_URL` (env var del servicio dashboard) es la URL con la que
`dashboard/app/api/reportes/exportar/route.ts` llama al mock server; en local apunta a
`http://localhost:4000`, en producción a la URL de `app-transp-mock-server` de arriba.

**Alineación corporativa y cuentas**: el proyecto Supabase está confirmado bajo `it@day2day.es`
(ver arriba). El repo de GitHub es `github.com/itday2day/app-transp`. Una cosa queda pendiente de
verificar, la otra ya se confirmó:

- ⚠️ **Resend**: se configuró con una API key provista por el usuario, pero no está confirmado que
  la cuenta de Resend asociada sea `it@day2day.es` — no hay forma de verificarlo desde el código,
  solo entrando al dashboard de Resend con esa cuenta.
- **EAS/Expo — confirmado (2026-09-10)**: la máquina de desarrollo ya tenía sesión activa de
  `eas-cli` logueada como `it@day2day.es`, con acceso Owner a las cuentas `day2day.es` e
  `itday2day.es`. `eas project:info` confirma que el proyecto (`extra.eas.projectId` en `app.json`,
  `3c0c2511-252f-4887-9f1b-a555de4591cb`) es `@itday2day.es/control-de-jornada` — pertenece a la
  cuenta corporativa correcta. El `"owner": "itday2day.es"` que tenía `app.json` (formato inválido
  para ese campo, se quitó el 2026-09-09) resulta que sí apuntaba bien, solo con un formato que EAS
  no reconoce — quitarlo para que se autodetecte fue el camino correcto igual.
- `app.json` → `ios.bundleIdentifier` / `android.package`: `com.tuempresa.appteransp` (placeholder
  genérico, nunca personalizado) → **`com.day2day.apptransp`** (2026-09-09).

## 3. Módulo móvil (raíz del repo)

Stack: Expo (~57), React Native 0.86, TypeScript estricto, React Navigation (native-stack +
bottom-tabs). Identificadores de `app.json` (`ios.bundleIdentifier`/`android.package`):
`com.day2day.apptransp` (antes un placeholder genérico sin personalizar) — ver "Alineación
corporativa y cuentas" en §2 para el estado pendiente de verificación de la cuenta EAS.

**Arquitectura de datos — offline-first**: check-in/check-out escriben primero a SQLite local
(`src/db/`), nunca bloqueados por falta de red, con estado `sincronizacion:
pendiente|sincronizando|sincronizado|error`. `src/services/syncService.ts` sube en segundo plano lo
pendiente hacia Supabase (máx. 5 intentos por jornada), disparado por `NetworkContext` (poll de
conectividad cada 15s). El GPS (`src/services/trackingService.ts`) es distinto: _best-effort_, sin
cola de reintentos en SQLite — perder un ping no importa, el siguiente llega en 20s.

**Pantallas**: `LoginScreen`, `RegistroScreen`, `CheckInScreen` (solo la lista de rutas activas),
`NuevoCheckInScreen`, `HistorialScreen` (+ botón exportar), `DetalleJornadaScreen`. No existe una
pantalla `CheckOutScreen` propia — el check-out se hace desde `DetalleJornadaScreen` (revela
`CheckOutForm` in situ). Navegación **totalmente tipada, sin `any`** (`src/navigation/types.ts`):
`RootStackNavigationProp`, `TabsNavigationProp<T>` (composite type — los tabs necesitan navegar a
rutas del stack raíz, como `DetalleJornada`), `DetalleJornadaRouteProp`.

⚠️ **Corrección (2026-09-11)**: iniciar una ruta nueva **ya no es un formulario inline** dentro de
`CheckInScreen` (que también muestra la lista de rutas activas) — es su propia pantalla del stack,
`NuevoCheckInScreen` (ruta `NuevoCheckIn`, sin parámetros), con botón "Atrás" nativo (header, mismo
patrón que `DetalleJornadaScreen`/`RegistroScreen`) + un botón "Cancelar" explícito al pie (mismo
patrón que ya usa `CheckOutForm`). Antes, una vez abierto el formulario, no había ninguna forma de
cancelarlo salvo enviarlo. `useJornadasAbiertas()` (en `CheckInScreen`) ya usaba `useFocusEffect`,
así que la lista se refresca sola al volver con `goBack()` tras un check-in exitoso, sin necesidad
de pasar ningún callback de refresco entre pantallas.

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

**Fix de renderizado — foto de ruta opcional** (`DetalleJornadaScreen.tsx`, sección de check-in):
la fila de fotos renderizaba `fotoTacometroInicialUri` y `fotoRutaUri` como dos `<Image>`
incondicionales lado a lado. Como `fotoRutaUri` es opcional (§ arriba, "Fotos de respaldo en
incidencias" y el tipo `Jornada` en `src/types/index.ts`), cuando el chofer no cargaba la foto de
ruta se mostraba un recuadro vacío junto a la foto del tacómetro, inconsistente con el patrón ya
usado más abajo para `fotoTacometroFinalUri` (renderizado condicional). Corregido envolviendo el
`<Image>` de `fotoRutaUri` en `jornada.fotoRutaUri ? (...) : null`, igual que su análogo de
check-out.

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

**Fix — auto-refresh de sesión en segundo plano, iOS (2026-09-10)**: el cliente tenía
`autoRefreshToken: true` sin conectar al `AppState` de React Native. El timer de refresco de
`supabase-js` sigue disparando con la app en segundo plano, y en ese momento intenta leer el token
del Keychain (vía `expo-secure-store`), que en iOS rechaza el acceso con `KeyChainException: User
interaction is not allowed` porque la app no está activa. `src/lib/supabase.ts` ahora tiene un
listener de `AppState` que llama `supabase.auth.startAutoRefresh()`/`stopAutoRefresh()` según el
estado de la app — patrón oficial de Supabase para React Native.

**Robustecimiento del Check-Out (2026-09-10)** — tres fixes encadenados sobre un caso real donde
una jornada quedaba "Error al enviar" para siempre:

1. `DetalleJornadaScreen.tsx` esperaba (`await`) la captura de GPS **antes** de guardar el
   check-out; si fallaba (sin señal, GPS apagado, interior de un edificio), bloqueaba el check-out
   por completo pese a que el chofer ya había llenado todo el formulario. Ahora el check-out se
   guarda igual (local-first, como el resto del flujo) con `latFinal`/`lngFinal` nulos si hace
   falta, y avisa con un mensaje distinto (`checkOutForm.exitoMensajeSinUbicacion`).
2. `syncService.ts` descartaba el error real de `subirJornada()` en un `catch {}` vacío — imposible
   diagnosticar por qué una jornada puntual no sincronizaba nunca, ni desde la app ni revisando el
   código. Ahora se loguea con `console.error` (id, matrícula, número de intento).
3. El hallazgo real detrás del caso: el auto-sync de fondo reintenta cada 15s
   (`INTERVALO_REVISION_MS` en `NetworkContext.tsx`) con un tope de `MAX_INTENTOS = 5` — se agota en
   menos de un minuto con la app abierta. Una vez agotado, **no había ninguna forma de reintentar**:
   el pull-to-refresh de `HistorialScreen` llamaba a la misma `sincronizarPendientes()` que
   respetaba ese mismo tope, así que una jornada atascada quedaba atascada para siempre, sin ningún
   camino manual. `sincronizarPendientes(forzarReintento)` y `sincronizarAhora(forzarReintento)`
   ahora aceptan un flag para ignorar el tope; `HistorialScreen.refrescar()` lo pasa en `true` (es
   un pedido explícito del chofer de "probá de nuevo"), mientras que el auto-sync de fondo lo sigue
   respetando (si no, un pull-to-refresh cada tanto convertiría el tope en inútil).

⚠️ **Nota operativa, no de código**: durante el debugging de lo anterior, Metro Bundler se cayó en
Windows por un error del watcher de archivos (`FallbackWatcher`, el fallback que usa Metro sin
Watchman instalado) al toparse con un archivo temporal que `npm install` borró a mitad de un
escaneo dentro de `server/mock/node_modules`. Metro no se reinicia solo tras un crash así — hay que
matar el proceso y correr `npx expo start` de nuevo. Instalar Watchman evitaría este fallback más
frágil, pero no se hizo (fuera de alcance).

**Fix — banner "Sincronizando…" parpadeando cada 15s (2026-09-10)**: `NetworkContext.tsx` revisa
si hay algo pendiente de sincronizar cada `INTERVALO_REVISION_MS` (15s), y encendía
`sincronizando = true` en **cada** corrida, aunque no hubiera absolutamente nada para subir —
`BannerConexion.tsx` muestra el banner exactamente cuando `sincronizando` está en `true`, así que
parpadeaba cada 15s incluso con la app 100% al día. `syncService.ts` ahora expone
`hayJornadasPendientes(forzarReintento)` (mismo criterio de `MAX_INTENTOS` que
`sincronizarPendientes`, para que nunca queden desalineados), y `sincronizarAhora()` en
`NetworkContext` lo chequea primero — el banner solo se enciende cuando de verdad hay algo subiendo.

**Manejo de teclado en formularios (2026-09-11)** — SDD completo (spec aprobada antes de
implementar). `CheckInScreen.tsx` (ahora `NuevoCheckInScreen.tsx`, ver arriba) no tenía
`KeyboardAvoidingView` ni `keyboardShouldPersistTaps` en absoluto — el gap más severo, ya
corregido con el mismo patrón (`behavior={Platform.OS === "ios" ? "padding" : "height"}`) que ya
usaban `RegistroScreen.tsx` y `DetalleJornadaScreen.tsx` (esas dos no se tocaron). Para los campos
de texto largo al final de un formulario ("Incidencias" en check-in, "Detalle de incidencia" en
`IncidenciasForm.tsx` dentro de `CheckOutForm.tsx`) se agregó scroll-al-enfocar **preciso** (no
`scrollToEnd`, medición real de la posición del campo) — encontramos y resolvimos dos bugs reales,
no uno, confirmados en vivo contra el log de Metro:

1. `ref.measureLayout()` (el método de instancia, oficialmente "el recomendado" por React Native)
   tira `Warning: ref.measureLayout must be called with a ref to a native component` con el ref de
   `CampoTexto` (envuelto con `forwardRef`) — no lo reconoce como componente nativo pese a que
   reenvía el ref directo al `TextInput` real. Se resolvió usando `UIManager.measureLayout()` (la
   función de más bajo nivel: tags numéricos vía `findNodeHandle` en vez de llamar el método sobre
   la instancia del ref) — evita el problema por completo, y funciona igual bajo Fabric/New
   Architecture (rama interna hacia `FabricUIManager.measureLayout`).
2. **La causa real de que el campo siguiera tapado** pese a que el `scrollTo` corría bien: el campo
   es el **último elemento del formulario** — sin importar qué tan preciso fuera el cálculo, el
   `ScrollView` no tenía contenido de sobra debajo como para poder subirlo del todo arriba del
   teclado (se topaba con el límite de su propio contenido scrolleable). Se agregó
   `ESPACIO_EXTRA_TECLADO` (300, nuevo en `src/theme/spacing.ts` — no es un token de ritmo visual
   como el resto de `espaciado`, por eso vive aparte con su propio nombre) como `paddingBottom`
   extra del `contentContainerStyle` en los dos formularios afectados.

Sin `keyboardVerticalOffset` en ningún lado — las pantallas con header nativo (native-stack) ya
funcionan sin él, agregar un número fijo sin poder verlo en un dispositivo real sería un valor
inventado.

## 4. Módulo Dashboard web (`dashboard/`)

Proyecto Next.js **independiente y autocontenido** (su propio `package.json`/`node_modules`),
hermano de `server/mock/` dentro de este mismo repo. **Excluido** del `tsconfig.json` de la raíz
porque tiene el suyo propio con otros alias `@/*` (correr `npx tsc --noEmit` desde `dashboard/`
para tipar ese proyecto, no desde la raíz).

Stack: Next.js App Router, TypeScript, Tailwind CSS v4, componentes UI hechos a mano en
`components/ui/` (no se corrió el CLI de shadcn — son primitivas propias con
`cva`/`clsx`/`tailwind-merge`, sin Radix, para mantener el build 100% autocontenido: `Dialog`
propio con portal + Escape/click-afuera, y `Tooltip` propio con `group-hover`/`group-focus` puro de
Tailwind, sin JS ni portal), `react-leaflet` (carga dinámica `ssr:false`, obligatoria porque
Leaflet necesita `window`), TanStack Query, `next-themes` para modo claro/oscuro.

**Auth**: ⚠️ no usa Supabase Auth ni las cuentas de chofer. **Corrección (2026-09-11)**: dejó de ser
una sola contraseña compartida — ahora cada administrador tiene su propia cuenta en la tabla
`admins` (`supabase/schema_v7_admins.sql`: `id uuid`, `email unique`, `nombre`, `password_hash`,
`activo`, `creado_en`, `ultimo_acceso`; sin RLS, se lee solo desde Route Handlers con el
`service_role` key, igual que el resto de tablas del Dashboard). Un solo rol — cualquier admin
autenticado tiene el mismo acceso que antes (mapa, jornadas, exportar, corregir); no hay niveles de
permiso.

- `POST /api/auth/login` (`app/api/auth/login/route.ts`, runtime Node): recibe `{ email, password
}`, busca el admin por `email` (comparación exacta en minúsculas — los correos se insertan en
  minúsculas al dar de alta un admin), valida `activo = true` y `bcryptjs.compare(password,
  password_hash)`. Mensaje de error genérico ("Correo o contraseña incorrectos.") sin distinguir
  cuál de los tres falló, para no filtrar qué correos existen. Si es correcto, actualiza
  `ultimo_acceso = now()` y emite la cookie de sesión.
- `lib/auth.ts` (Web Crypto nativo, sin librería de JWT — mismo criterio que antes): la cookie
  firmada (HMAC-SHA256) pasa de un flag genérico a un payload real,
  `{ adminId, email, nombre, iat }` codificado en base64url + firma hex. El secreto de firma es
  ahora `DASHBOARD_SESSION_SECRET` (env var nueva) — **no** la contraseña de ningún admin (cada uno
  tiene la suya, con su propio hash en `admins.password_hash`; ya no hay un único secreto compartido
  que además sirva para firmar cookies). `obtenerAdminSesion(valorCookie)` valida la firma y
  devuelve la identidad, o `null`; `esCookieSesionValida()` (la usa `proxy.ts`) es ese mismo chequeo
  reducido a booleano. A propósito el módulo sigue sin importar `next/headers` ni `bcryptjs`: quien
  llama (el Route Handler, vía `cookies()`) le pasa el valor crudo de la cookie, para que el archivo
  siga funcionando igual en runtime Edge (`proxy.ts`) y Node (Route Handlers) — `bcryptjs` (hash de
  contraseña) solo se usa en el login, que corre en Node.
- `proxy.ts` no cambió de fondo: sigue validando solo la firma de la cookie (`esCookieSesionValida`),
  protegiendo todas las rutas menos `/login` y `/api/auth/*`.
- Logout: `POST /api/auth/logout` + `components/logout-button.tsx` (botón visible en el header del
  layout del Dashboard) — ya existían antes de esta corrección, sin cambios.
- `DASHBOARD_ADMIN_PASSWORD` **se quitó** (código y `render.yaml`) una vez migrado a `admins`.

**Rutas**:

- `/login` — formulario de contraseña.
- `/mapa` — mapa Leaflet a pantalla completa, polling a `/api/tracking/ultimas-posiciones` cada 8s,
  marcadores verde (en movimiento) / ámbar (detenido) / rojo (incidencia), panel lateral de
  choferes activos.
- `/jornadas` — tabla filtrable (empresa/chofer/estado/rango de fechas) desde `/api/jornadas`,
  modal de detalle (`jornada-detalle-dialog.tsx`) con las 3 fotos de la jornada (tacómetro
  inicial/ruta/final) + galería sin límite de fotos de respaldo de la incidencia
  (`jornada.fotos_incidencia`, mismo bucket `evidencias`). No muestra lat/lng ni enlaces de mapa.
  Desde ahí también se abre la corrección de la jornada (ver más abajo).
- Botón exportar → `POST /api/reportes/exportar`, que reenvía a `server/mock`'s
  `/reports/export-excel`.
- Botón "Corregir" (en el modal de detalle) → `POST /api/jornadas/editar`.

**Exportación de reportes — filtros de solo lectura** (`exportar-reporte-dialog.tsx`): el modal es
una vista de **confirmación**, no un formulario — los filtros (fechas, empresa, chofer, estado) se
derivan directo del `filtros` (estado de la tabla de `/jornadas`) en cada render, sin `useState`
propio, y los inputs quedan `disabled`/`readOnly`. El único campo editable es el correo de destino,
que no tiene equivalente en la tabla. ⚠️ Antes de esto, el modal tenía estado propio desconectado
de la tabla: fechas por defecto fijas ("últimos 7 días"), el filtro de chofer no existía en el
flujo de export en absoluto, y estado no se enviaba aunque el backend ya lo soportaba — se
corrigió agregando `chofer` a `ExportarReporteRequest` y a la query de
`api/reportes/exportar/route.ts` (mismo `.ilike("chofer_nombre", ...)` que usa `/api/jornadas`), y
conectando el modal a los filtros reales. El padre (`jornadas/page.tsx`) le pasa un `key`
incremental para forzar un remount cada vez que se abre — `Dialog` solo oculta su contenido en vez
de desmontarlo, así que sin eso el correo/resultado de un envío anterior quedaría pegado.

**Edición de jornadas y auditoría** (`editar-jornada-dialog.tsx` + `POST /api/jornadas/editar`):
permite corregir empresa, matrícula, ruta, km y combustible (inicial/final) de una jornada desde el
Dashboard, con un "Motivo de la corrección" obligatorio. Al guardar, marca
`fue_editado = true`, `editado_en = NOW()` y `motivo_edicion` en la fila (ver columnas en §2). La
tabla de jornadas y el modal de detalle muestran un `Badge` "Editado" con `Tooltip` (quién, cuándo,
motivo) cuando `fue_editado === true`. Tras guardar, se invalida la query de TanStack
(`queryClient.invalidateQueries({ queryKey: ["jornadas"] })`) para refrescar la tabla sin recargar
la página.

✅ **Corrección (2026-09-11)**: `editado_por` ya no es texto libre que escribe quien edita — ahora
se deriva de la sesión real (`obtenerAdminSesion()` en `lib/auth.ts`, ver "Auth" arriba), usando el
`nombre` del admin autenticado (o su `email` si no tuviera nombre cargado). El campo "Tu nombre o
correo" se quitó de `editar-jornada-dialog.tsx`; `EditarJornadaRequest` ya no lleva `editadoPor` en
el body. La columna en sí (`jornadas.editado_por text`, `schema_v5_edicion_jornadas.sql`) no cambió
de tipo — sigue siendo texto plano, no una FK a `admins.id` (habría exigido una migración de datos
para las filas ya editadas antes de este cambio; el texto real ahora es siempre confiable porque lo
escribe el servidor, no el formulario).

**Autenticación de `/api/jornadas/editar`**: no repite el chequeo de *si hay* sesión — igual que el
resto de Route Handlers de este Dashboard (`reportes/exportar`, `tracking/ultimas-posiciones`,
`jornadas`), confía en que `proxy.ts` (middleware) ya protege todo `/api/*` salvo `/api/auth/*`. Sí
lee la cookie para obtener la *identidad* del admin (vía `obtenerAdminSesion()`, no solo el booleano
`esCookieSesionValida()`) — si por algún motivo la sesión no parsea (cookie corrupta, secreto
rotado), devuelve 401 en vez de guardar con una identidad vacía.

**Trazado histórico de rutas (2026-09-10)**: en `/mapa`, botón "Ver ruta"/"Ocultar ruta" en el
panel de choferes activos (`panel-choferes.tsx`) dibuja el trayecto completo de la jornada actual
de ese chofer, ajustado a las calles.

- `supabase/schema_v6_ruta_jornada.sql` — vista `ubicaciones_tracking_planas`: mismo criterio que
  `ultimas_posiciones` (aplana `geography` a lat/lng), pero trae **todos** los pings, no solo el
  último. El filtro por jornada (`jornada_ids @> ARRAY[...]`, vía `.contains()` de supabase-js) y el
  orden por tiempo se hacen en la query, no en la vista.
- `dashboard/app/api/tracking/ruta-jornada/route.ts` — `GET ?jornadaId=`, pings ordenados
  ascendente por `timestamp`.
- `dashboard/lib/osrm.ts` — cliente de la **API pública y gratuita de OSRM**. ⚠️ **Corrección
  (2026-09-12, encontrada durante el piloto con choferes reales)**: este documento decía que se
  usaba el servicio `/route` (`router.project-osrm.org/route/v1/driving`) — se cambió a **`/match`**
  (`router.project-osrm.org/match/v1/driving`, Map Matching). `/route` calcula la ruta "óptima" entre
  los puntos recibidos, tratándolos como paradas deliberadas; con los pings espaciados del GPS
  best-effort de la app móvil (~20s, sin cola de reintentos, ver `trackingService.ts`), terminaba
  dibujando el camino más corto/rápido entre esos puntos según OSRM, no necesariamente la calle real
  que tomó el chofer — confirmado en el piloto: el trazado no coincidía con el recorrido real.
  `/match` sí ajusta una secuencia de puntos GPS al camino más probable, usando el `timestamp` de
  cada ping y un radio de tolerancia de precisión (`radiuses`). Como `ubicaciones_tracking` no
  guarda la precisión real de cada ping (no existe esa columna), se usa un **radio fijo de 25
  metros** para todos los puntos en vez de sumar tracking de precisión real en esta iteración. Si
  `/match` devuelve el trayecto partido en varios `matchings` (pasa con un salto de más de 60s entre
  dos pings, o una transición poco plausible), se concatenan sus geometrías en orden sin lógica
  especial — `<Polyline>` ya dibuja una línea recta entre cada par de puntos consecutivos del
  arreglo, así que la concatenación conecta el final de un tramo con el inicio del siguiente con una
  línea recta de por sí, el mismo criterio que ya usaba (y sigue usando) el archivo como fallback
  cuando OSRM falla del todo. El resto del diseño no cambió: sigue siendo el servidor demo público de
  OSRM, no un servicio contratado — su política de uso es para pruebas/tráfico liviano, no producción
  sostenida; puede aplicar rate-limit o caerse sin aviso, y si el trazado por calles se vuelve una
  función central (no solo una mejora visual ocasional) habría que evaluar una instancia propia o un
  proveedor pago (Mapbox Directions, Google Roads, etc.). La función recibe pings con `lat`/`lng`/
  `timestamp` y devuelve coordenadas como `[lat, lng]` (consistente con el resto del proyecto —
  Leaflet, `PosicionChofer`, etc.), manejando la inversión a `[lng, lat]` que exige GeoJSON/OSRM de
  forma transparente para quien la llama. Muestrea a máximo 100 puntos (límite práctico de largo de
  URL, no de la API en sí) conservando siempre el primer y el último punto — el muestreo preserva
  ping completo (lat/lng/timestamp), no solo lat/lng, porque `/match` necesita el timestamp de cada
  coordenada que sobrevive el muestreo.
- `dashboard/lib/hooks/use-ruta-jornada.ts` — orquesta: pings crudos → OSRM → si OSRM falla, cae a
  una línea recta entre los pings en vez de no mostrar nada.
- `dashboard/components/mapa/ruta-historica.tsx` — `Polyline` (`#2563eb`, grosor 4, opacidad 0.8) +
  marcadores de inicio/fin. **Sin** su propio `dynamic(..., { ssr: false })`: ya vive detrás del
  límite ssr:false que envuelve `MapaFlota` completo a nivel de página
  (`app/(dashboard)/mapa/page.tsx`) — envolverlo de nuevo sería redundante.
- La "selección de jornada" para ver su ruta usa el chofer seleccionado en el panel de activos
  (su `jornadaIds[0]`), no un buscador de jornadas pasadas por rango de fechas — eso sería una
  función más grande (reutilizando los filtros de `/jornadas`), todavía no construida.

**Geocodificación inversa (2026-09-10)**: en el modal de detalle de jornada (`jornada-detalle-dialog.tsx`,
componente `Ubicacion`), cada coordenada de check-in/check-out muestra un enlace "Ver en mapa"
(mismo formato Google Maps URLs API que ya usa el Excel) **más** la dirección legible.

- `dashboard/app/api/geocodificar/route.ts` — `GET ?lat=&lng=` contra la **API pública de
  Nominatim** (`nominatim.openstreetmap.org/reverse`). ⚠️ A diferencia de OSRM (que sí se llama
  directo desde el navegador), esta llamada **corre exclusivamente del lado del servidor** — no es
  una preferencia de diseño, es una restricción real: la política de uso de Nominatim exige
  identificar la app con un `User-Agent` válido, y los navegadores ignoran silenciosamente
  cualquier `User-Agent` custom que JavaScript intente fijar en un `fetch()` del lado del cliente.
  Solo un Route Handler puede cumplir ese requisito (acá: `"app-transp-dashboard (it@day2day.es)"`).
  Cache en memoria del propio proceso (clave = lat/lng redondeados a 4 decimales, sin expiración —
  una dirección no cambia), sin sumar Redis ni nada externo; se pierde al reiniciar el proceso,
  aceptable para el volumen de una herramienta interna. Timeout de 8s vía `AbortSignal.timeout()`;
  cualquier fallo (timeout, red, JSON inválido) devuelve `{ direccion: null }` en vez de un error —
  el Dashboard nunca se bloquea esperando una dirección, en el peor caso solo muestra el enlace al
  mapa sin el texto.
- `dashboard/lib/hooks/use-direccion.ts` — hook TanStack Query que llama a `/api/geocodificar`
  (nunca a Nominatim directo), `staleTime` de 1h.
- `dashboard/lib/osrm.ts` también recibió `AbortSignal.timeout(8000)` en esta misma tanda de
  trabajo — antes no tenía timeout, así que un servidor demo colgado (no caído, colgado) dejaba la
  query de TanStack Query esperando para siempre en vez de caer al fallback de línea recta.

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

- OSRM y Nominatim, desde 2026-09-10 (ver §4), corren contra sus servidores demo públicos y
  gratuitos, no instancias propias — ver la advertencia ⚠️ en esa sección. Si el uso crece mucho,
  evaluar alojar una instancia propia o un proveedor pago.
- Metro Bundler puede caerse en Windows si algo dentro de `node_modules/` de cualquier
  sub-proyecto cambia mientras Metro lo tiene bajo watch (ej. correr `npm install` en
  `server/mock` con la app corriendo) — es el fallback de archivo que usa Metro sin Watchman
  instalado, no algo propio de este código. Si pasa, hay que matar el proceso y correr
  `npx expo start` de nuevo; instalar Watchman lo evitaría.
- ✅ **Resuelto y desplegado (2026-09-12)**: el Dashboard ya tiene cuentas individuales de
  administrador (tabla `admins`, `bcryptjs`, ver §4) en vez de una sola contraseña compartida por
  env var; `editado_por` ahora es una identidad real derivada de la sesión, no texto libre. Migración
  completa de punta a punta: `schema_v7_admins.sql` corrido en el proyecto Supabase real, primer
  admin insertado a mano, `DASHBOARD_SESSION_SECRET` cargada en Render, deploy confirmado en
  producción (login pide correo/contraseña, badge "Editado" muestra la identidad real, logout
  funciona), y `DASHBOARD_ADMIN_PASSWORD` **ya retirada** de las env vars de Render — el código no la
  lee desde antes del deploy, y ahora tampoco existe en la plataforma. Sigue siendo un solo rol
  (fuera de alcance a propósito: niveles de permiso diferenciados, pantalla CRUD de administradores
  — el alta sigue siendo manual por SQL Editor —, recuperación de contraseña por correo, límite de
  intentos fallidos de login).
- `server/src/` (`db/schema.sql`, `routes/auth.example.ts`) es documentación de referencia de un
  backend "desde cero" que nunca se llegó a construir — quedó obsoleta frente al Supabase real de
  `supabase/schema.sql` y no se mantuvo sincronizada (usa nombres de campo distintos, ej.
  `licencia_conducir` en vez de `dni`). No usar como fuente de verdad del esquema. (Distinto de
  `server/mock/`, que sí corre en producción — ver §2.)
- El reporte Excel muestra como máximo 3 fotos de respaldo por incidencia (columnas fijas); el
  Dashboard sí las muestra todas sin límite en el modal de detalle.
- Sin dominio propio verificado en Resend, el export solo puede mandar el reporte al mismo correo
  de la cuenta de Resend (o a las direcciones de testing oficiales) — no a cualquier destinatario
  que el admin escriba (ver §2).
- Pendiente confirmar que la cuenta de Resend usada pertenezca a `it@day2day.es` (el `projectId` de
  EAS ya se confirmó, ver "Alineación corporativa y cuentas" en §2).
- ✅ **Resuelto (2026-09-10)**: durante toda la sesión previa el desarrollo corrió vía Expo Go /
  development build sobre Metro Bundler (`npx expo start`), que por diseño necesita el servidor de
  desarrollo corriendo — de ahí que la app "dejara de funcionar" al apagar la PC (no era un bug: el
  código en sí ya era 100% cloud-only, Supabase directo, sin ninguna dependencia de localhost;
  grepeado y confirmado). Se generaron dos builds standalone con EAS Build (`eas-cli` ya autenticado
  como `it@day2day.es`, confirmado dueño del proyecto):
  - `eas build --platform android --profile production` → `.aab` (formato de publicación en Google
    Play, no instalable directo en un dispositivo).
  - `eas build --platform android --profile preview` → `.apk` instalable directo (se agregó
    `android.buildType: "apk"` al perfil `preview` en `eas.json`, que no lo tenía). Este es el que
    sirve para probar la app sin depender de la PC.
  - Pendiente: iOS necesita su propio build (`eas build --platform ios`), que requiere cuenta de
    Apple Developer para poder instalarse fuera de Expo Go — no se hizo en esta sesión.
