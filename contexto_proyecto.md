# Contexto del proyecto — app-transp

_Última actualización: 2026-09-16._

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
Supabase (PostgreSQL + PostGIS + Auth + Storage + RLS) · Expo/React Native (móvil) · Leaflet (mapa en
vivo, sobre OpenStreetMap, sin API key) · Geoapify Map Matching (trazado histórico de rutas ajustado
a calles — ver §4, reemplazó a una integración con OSRM) · Render (hosting de Dashboard y servidor de
reportes) · Resend (envío de correo vía API HTTPS, producción) · GitHub
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

**Mapas**: `react-leaflet` + `leaflet` sobre OpenStreetMap, sin API key, para el visor en vivo del
Dashboard. **Corrección (2026-09-10)**: la geocodificación inversa vía Nominatim **ya está
implementada** — ver "Geocodificación inversa" en §4. ⚠️ **Corrección (2026-09-13)**: el trazado
histórico de rutas (ver esa sección en §4) usó primero OSRM, pero ya no — se migró a **Geoapify Map
Matching**, que no es parte del ecosistema OSM (es un proveedor propio, aunque construido sobre datos
OSM); Leaflet y Nominatim siguen siendo 100% OpenStreetMap sin API key, pero el trazado de rutas ya
no lo es.

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
  después puede devolver **502** mientras despierta (unos segundos, resuelto: el segundo intento
  normalmente funciona). Pasa sobre todo con `app-transp-mock-server`, que solo recibe tráfico al
  exportar un reporte.
- ⚠️ **429 "Too Many Requests" — NO es el mismo mecanismo que el cold start, aunque el síntoma se
  parezca** (investigado 2026-09-22, mismo servicio, durante un export real). Diferencias que lo
  distinguen: persistió a través de varios reintentos (el cold start se resuelve en el segundo
  intento) y se resolvió solo un rato después, sin ninguna acción — consistente con un bloqueo
  temporal a nivel de borde, no con el servicio despertando. Descartado como bug de este código por
  el mismo argumento que el 502: `server/mock/index.js`/`reportes.js` solo devuelven 400/200/500 en
  toda su superficie (grepeado `res.status(`) y sin ningún paquete de rate-limiting en
  `package.json`; el body además es texto plano, no el JSON con `mensaje` que arma nuestro Express —
  la respuesta nunca llegó al handler.
  - **Dónde NO aparece**: ni en la pestaña "Events" de Render (no hay "suspended" ni aviso de cupo de
    horas de instancia agotado), ni en "Logs" (vacío justo en el horario del 429 — confirma que el
    proceso ni llegó a recibir el pedido), ni como aviso en el dashboard/cuenta.
  - **Por qué no aparece en ningún lado de Render**: los servicios de Render corren detrás de
    Cloudflare — confirmado con `curl -i` directo contra el servicio, que muestra `Server: cloudflare`
    y un header `CF-RAY` en toda respuesta, incluida una exitosa. Es una capa de borde que gestiona
    Render, invisible desde el dashboard del cliente — un bloqueo ahí no deja rastro en Events, Logs
    ni facturación.
  - **Diagnóstico rápido para la próxima vez** (no hace falta reproducir el export real): `curl -i`
    contra la raíz del servicio (`GET /`, debería dar 404 de Express) y contra la ruta real con un
    body mínimo (`POST /reports/export-excel` con `{}`, debería dar 400 "Faltan datos..."). Si los
    dos responden rápido y con el JSON/HTML propio de la app, el servicio está sano y el 429 fue
    puntual — probablemente ligado al tamaño real del payload (hasta 5000 jornadas con fotos/
    incidencias embebidas) o a varios intentos seguidos en poco tiempo, no a un bloqueo persistente.
  - Sin acceso a la cuenta de Cloudflare/Render no se pudo confirmar la causa exacta del lado de
    ellos (regla de rate-limit por tamaño de payload, por IP de origen, o protección
    anti-abuso genérica) — quedó resuelto por sí solo, sin cambio de código.
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
cola de reintentos en SQLite — perder un ping no importa, el siguiente llega en 20s. ⚠️ **Fix —
pings duplicados (2026-09-14)**: `src/hooks/useSeguimientoGPS.ts` ahora descarta un ping antes de
enviarlo si su lat/lng/timestamp coincide exactamente con el último ping ya enviado — ver el
diagnóstico completo (causa sospechada vs. causa confirmada) en §6.

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

**Encuadre con la barra de gestos de Android (2026-09-16)**: `react-native-safe-area-context` ya
estaba instalado (`~5.7.0`, dependencia de React Navigation) y `App.tsx` ya envolvía todo en
`SafeAreaProvider` — no hizo falta agregar nada nuevo. ⚠️ La barra de tabs en sí (`RootNavigator.tsx`,
`PrincipalTabs`) **no necesitó ningún cambio tampoco**: confirmado contra el código fuente de
`@react-navigation/bottom-tabs` (no asumido) que su `BottomTabBar` por defecto ya suma `insets.bottom`
a su propio `paddingBottom` sin que haga falta `tabBarStyle` custom — y este proyecto nunca tuvo uno.
Lo que sí hacía falta era el `paddingBottom` del **contenido scrolleable** de `CheckInScreen.tsx` y
`HistorialScreen.tsx`: sin él, el último elemento de la lista quedaba tapado por la barra de tabs.
Se usa `useBottomTabBarHeight()` (de `@react-navigation/bottom-tabs`) en vez de un número fijo — da
el alto real de la barra en cada dispositivo (ya con el inset incluido) en vez de tener que
adivinarlo, útil justamente porque esta pantalla no tiene un alto de tab bar configurado en ningún
lado del código.

**Campos de una jornada** (`src/types/index.ts`): empresa, matrícula, ruta, km inicial/final,
combustible inicial/final (`NivelCombustible` — porcentaje `number` 0-100, ver más abajo),
incidencias (tipo + detalle), 3 fotos (tacómetro inicial, hoja de ruta opcional, tacómetro final),
lat/lng de inicio y cierre. ⚠️ **Empresa y ruta ya eran una lista/catálogo antes de esta corrección**,
no texto libre — `src/data/empresas.ts` (`EMPRESAS`, 19 nombres fijos, y `RUTAS_POR_EMPRESA`, 2-4
rutas por empresa configurada, con opción de agregar una ruta a mano si la empresa no tiene ninguna
cargada). Matrícula sí es distinta: lista de matrículas frecuentes del propio chofer (hasta 8,
`obtenerMatriculasFrecuentes`) con opción de tipear una nueva — la lista no es un catálogo fijo.

**`SelectorBuscable<T>` (2026-09-16)**: selector genérico con buscador integrado (`src/components/
SelectorBuscable.tsx`) — mismo patrón visual de hoja modal deslizable desde abajo que ya tenía
`SelectorDesplegable.tsx`, con un campo de texto fijo arriba de la lista que la filtra en cada tecla
(subcadena, sin distinguir mayúsculas ni acentos — `normalize("NFD")` + quitar diacríticos a los dos
lados de la comparación, sin librería de búsqueda difusa). Sin umbral de "a partir de cuántas
opciones aparece el buscador" — siempre se muestra, es más simple y predecible que un número mágico.
⚠️ **Se extrajo de `SelectorPais.tsx`**, que ya resolvía exactamente este problema pero hardcodeado a
la lista de países de `RegistroScreen` — resultó ser el selector de lista larga "que no sabíamos que
existía" al revisar el código (190+ países). `SelectorPais.tsx` ahora es un wrapper fino sobre
`SelectorBuscable<Pais>` (mismo criterio que ya usaba `SelectorMatricula.tsx` sobre
`SelectorDesplegable`: wrapper de dominio específico sobre un selector genérico), sin cambiar su API
pública — `RegistroScreen.tsx` no se tocó. Conectado además en:

- `CheckInForm.tsx` — el selector de **empresa** (19 opciones). El de **ruta** se queda en
  `SelectorDesplegable` a propósito: sus listas son cortas (2-4 rutas por empresa, "un puñado") y
  además necesita `deshabilitado`/`opcionEspecial` (el link "agregar ruta a mano"), que
  `SelectorBuscable` no replica — no hacía falta para el único caso real que lo usa.
- `SelectorFecha.tsx` — el selector de **año** (`anioActual - 100` a `anioActual - edadMinima`, ~82
  opciones con `edadMinima = 18`, el caso real de registro de choferes) — otro selector de lista
  larga encontrado al revisar el código. Día (31) y mes (12) se quedan en `SelectorDesplegable`, son
  listas cortas de interacción convencional por scroll, no por tipeo.
- Quedan sin migrar, a propósito, fuera de alcance: `LanguageSelector` (2 opciones), el selector de
  tipo de incidencia en `IncidenciasForm.tsx` (4 opciones), `SelectorCombustible.tsx` (barra
  deslizable, no una lista).

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

**Pull-to-refresh también en la pantalla inicial (2026-09-15)**: hasta acá, forzar el reintento de
sincronización (ignorando `MAX_INTENTOS`, punto 3 de arriba) solo era posible desde
`HistorialScreen.tsx` — si una jornada quedaba en `error` y el chofer no entraba a Historial, no
tenía forma de forzarlo desde la pantalla inicial (`CheckInScreen.tsx`). Se replicó ahí el mismo
patrón exacto que ya tenía Historial (confirmado contra ese código antes de tocar nada, no asumido):
`RefreshControl` sobre el contenedor scrolleable, `onRefresh` que llama a `sincronizarAhora(true)`
(de `useNetwork()`, el mismo wrapper de contexto que ya usaba Historial — no `syncService.ts`
directo) y después recarga la lista.

⚠️ **Única diferencia deliberada con el patrón de Historial**: Historial reusa su propio estado
`cargando` como bandera del `RefreshControl` (`refreshing={cargando}`, sin estado separado).
`CheckInScreen` **no** puede hacer lo mismo con el `cargando` de `useJornadasAbiertas()`: esta
pantalla tiene un `if (cargandoViajes) return null` que Historial no tiene — reusar esa bandera
pondría toda la pantalla en blanco en cada pull-to-refresh en vez de mostrar el spinner nativo sobre
el contenido ya visible. Por eso lleva un estado `refrescando` propio, envuelto en `try/finally`
para que el spinner nunca quede pegado. `useJornadasAbiertas()` ya exponía `recargar` (lo usa su
propio `useFocusEffect` internamente) — se reutiliza tal cual, sin duplicar la query. El indicador
de estado por fila que ya tenía `TarjetaJornada.tsx` (pendiente/sincronizando/error/sincronizado,
`jornada.sincronizacion`) se refresca solo, porque `recargar()` vuelve a leer de SQLite — no hizo
falta tocarlo.

**Reconciliación: la app se entera cuando el Dashboard cierra una jornada (2026-09-15)**:
`syncService.ts` hasta acá era exclusivamente de **subida** — nunca existió un camino que bajara el
estado real de Supabase para una jornada que la app ya daba por `sincronizada`. Desde el Hallazgo #6
(un administrador puede cerrar una jornada abierta directo desde "Corregir" en el Dashboard, ver §4),
esa fila quedaba `estado = "abierta"` en el celular del chofer para siempre, aunque en Supabase ya
figurara `"cerrada"` — la ruta seguía viéndose "en curso" sin ninguna forma de que se actualizara
sola.

- `syncService.reconciliarJornadasAbiertas(choferId)` — por cada jornada local `"abierta"` **y**
  `sincronizacion = "sincronizado"` (sin cambios locales pendientes: si tiene algo en
  `pendiente`/`error` se la saltea a propósito, para no arriesgarse a pisar una edición local
  todavía no subida — limitación conocida y aceptada, caso raro), consulta esa fila puntual en
  Supabase (respeta RLS, el chofer solo puede leer las suyas). Si el `estado` remoto ya es
  `"cerrada"`, sobreescribe la fila local completa con los valores remotos.
- `jornadasRepo.sobrescribirCierreRemoto()` — nueva, hace el `UPDATE` en SQLite. ⚠️ A propósito **no**
  reutiliza `registrarCheckOut()` (el check-out normal hecho por el chofer): esa función pone
  `fechaCheckOut = new Date()` (la hora actual del dispositivo — acá hace falta la del cierre real,
  que viene de Supabase) y dejaba `sincronizacion = 'pendiente'` (pondría esta jornada en cola para
  volver a subirse, cuando estos datos ya están en Supabase — son el origen del `UPDATE`, no algo por
  subir). Mismas columnas/tabla que `registrarCheckOut`, con esos dos criterios adaptados. También
  completa `fotoCheckOutUrl`/`fotosIncidencia` (las columnas que `syncService` ya usa como "esto ya
  está subido, no lo reintentes") con la misma URL remota que `fotoTacometroFinalUri`/
  `fotosIncidenciaUris` (las que usa `DetalleJornadaScreen` para _mostrar_ la foto — a
  `<Image source={{uri}}>` le da igual si `uri` es un archivo local o una URL remota).
- **Se descartó Supabase Realtime a propósito** — mismo motivo que el mapa en vivo del Dashboard (ver
  §2): sumar una arquitectura de suscripción distinta para este único caso sería inconsistente con el
  patrón de chequeo periódico que ya usa todo lo demás de sincronización en el proyecto.
- **3 disparadores**, todos convergiendo en la misma implementación (no 3 copias de la lógica):
  1. `NetworkContext.tsx` — nuevo `reconciliarSiCorresponde()`, llamado en el mismo ciclo de 15s que
     ya revisa sincronización pendiente. Si cierra al menos una jornada, expone
     `jornadasReconciliadasEn: Date | null` en el contexto (mismo patrón ya establecido que
     `ultimaSincronizacion`).
  2. `useJornadasAbiertas()` — su `recargar()` ahora llama a `reconciliarJornadasAbiertas()` **antes**
     de leer SQLite, así que su `useFocusEffect` ya existente (dispara al volver a la pantalla de
     Check-In) reconcilia gratis, sin código nuevo en `CheckInScreen.tsx` para este disparador.
  3. El pull-to-refresh de `CheckInScreen.tsx` (punto anterior) ya llama a `recargarViajes()` después
     de sincronizar — como `recargar()` reconcilia internamente, este disparador tampoco necesitó
     tocarse.
- ⚠️ **Por qué hace falta el puente del punto 1 (`jornadasReconciliadasEn`)**: `useSeguimientoGPS`
  (ver §3 arriba) no tiene ninguna API imperativa de "dejar de trackear esta jornada" — es puramente
  reactivo a su prop `jornadaIds`, que viene de `viajesActivos` (el estado de `useJornadasAbiertas()`
  en `CheckInScreen`). Con bottom-tabs, esa pantalla **no se desmonta** al cambiar de pestaña — sigue
  trackeando en segundo plano — así que si el chofer está en Historial cuando un administrador cierra
  su jornada, ni el `useFocusEffect` ni el pull-to-refresh de Check-In van a disparar hasta que vuelva
  ahí. `useJornadasAbiertas()` (que sigue montado igual, sin foco) escucha `jornadasReconciliadasEn` y
  se recarga sola apenas `NetworkContext` avisa que cerró algo — eso actualiza `viajesActivos`, lo que
  a su vez hace que `useSeguimientoGPS` deje de trackear esa jornada, con el mismo mecanismo reactivo
  de siempre (sin ninguna función nueva de "detener tracking").

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

⚠️ **Corrección (2026-09-15) — "Corregir" ahora también puede cerrar una jornada abierta**: hallazgo
del piloto (jornada huérfana de un chofer tras reinstalar el `.apk` — quedó "abierta" sin
check-out). Hasta acá no había forma de cerrar una jornada desde el Dashboard: `estado` es una
columna independiente de `fecha_check_out`, no se derivaba sola — hubo que cerrarla con un `UPDATE`
manual en el SQL Editor, sin quedar auditado. Se extendió el mismo formulario/endpoint (no una
pantalla nueva) con una sección "Datos de cierre", todo opcional:

- **Hora de check-out** — si se completa y la jornada estaba `"abierta"`, el backend cambia `estado`
  a `"cerrada"` como parte del mismo `UPDATE`. Sin lógica de reabrir (no se puede volver a `"abierta"`
  borrando esta fecha). Valida que no sea anterior a `fecha_check_in` de esa jornada (400 sin guardar
  nada si lo es).
- **Latitud/longitud final** — mismo criterio que el check-out sin GPS desde la app (ver
  "Robustecimiento del Check-Out" en §3): opcionales, no todo cierre manual va a tener coordenadas
  exactas.
- **Foto de tacómetro final** e **incidencia** (tipo + detalle + fotos de respaldo) — los mismos
  datos que un check-out normal desde la app, para que un cierre manual pueda quedar tan completo
  como sea posible sin bloquear el cierre si no se tiene todo.

Subida de archivos: el navegador del admin sube a `POST /api/jornadas/editar` (que pasó de JSON a
`multipart/form-data` para poder llevar archivos), y de ahí el propio Route Handler sube a Supabase
Storage con el `service_role` key — nunca directo del navegador a Storage, para no exponer esa clave
al cliente. **Misma convención de rutas que ya usa la app móvil** (confirmada contra
`src/services/storageService.ts` + `syncService.ts` antes de escribir esto, no asumida): bucket
`evidencias`, `{choferId}/{jornadaId}-final.jpg` (tacómetro final) y
`{choferId}/{jornadaId}-incidencia-{índice}.jpg` (fotos de incidencia, siempre **agregadas** al
arreglo `fotos_incidencia` existente — el índice de la primera foto nueva arranca en
`fotos_incidencia.length` para no pisar índices ya usados por el chofer). Límite de 8MB por imagen,
solo `image/jpeg`/`image/png` — sin compresión del lado del Dashboard (la app sí comprime,
`src/services/imageService.ts`, pero no es un requisito duro acá).

⚠️ **Enmienda (2026-09-15, mismo día): 3 ajustes pedidos después de probar la funcionalidad en
producción** (`editar-jornada-dialog.tsx`, `mapa-ubicacion-picker.tsx` nuevo,
`app/api/geocodificar/buscar/route.ts` nuevo):

1. **Selector de ubicación en mapa** reemplaza los dos inputs numéricos de lat/lng final —
   `dashboard/components/jornadas/mapa-ubicacion-picker.tsx`, `MapContainer` propio (Leaflet/OSM,
   sin API key, cargado con `dynamic(..., { ssr: false })` igual que el resto de mapas de este
   Dashboard), con un pin arrastrable/clickeable y un buscador de direcciones. El buscador pega
   contra `GET /api/geocodificar/buscar?q=` (nuevo, **geocodificación directa** — complementa a
   `/api/geocodificar`, que ya hacía la inversa), que a su vez llama a
   `nominatim.openstreetmap.org/search` **del lado del servidor**, mismo motivo que la inversa: la
   política de uso de Nominatim exige identificar la app con `User-Agent` y los navegadores ignoran
   cualquier `User-Agent` custom que JavaScript intente fijar en un `fetch()` del cliente. Sin caché
   en memoria acá (a diferencia de la inversa) — el texto de búsqueda libre es mucho menos probable
   que se repita exacto. Centrado inicial del mapa, en orden de prioridad: `lat_final`/`lng_final` ya
   guardados (con pin precargado) → `lat_inicial`/`lng_inicial` del check-in (sin pin) → Barcelona
   por defecto (donde operan las jornadas reales del piloto — ⚠️ distinto del centro por defecto de
   `MapaFlota`, Ciudad de México, un placeholder de otra tanda de trabajo que no se tocó, fuera de
   alcance de esta spec). `lat_final`/`lng_final` siguen siendo opcionales: si no se toca el mapa, se
   guardan como estaban.
2. **La foto de tacómetro final ya no se puede reemplazar si ya existe una** — corrige lo que decía
   la spec original arriba ("reemplaza la anterior"). Si `foto_tacometro_final_url` ya tiene valor
   (chofer desde la app, o admin en una corrección previa), el input de archivo correspondiente se
   deshabilita en la UI mostrando la foto existente como referencia, **y el backend ignora en
   silencio** cualquier archivo entrante para ese campo si la jornada ya tiene una — defensa en
   profundidad, no solo una restricción visual. Las fotos de incidencia no cambian, se siguen
   agregando sin reemplazar nada.
3. **Formato 24 horas forzado** en la hora de check-out — el `<input type="datetime-local">` que
   tenía antes no lo garantiza (su presentación depende del locale del navegador/SO del admin, puede
   mostrarse con AM/PM). Se reemplazó por `<input type="date">` (el valor de un input de fecha
   siempre es `"YYYY-MM-DD"` sin ambigüedad) + un input de texto propio para la hora, con máscara
   mientras se escribe y patrón `^([01]\d|2[0-3]):[0-5]\d$` — texto plano controlado por el propio
   código, no delegado a un widget del navegador, así que el formato nunca varía por locale. No se
   sumó ninguna librería de date-picker nueva. El contrato del endpoint no cambió: sigue siendo el
   mismo ISO/UTC vía `new Date(...).toISOString()`, ahora construido desde `${fecha}T${hora}` en vez
   de un único valor de `datetime-local`. La guarda de "solo mandar `fechaCheckOut` si el admin lo
   cambió de verdad" (evita truncar en silencio segundos/milisegundos en cualquier corrección que no
   toque el check-out) se adaptó a comparar fecha+hora por separado contra sus valores iniciales, con
   el mismo criterio que antes.

⚠️ **La validación de incidencia replica la regla real de `IncidenciasForm.tsx`, no la que se asumía
al principio**: el tipo de incidencia **nunca es obligatorio** aunque `tuvoIncidencia` sea `true` —
solo el detalle es obligatorio, y únicamente cuando el tipo es `"Otro"`. Confirmado contra
`CheckOutForm.tsx` (`detalleIncidenciaValido = tipo !== "Otro" || detalle.trim().length > 0`) antes
de implementar, no asumido de la spec original.

✅ **Corrección (2026-09-11)**: `editado_por` ya no es texto libre que escribe quien edita — ahora
se deriva de la sesión real (`obtenerAdminSesion()` en `lib/auth.ts`, ver "Auth" arriba), usando el
`nombre` del admin autenticado (o su `email` si no tuviera nombre cargado). El campo "Tu nombre o
correo" se quitó de `editar-jornada-dialog.tsx`; `EditarJornadaRequest` ya no lleva `editadoPor` en
el body. La columna en sí (`jornadas.editado_por text`, `schema_v5_edicion_jornadas.sql`) no cambió
de tipo — sigue siendo texto plano, no una FK a `admins.id` (habría exigido una migración de datos
para las filas ya editadas antes de este cambio; el texto real ahora es siempre confiable porque lo
escribe el servidor, no el formulario).

**Autenticación de `/api/jornadas/editar`**: no repite el chequeo de _si hay_ sesión — igual que el
resto de Route Handlers de este Dashboard (`reportes/exportar`, `tracking/ultimas-posiciones`,
`jornadas`), confía en que `proxy.ts` (middleware) ya protege todo `/api/*` salvo `/api/auth/*`. Sí
lee la cookie para obtener la _identidad_ del admin (vía `obtenerAdminSesion()`, no solo el booleano
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
- `dashboard/app/api/tracking/ruta-jornada-match/route.ts` — ajusta el trazado a calles reales.
  ⚠️ **Corrección (2026-09-13): reemplazo completo de proveedor.** Este documento llegó a acumular
  tres correcciones sucesivas sobre una integración con el **servidor demo público de OSRM**
  (`router.project-osrm.org/match`, cliente en `dashboard/lib/osrm.ts`, ya eliminado): cambio de
  `/route` a `/match` (Map Matching, para dejar de tratar los pings como paradas deliberadas), bajar
  `MAX_PUNTOS_OSRM` de 100 a 10 (límite real y no documentado de esa instancia demo — 11 puntos ya
  respondía `400 TooBig`), filtrar pings duplicados exactos (`quitarPingsDuplicados` — rompían el
  Hidden Markov Model de OSRM con `NoMatch`), y finalmente partir el trayecto en tramos de a 10 con
  solapamiento (`OSRM_MAX_TRAMOS = 15`) para no perder detalle en jornadas largas dado ese límite de
  10 puntos por llamada. Todo ese sistema de tramos **se reemplazó por completo** —no se mantiene
  como alternativa/fallback de proveedor— por **Geoapify Map Matching**
  (`apidocs.geoapify.com/docs/map-matching/`), que acepta hasta **1000 waypoints en una sola
  llamada** (100x el límite de OSRM): no hace falta partir nada para prácticamente ninguna jornada
  real, y con eso desaparece toda la complejidad de partir/llamar en secuencia/unir/manejar fallback
  por tramo.

  Es un cambio de **arquitectura**, no solo de proveedor: la llamada pasa a correr **del lado del
  servidor** (antes `lib/osrm.ts` llamaba a OSRM directo desde el navegador) — mismo motivo que ya
  tenía Nominatim (ver "Geocodificación inversa" más abajo), aunque acá la razón puntual es otra:
  Geoapify exige una API key que no debe quedar expuesta en el cliente. `GEOAPIFY_API_KEY` (env var
  nueva; cuenta gratuita sin tarjeta, 3.000 créditos/día, 1 crédito cada 100 waypoints — para el
  volumen de este sistema el costo esperado es \$0) vive solo en el servidor.

  - Este Route Handler (`GET ?jornadaId=`) trae los pings con la misma consulta que
    `/api/tracking/ruta-jornada` (consulta independiente, no encadena un fetch a esa otra ruta),
    aplica `quitarPingsDuplicados` (criterio sin cambios respecto a como vivía en `osrm.ts`) y un
    muestreo uniforme si superan los 1000 puntos (red de seguridad para una jornada de varias horas
    de tracking continuo — mismo criterio de muestreo que ya existía, solo que ahora rarísima vez
    hace falta), y llama a `POST https://api.geoapify.com/v1/mapmatching?apiKey=...` con
    `{ mode: "drive", waypoints: [{ location: [lng, lat], timestamp: <ISO 8601> }, ...] }`. **Sin
    parámetro de radio/precisión**: a diferencia de `radiuses` en OSRM, la documentación de Geoapify
    no expone ninguno (confirmado contra la documentación real y la API, no asumido) — maneja su
    propia tolerancia de matching internamente. Si `GEOAPIFY_API_KEY` no está configurada, hay menos
    de 2 pings únicos, o la llamada falla, devuelve `{ trazado: <línea recta>, matcheoCompleto:
false }` (mismo shape de siempre) en vez de un error — el fallback vive del lado del servidor
    ahora, con un `console.error` en los **logs de Render**, no en la consola del navegador como
    cuando la llamada era client-side.
  - `dashboard/lib/ruta-matching.ts` (reemplaza a `lib/osrm.ts`): cliente delgado del lado del
    navegador — solo un `fetch` al endpoint de arriba, sin ninguna lógica de armado de
    request/parseo de proveedor (eso vive enteramente en el Route Handler).
  - **Forma real de la respuesta de Geoapify** (confirmada contra la API en vivo, no asumida de la
    documentación): `{ type: "FeatureCollection", features: [{ type: "Feature", properties: {
distance, time, mode, legs, waypoints: [{ location, original_location, match_type:
"matched"|"unmatched"|"interpolated", match_distance, leg_index, step_index }] }, geometry: {
type: "MultiLineString", coordinates: [[[lng,lat], ...], ...] } }] }`. La geometría es un
    `MultiLineString` (array de `LineString`s), no un único `LineString` como en OSRM — se
    concatenan en orden, mismo criterio que ya se usaba con los `matchings` de OSRM.
  - Probado contra la API real (no solo contra la documentación) con la misma ruta simulada de 10.4
    min / 32 pings usada para verificar el sistema de tramos de OSRM: **una sola llamada** (835ms),
    los 32 puntos con `match_type: "matched"`, geometría final de 225 puntos siguiendo calles reales
    — comparable en detalle a los 231 puntos que había dado el sistema de tramos de OSRM con 4
    llamadas secuenciales, pero en una sola llamada y sin nada de esa complejidad. También probado
    con los pings reales (deduplicados) de la jornada que rompía a OSRM con `NoMatch` (gap real de
    29 minutos entre dos pings, ver la corrección de duplicados más arriba en el historial de este
    documento) — Geoapify los matcheó sin problema, `match_type: "matched"` en los 3.

  **Limitación que queda**: jornadas con más de 1000 pings únicos (varias horas de tracking continuo
  ininterrumpido) siguen degradándose con el muestreo uniforme — un caso mucho más raro que el
  límite de 136 que dejaba el sistema de tramos de OSRM, y rarísimo comparado con el límite original
  de 10 puntos totales de la primera integración con OSRM.

- `dashboard/lib/hooks/use-ruta-jornada.ts` — orquesta: pings crudos → pide el ajuste a calles al
  Route Handler de arriba → si esa llamada en sí falla del todo (no el caso de que Geoapify falle,
  eso ya lo resuelve el propio Route Handler devolviendo 200 igual), cae a una línea recta entre los
  pings en vez de no mostrar nada.
- `dashboard/components/mapa/trazado-ruta.tsx` — el dibujo en sí (`Polyline` `#2563eb`, grosor 4,
  opacidad 0.8, + marcadores de inicio/fin + el `fitBounds` que encuadra el trazado la primera vez
  que aparece, vía un `encuadreKey` para no repetirlo si el usuario después hace zoom/paneo a mano).
  Extraído de `ruta-historica.tsx` (2026-09-13) para poder reutilizarlo también en el modal de ruta
  de una jornada puntual (ver más abajo) — debe montarse siempre como hijo de un `<MapContainer>`
  (`useMap()` lo exige).
- `dashboard/components/mapa/ruta-historica.tsx` — ahora es solo el pegamento entre
  `useRutaJornada` y `TrazadoRuta`: pide los datos y, si hay trazado, renderiza `TrazadoRuta` (si
  está cargando, hubo error, o no hay pings, no renderiza nada — igual que antes). **Sin** su propio
  `dynamic(..., { ssr: false })`: ya vive detrás del límite ssr:false que envuelve `MapaFlota`
  completo a nivel de página (`app/(dashboard)/mapa/page.tsx`) — envolverlo de nuevo sería
  redundante.
- La "selección de jornada" **en el mapa en vivo** usa el chofer seleccionado en el panel de activos
  (su `jornadaIds[0]`), no un buscador de jornadas pasadas por rango de fechas — eso sigue fuera de
  alcance. Pero desde `/jornadas` sí se puede ver la ruta de **cualquier** jornada puntual (ver
  subsección siguiente), que es un camino de acceso distinto y no requiere ese buscador.

### Ver ruta de una jornada puntual desde `/jornadas` (2026-09-13)

⚠️ **Corrección**: hasta acá, "Ver ruta" solo existía en `/mapa` (panel de choferes activos), atado
a la jornada _abierta_ actual del chofer seleccionado — no había forma de ver el trazado de una
jornada ya cerrada. Ahora también se puede ver desde el modal de detalle de cualquier jornada en
`/jornadas` (`jornada-detalle-dialog.tsx`), sin importar si está abierta o cerrada, ni de qué fecha
sea — reutiliza el mismo backend que ya existía en ese momento (`ubicaciones_tracking_planas`,
`GET /api/tracking/ruta-jornada`, `useRutaJornada`, `osrm.ts`), sin tocar ninguno de los tres. (El
ajuste a calles migró de `osrm.ts` a Geoapify Map Matching poco después, ver "Trazado histórico de
rutas" más arriba — esta función en sí no se vio afectada por esa migración, solo el mecanismo
interno con el que `useRutaJornada` obtiene el trazado.)

- Botón **"Ver ruta"** en `jornada-detalle-dialog.tsx`, siempre visible, cerca de la sección
  `Ubicacion` (Check-In/Check-Out). Abre un modal nuevo y más grande (`className="max-w-4xl"`, no el
  modal de detalle, que ya está ocupado con fotos/ubicaciones) — el detalle queda abierto detrás,
  para no perder el contexto de qué jornada se estaba viendo.
- `dashboard/components/mapa/ruta-jornada-dialog.tsx` — el modal en sí (`Dialog` propio del
  proyecto). Llama a `useRutaJornada(jornadaId)` y decide qué mostrar: spinner mientras carga,
  mensaje de error si falla, **"No hay datos de ubicación registrados para esta jornada"** si
  `puntos.length === 0` (en vez de un mapa vacío o un error), o el mapa con el trazado si hay datos.
- `dashboard/components/mapa/mapa-ruta-jornada.tsx` — `MapContainer` de Leaflet **propio y
  aislado** de este modal (no el de `MapaFlota`, que trae marcadores de otros choferes y no aplica
  acá), cargado vía `dynamic(..., { ssr: false })` desde `ruta-jornada-dialog.tsx` — mismo patrón que
  `MapaFlota` en `app/(dashboard)/mapa/page.tsx`. Recibe `trazado`/`puntos` ya resueltos como props
  (no vuelve a pedir los datos) y los dibuja con `TrazadoRuta`.
- **Sin polling**: a diferencia del mapa en vivo (`useUltimasPosiciones`, `refetchInterval: 8000`),
  `useRutaJornada` nunca tuvo `refetchInterval` — los pings de una jornada ya cerrada (o incluso
  abierta, en el momento de abrir este modal) no van a cambiar mientras el modal está abierto, así
  que alcanza con la única carga inicial que ya hacía este hook (`staleTime: 60_000`). No hizo falta
  ningún cambio en `use-ruta-jornada.ts` para esta función.

**Geocodificación inversa (2026-09-10)**: en el modal de detalle de jornada (`jornada-detalle-dialog.tsx`,
componente `Ubicacion`), cada coordenada de check-in/check-out muestra un enlace "Ver en mapa"
(mismo formato Google Maps URLs API que ya usa el Excel) **más** la dirección legible.

- `dashboard/app/api/geocodificar/route.ts` — `GET ?lat=&lng=` contra la **API pública de
  Nominatim** (`nominatim.openstreetmap.org/reverse`). Esta llamada **corre exclusivamente del lado
  del servidor** — no es una preferencia de diseño, es una restricción real: la política de uso de
  Nominatim exige identificar la app con un `User-Agent` válido, y los navegadores ignoran
  silenciosamente cualquier `User-Agent` custom que JavaScript intente fijar en un `fetch()` del lado
  del cliente. (El trazado de rutas, en `ruta-jornada-match/route.ts`, corre server-side por otro
  motivo — Geoapify exige una API key que no debe exponerse al cliente, ver "Trazado histórico de
  rutas" más arriba.)
  Solo un Route Handler puede cumplir ese requisito (acá: `"app-transp-dashboard (it@day2day.es)"`).
  Cache en memoria del propio proceso (clave = lat/lng redondeados a 4 decimales, sin expiración —
  una dirección no cambia), sin sumar Redis ni nada externo; se pierde al reiniciar el proceso,
  aceptable para el volumen de una herramienta interna. Timeout de 8s vía `AbortSignal.timeout()`;
  cualquier fallo (timeout, red, JSON inválido) devuelve `{ direccion: null }` en vez de un error —
  el Dashboard nunca se bloquea esperando una dirección, en el peor caso solo muestra el enlace al
  mapa sin el texto.
- `dashboard/lib/hooks/use-direccion.ts` — hook TanStack Query que llama a `/api/geocodificar`
  (nunca a Nominatim directo), `staleTime` de 1h.
- El entonces `dashboard/lib/osrm.ts` también recibió `AbortSignal.timeout(8000)` en esta misma
  tanda de trabajo — antes no tenía timeout, así que un servidor demo colgado (no caído, colgado)
  dejaba la query de TanStack Query esperando para siempre en vez de caer al fallback de línea recta.
  Ese archivo ya no existe (ver "Trazado histórico de rutas" más arriba — se migró a Geoapify), pero
  el mismo timeout de 8s se mantuvo en `ruta-jornada-match/route.ts` por el mismo motivo.

Todas las rutas `/api/*` usan `lib/supabase/server.ts` (cliente con el `service_role` key, marcado
`server-only` — el build falla si se importa por error desde código de cliente). `lib/supabase/client.ts`
(con el `anon` key) existe pero no se usa todavía — quedaría preparado para un futuro login de
chofer si se decide agregar uno.

**Dashboard usable desde navegador móvil (2026-09-16)**: el Dashboard se diseñó pensando en
escritorio, sin encuadre pensado para pantalla chica — se pidió mejorarlo sin tocar funcionalidad.
Mobile-first con los breakpoints que Tailwind v4 ya trae, sin sumar ninguna librería de detección de
dispositivo. **El corte entre "layout mobile" (pila vertical/tarjetas/pantalla completa) y "layout de
escritorio" (barra lateral/tabla/modal centrado) es `lg` (1024px) en todos lados — no `md` (768px)**:
la primera versión usó `md`, y al probarla en un teléfono real en horizontal (la mayoría ronda
800-930px de ancho) mostraba el layout de escritorio completo dentro de una pantalla angosta en alto
(ver "Ajuste — breakpoint a `lg`" más abajo). Los ajustes de fuente (16px) y área de toque (44px) de
más abajo son aparte y siguen en `md` — no están atados a esta decisión de layout.

Confirmado contra el código real antes de tocar nada — varias partes ya venían resueltas desde el
diseño original, contra lo que suponía la spec:

- **`/mapa`**: `app/(dashboard)/mapa/page.tsx` ya apilaba panel+mapa en mobile (`flex-col`/`order-1`/
  `order-2`) y `app/(dashboard)/layout.tsx` ya tenía un header con nav horizontal scrolleable para
  mobile (`SidebarNav horizontal`, solo 2 enlaces — no hizo falta un menú hamburguesa). Lo que sí
  faltaba: toda la cadena de alto dependía de `min-h-screen` (`vh`) en la raíz del layout — con la
  barra de direcciones de un navegador móvil mostrándose/ocultándose, el mapa saltaba de tamaño. Se
  cambió `min-h-screen` → `min-h-dvh` en `app/(dashboard)/layout.tsx` (y de paso en `app/login/page.tsx`,
  mismo problema) y `min-h-[50vh]` → `min-h-[50dvh]` en `mapa/page.tsx` — sin inventar ningún cálculo
  nuevo restando header/panel a mano, porque el `flex-1` que ya usa esta cadena de layout ya se encarga
  de eso; solo hacía falta que la unidad de la que parte no saltara.
- **`/jornadas`**: el componente real es `components/jornadas/tabla-jornadas.tsx` (`TablaJornadas`),
  con 9 columnas y `min-w-[860px]` (scroll horizontal en mobile). Se agregó una vista de tarjetas
  (`lg:hidden`, tabla pasa a `hidden lg:block`) alimentada por el mismo array de jornadas ya cargado —
  cada tarjeta muestra chofer/empresa+matrícula/ruta/estado/check-in/check-out/badges de
  incidencia/editado y abre el mismo `JornadaDetalleDialog` que hoy abre una fila. Los filtros
  (`filtros-jornadas.tsx`) ya usaban `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` — un grid propio
  sin relación con el corte layout mobile/desktop, no se tocó.
- **Los 3 modales** (`jornada-detalle-dialog`, `editar-jornada-dialog`, `mapa-ubicacion-picker`):
  `components/ui/dialog.tsx` es el único componente `Dialog` base (sin Radix), ya centrado con
  `max-w-2xl` por defecto y ya con un botón "X" visible en todos los tamaños — no hizo falta agregarlo,
  solo agrandar su área de toque (`p-1` → `p-3.5` en mobile, sin cambios en desktop). Pasa a ocupar
  pantalla completa por debajo de `lg` (`h-full w-full rounded-none border-0`) y vuelve al
  tamaño/centrado de siempre desde `lg:` (`lg:h-auto lg:max-h-[90dvh] lg:rounded-lg lg:border`); el
  `max-w-*` que cada modal pasa por `className` (`max-w-lg`, `max-w-md`, `max-w-4xl`) sigue
  gobernando el ancho en desktop sin tocarlo. El botón de cerrar comparte el mismo corte `lg` que el
  panel (no `md`, a propósito): mientras el modal esté a pantalla completa, el botón se queda grande.
  Como los 3 (y también `exportar-reporte-dialog` y `ruta-jornada-dialog`, no nombrados en la spec
  pero que comparten el mismo `Dialog`) se beneficiaron parejo. Dentro de `editar-jornada-dialog`,
  `mapa-ubicacion-picker.tsx` ya tenía un alto fijo en píxeles (`h-56`, no `0px` ni dependiente de un
  contenedor colapsado) — no hacía falta ningún cambio ahí.
- **Login, header, inputs**: `app/login/page.tsx` ya tenía ancho fluido (`w-full max-w-sm` + `px-4`) —
  no hacía falta tocarlo más que el `dvh` de arriba. `Input`/`Select` (`components/ui/`) y los dos
  `<textarea>` propios de `editar-jornada-dialog.tsx` estaban en `text-sm` (14px) — dispara zoom
  automático al enfocar en Safari/iOS; se cambió a `text-base md:text-sm` (16px en mobile, 14px sin
  cambios desde `md`). El componente `Button` compartido (`h-9`/`h-8`/ícono `h-9 w-9`) quedaba por
  debajo de 44×44px de área de toque; se cambió a `h-11`/ícono `h-11 w-11` en mobile, `md:h-9`/`md:h-8`
  sin cambios desde `md` — cubre de una sola vez exportar, corregir, cancelar/guardar, cerrar sesión y
  alternar tema, todos usan este mismo componente. El toggle "Ver ruta" del panel de choferes
  (`panel-choferes.tsx`, texto+ícono propio, no usa `Button`) se ajustó aparte (`py-3.5 md:py-1.5`).
  Estos 4 (`Input`/`Select`/`textarea`/`Button`/toggle "Ver ruta") se quedaron deliberadamente en `md`,
  no en `lg` — son correcciones de fuente/toque, no del layout mobile/desktop, y no forman parte del
  ajuste de breakpoint de abajo. Quedaron deliberadamente sin tocar por su tamaño (sería visualmente
  absurdo agrandarlos): el botón "quitar foto" superpuesto sobre una miniatura de 56×56px en
  `editar-jornada-dialog.tsx`, y los resultados de búsqueda de dirección en `mapa-ubicacion-picker.tsx`.

**Ajuste — breakpoint a `lg` y altura del panel de choferes (mismo día, tras probar en un teléfono
real)**: la primera versión de arriba usaba `md` (768px) como el corte layout mobile/desktop en
`layout.tsx`, `mapa/page.tsx`, `tabla-jornadas.tsx` y `dialog.tsx` — al probarla en un teléfono real,
rotarlo a horizontal (ancho >768px en la mayoría de los modelos) hacía aparecer el layout de
escritorio completo (barra lateral, tabla de 9 columnas, modal centrado) dentro de una pantalla
angosta en alto. Se subieron los 4 archivos de `md:` a `lg:` (1024px, por encima del ancho horizontal
de cualquier teléfono actual sin afectar tablets/laptops) — los ajustes de fuente/toque de arriba
(`Input`/`Select`/`textarea`/`Button`/toggle "Ver ruta") se dejaron en `md` a propósito, no están
atados a esta decisión de layout.

Segundo problema real encontrado en la misma prueba: en `/mapa` en vertical, con pocos choferes
activos, el panel de choferes dejaba un hueco vacío debajo de la lista. La causa real (distinta de lo
que sospechaba la spec — no era un `min-h-[50dvh]` en el panel, ese piso lo tiene el MAPA, no el
panel) era que `aside` en `mapa/page.tsx` tenía `h-64` fijo (256px) en mobile, independiente de
cuántos choferes hubiera. Se cambió a `max-h-[40dvh]` (techo, no piso) sin `h-*` fijo: con pocos
choferes, el panel se achica a su contenido real (sin hueco) porque en ese caso el `h-full` interno de
`PanelChoferes` no tiene un alto porcentual contra el que resolver y el navegador lo trata como
`auto`; con una lista larga, `aside` queda clampeado a `max-h-[40dvh]` (ahí sí un alto definido), y
recién en ese punto el `flex-1 overflow-y-auto` que ya tenía `PanelChoferes` internamente empieza a
scrollear solo la lista, sin arrastrar el header "Choferes activos" fuera de vista. El mapa mantiene
su propio piso `min-h-[50dvh]` sin cambios — Ajuste 1 y 2 conviven porque son independientes (uno es
el breakpoint del layout, el otro la altura del panel dentro del layout mobile ya elegido).

Verificación: `tsc --noEmit`/`lint`/`format:check` limpios en `dashboard/` (el único warning de
Prettier es en `CLAUDE.md`, preexistente, no tocado en esta tanda). El servidor de desarrollo (Next
16 + Turbopack) levanta sin errores y las 3 rutas responden (`/login` 200, `/mapa` y `/jornadas` 307
sin cookie de sesión — esperado). **Pendiente**: no se pudo abrir Chrome DevTools en modo dispositivo
ni probar en un teléfono real dentro de este entorno (sin navegador disponible) — queda para que el
usuario confirme, ahora explícitamente en horizontal además de vertical, en `/mapa` y `/jornadas`, y
que el panel de choferes no deje hueco vacío con pocos choferes ni rompa el layout con una lista
larga.

**Regresión: el mapa dejó de verse en `/mapa` (2026-09-17) — causa real, medida (no inferida)**: al
desplegar en Render, `/mapa` quedó en blanco. Un primer diagnóstico (sin poder abrir DevTools en
este entorno, solo leyendo la cadena de CSS) apuntó a `main` no siendo un contenedor flex y cambió
`main`/`mapa/page.tsx` de `h-full` a una cadena `flex-1` continua — **ese diagnóstico era
incorrecto**. La causa real se confirmó recién cuando se midió la página real ya desplegada con el
navegador conectado a la sesión (no en este entorno):

- **El elemento que colapsaba no era ningún ancestro — era el propio `.leaflet-container`**, el
  `<div>` donde Leaflet dibuja el mapa, dentro de `MapaFlota` (`components/mapa/mapa-flota.tsx`).
  Medido en la rama móvil: el wrapper (`mapa/page.tsx`, `relative ... min-h-[50dvh] flex-1`) medía
  **295px** (correcto — 50dvh), pero el `MapContainer` con `className="h-full w-full"` medía
  **0px** de alto. Un `height: 100%` necesita que su padre tenga un alto CSS "definido"; el alto que
  Flexbox le da al wrapper vía `flex: 1 1 0%` + `min-height` no cuenta como "definido" para que UN
  HIJO resuelva un `%` contra él — el `100%` del mapa resolvía a `auto`, y sin ningún otro alto que
  lo sostuviera, colapsaba a 0. Explica también por qué andaba en escritorio: ahí la raíz de la
  página es `lg:flex-row`, así que el wrapper es un ítem en una FILA y su alto sale del estiramiento
  en el eje cruzado (`align-items: stretch`, que sí es definido) — en mobile la raíz es `flex-col`,
  el alto del wrapper sale de `flex-grow` en el eje PRINCIPAL, y ahí deja de serlo. Y por qué se veía
  el hueco oscuro vacío bajo el panel de choferes en las capturas: el wrapper (295px) SÍ ocupaba su
  espacio; lo que faltaba era el mapa DENTRO de él, recortado por el `overflow: hidden` que Leaflet
  aplica a su propio contenedor.
- **Por qué los intentos anteriores (arreglar `main`, cambiar `h-full`→`flex-1` en la raíz de la
  página, el `ResizeObserver`) no lo arreglaron**: los tres trabajaron sobre los ANCESTROS del mapa.
  El `h-full` que realmente rompía estaba un nivel más abajo, en el propio `.leaflet-container`, que
  ninguno de esos cambios tocó — no aparecía descrito en ningún resumen anterior porque nunca se
  había medido, solo inferido.
- **Fix (verificado en vivo, 0px → 295px)**: `mapa-flota.tsx` — el `MapContainer` pasa de
  `className="h-full w-full"` a `className="absolute inset-0"`. El wrapper ya es `relative`, así que
  esto le da al contenedor de Leaflet una caja definida por posicionamiento, sin depender de cómo
  Flexbox resuelve alturas — patrón habitual para Leaflet, más robusto que perseguir la cadena de
  ancestros. **Ningún ancestro se tocó de vuelta** (`main`, la raíz de la página, `min-h-[50dvh]`,
  `min-h-[600px]`, `dvh`, el corte en `lg` quedaron como estaban del intento anterior — ese cambio
  era inocuo, solo insuficiente).
- **Los otros 2 mapas Leaflet de este Dashboard se revisaron con el mismo criterio y NO tenían el
  patrón** — no se tocaron: `mapa-ubicacion-picker.tsx` (modal "Corregir") cuelga de un padre con
  `h-56` (píxeles fijos, un alto genuinamente definido, no derivado de Flexbox); `mapa-ruta-jornada.tsx`
  (modal "Ver ruta" desde `/jornadas`) cuelga de un padre con `h-[70vh]` (unidad de viewport, también
  definida, no un porcentaje). El `ResizeObserver`/`invalidateSize()` agregado en el intento anterior
  (`components/mapa/invalidar-al-redimensionar.tsx`, en los 3 mapas) no se revirtió — sigue siendo
  correcto para el caso de rotación, y ahora que el contenedor tiene alto real es cuando de verdad
  hace efecto.
- **Nota de método**: los primeros tres intentos de arreglar esto fallaron por diagnosticar leyendo
  código sin poder observar la página real — un razonamiento de CSS internamente consistente (la
  cadena `main`→`flex-1` SÍ era ambigua, y arreglarla no era incorrecto) puede apuntar al eslabón
  equivocado de una cadena larga cuando hay varios candidatos plausibles. **Patrón a respetar de acá
  en más: el contenedor de un `MapContainer` de Leaflet nunca debe depender de `h-full` si su padre
  inmediato saca el alto de Flexbox** (`flex-1`/`flex-grow`, sin una `height` propia) — usar
  `absolute inset-0` contra un padre `relative`, o confirmar que el padre tenga un alto realmente
  fijo/en unidades de viewport antes de usar `h-full` sobre él.

Filtros de `/jornadas`: confirmado contra `filtros-jornadas.tsx` — la causa real del solapamiento
era la sospechada por la spec: la grilla mobile era `grid-cols-2`, y con 6 controles (Empresa,
Chofer, Estado, Desde, Hasta, Limpiar) "Hasta" y "Limpiar" caían en la misma fila; un
`<input type="date">` nativo tiene un ancho mínimo intrínseco y los hijos de grid tienen
`min-width: auto` por defecto, así que el input no se achicaba y se montaba sobre "Limpiar". Se
rediseñó a `grid-cols-1` (cada control en su propia fila) con `lg:grid-cols-6` (la disposición de
escritorio no cambia — el grupo de fechas pasa a ocupar 2 de las 6 columnas, mismo espacio que antes
ocupaban las dos columnas sueltas Desde/Hasta), `min-w-0` en los contenedores de los inputs de
fecha, y Desde/Hasta agrupados bajo una sola etiqueta visual "Rango de fechas" (cada input mantiene
su propio `aria-label` — "Desde"/"Hasta" — para no perder la asociación accesible que tenían las
etiquetas individuales de antes). Se agregaron 3 atajos (Hoy / Últimos 7 días / Este mes, con el
`Button` compartido — ya cumplen 44px de alto en mobile sin nada extra) que solo completan "desde"/
"hasta" y disparan el mismo `onChange` que cargarlos a mano; las fechas se calculan con los getters
LOCALES de `Date` (mismo patrón que `isoAFechaLocal`/`isoAHoraLocal` en `editar-jornada-dialog.tsx`)
— a propósito **no** se reusaron `todayIsoDate()`/`daysAgoIsoDate()` de `lib/utils.ts` (las que ya
usa `exportar-reporte-dialog.tsx`) porque esas calculan con `toISOString()` (UTC): cerca de
medianoche, según la zona horaria del admin, pueden devolver el día siguiente o anterior al real —
un bug preexistente en esos helpers, fuera de alcance de esta spec, que no se tocó.

Verificación: `tsc --noEmit`/`lint`/`format:check` limpios en `dashboard/`. El servidor de desarrollo
sigue respondiendo sin error 500 tras todos estos cambios (recompiló en caliente). **Pendiente, sin
poder verificar en este entorno**: no se pudo confirmar visualmente que el mapa vuelva a verse (con
tiles y marcadores) en escritorio/mobile vertical/mobile horizontal, ni rotar un teléfono con el
mapa ya abierto, ni revisar la consola del navegador en busca de errores nuevos (en particular por
el `ResizeObserver` agregado) — quedan para que el usuario los confirme.

**Hallazgo #12 — en `/mapa`, mapa y panel de choferes no entran juntos en un teléfono (2026-09-17)**:
con el mapa ya andando en mobile (Hallazgo #11), quedó a la vista el problema de fondo — repartir el
alto entre mapa (piso `min-h-[50dvh]`) y panel (techo `max-h-[40dvh]`) deja a los dos incómodos; la
lista de choferes, medida sobre la página real, ocupaba ~569px contra los ~300px que le daba el
`max-h-[40dvh]` en un teléfono de ~750px de alto — entraba poco más de la mitad, con scroll interno
dentro de una caja chica. Fix: **selector "Mapa/Lista" por debajo de `lg`** — `app/(dashboard)/
mapa/page.tsx` agrega un estado local `vistaMobile: "mapa" | "lista"` (default `"mapa"`, sin
persistencia ni parámetro de URL) y dos botones (`Button` compartido, `aria-pressed`) arriba del
contenido; por debajo de `lg` se muestra un panel u otro a pantalla completa (nunca repartidos),
desde `lg` no cambia nada (mapa y panel lado a lado, como siempre — el nuevo estado ni se usa ahí).

- **El mapa queda MONTADO todo el tiempo, solo oculto** (`hidden`/`display:none` vía clases
  condicionales, nunca desmontado condicionalmente en React) — desmontarlo perdería la instancia de
  Leaflet (zoom/centro) y volvería a pedir tiles cada vez; el polling de 8s sigue corriendo esté o no
  visible (no depende del layout). Mientras oculto, su contenedor mide 0 — al mostrarse de nuevo,
  `MapaFlota` recibe una prop `vistaActiva` y un nuevo componente interno `RecalcularAlMostrar`
  (mismo patrón `useMap()` que el resto) llama `map.invalidateSize()` explícitamente en un efecto
  disparado por esa prop, **sin esperar a que alcance por sí solo** el `ResizeObserver` de
  `invalidar-al-redimensionar.tsx` (agregado en el Hallazgo #11) — los dos mecanismos conviven: el
  observer cubre redimensionados continuos (rotar el teléfono), el explícito cubre puntualmente esta
  transición de mostrar/ocultar. No se pudo confirmar en este entorno si el observer solo ya
  alcanzaba para este caso — se agregó el explícito directamente como refuerzo, tal como permitía la
  spec.
- **Interacciones del panel con efecto visible en el mapa, confirmadas contra el código real antes
  de escribir nada** (`ControladorVista` en `mapa-flota.tsx`): seleccionar un chofer dispara
  `map.flyTo(...)`, y "Ver ruta" activa `<RutaHistorica>` (dibuja el trazado). Las dos cambian
  automáticamente a la vista de mapa (`mapa/page.tsx` decide esto al envolver
  `onSeleccionar`/`onToggleRuta`, `PanelChoferes` no cambió). "Ocultar ruta" (la misma acción,
  desactivando) no cambia de vista — no hay nada nuevo que mostrar ahí.
- **El panel de choferes tenía el mismo riesgo que el mapa, corregido de entrada, no después de una
  regresión**: al reemplazar `max-h-[40dvh]` por `max-lg:flex-1` (para que la vista activa llene el
  alto disponible), el `h-full` interno de `PanelChoferes` habría quedado colgando de un alto
  resuelto por `flex-grow` — exactamente el patrón que causó el Hallazgo #11 en el mapa. Se aplicó el
  mismo fix de entrada: `aside` es `relative` y envuelve a `PanelChoferes` en un
  `<div className="max-lg:absolute max-lg:inset-0">` — apoya el alto en el valor YA renderizado, no
  en resolución por porcentaje. Desde `lg`, `aside` sigue siendo un bloque normal sin este wrapper
  especial — ese `h-full` ya estaba confirmado definido ahí (estiramiento de eje cruzado en la fila).

Verificación: `tsc --noEmit`/`lint`/`format:check` limpios en `dashboard/`. **Pendiente, sin poder
verificar en este entorno**: confirmar en un teléfono real que la Lista se ve completa sin scroll
anidado, que cambiar Lista→Mapa→Lista varias veces no deja el mapa en gris ni pierde el zoom/centro,
que "Ver ruta" desde la Lista lleva al mapa con la ruta dibujada, y que en escritorio `/mapa` se ve
exactamente igual que antes (sin el switch).

**Hallazgo #13 — en `/mapa` móvil, la página scrolleaba y el mapa atrapaba el gesto (2026-09-17,
causa medida)**: en el teléfono en horizontal, scrollear hacia abajo dejaba el mapa cubriendo toda
la pantalla, sin forma de volver arriba — cualquier arrastre sobre el mapa lo captura Leaflet para
paneo, así que no quedaba ninguna zona desde la que scrollear la página de vuelta; la única salida
era rotar a vertical. **Criterio general, ya aplicado en el fix**: en móvil, `/mapa` es una pantalla
de alto fijo que no scrollea — un mapa a pantalla completa dentro de una página scrolleable es una
trampa (mismo tipo de problema, en el otro sentido, que el `h-full` sobre un padre flex del Hallazgo
#11: obvio una vez visto en el dispositivo, invisible leyendo código).

- **Causa (medida sobre la página desplegada, no inferida)**: la raíz de `app/(dashboard)/
  mapa/page.tsx` tenía `min-h-[600px]` **sin condicionar a ningún breakpoint** — un piso pensado
  para que el mapa no quedara aplastado en una ventana de escritorio alta. Sumado al header y al
  selector Mapa/Lista (~122px), el contenido total medía 722px contra un viewport de apenas 549px en
  vertical (peor en horizontal, ~390px) — la página desbordaba y scrolleaba.
- **Fix**: `min-h-[600px]` pasa a `lg:min-h-[600px]` (mismo archivo, mismo elemento — no hacía falta
  tocar ningún otro lugar de la cadena; no había otro piso parecido en `layout.tsx` ni en
  `mapa-flota.tsx`). Además, `min-h-0` explícito en la raíz de la página y en el contenedor
  mapa+panel (`flex min-h-0 flex-1 flex-col lg:flex-row`) y en los dos wrappers (mapa y `aside`) —
  no estrictamente necesario en este caso puntual (el contenido de ambos ya es 0 porque tanto
  `MapContainer` como `PanelChoferes` cuelgan de un wrapper `absolute inset-0`/`max-lg:absolute
  max-lg:inset-0`, fuera del flujo normal, así que no aportan una altura mínima de contenido que
  compita), pero se agregó igual como refuerzo explícito contra el `min-height: auto` por defecto de
  un ítem flex — sin eso, cualquier contenido en flujo normal que se agregue después en esa cadena
  volvería a poder forzar el mismo desborde.
- **La vista Lista comparte la misma raíz** (`min-h-[600px]` estaba en el contenedor común a las dos
  vistas, no en uno específico), así que el mismo fix la cubre — no hizo falta ningún cambio aparte
  para que la Lista tampoco scrollee de página.
- **Nada de lo del Hallazgo #11 (`absolute inset-0` del `MapContainer`) ni del #12 (`max-lg:absolute
  max-lg:inset-0` del panel, el switch Mapa/Lista) se tocó** — esta spec cambió el alto disponible
  de la cadena, no cómo cada panel lo ocupa dentro de ese alto.
- **Nota para más adelante, no resuelta acá**: con la página ya sin scroll, en horizontal el mapa
  queda con poco alto real (viewport de ~390px menos header y selector, ~270px para el mapa) — usable
  pero justo; si en el teléfono real se ve demasiado apretado, evaluar compactar el header o el
  selector en horizontal en una spec aparte, después de verlo, no antes.

**Hallazgo #14 — en `/mapa` horizontal, header + nav + selector se comían casi la mitad de la
pantalla (2026-09-17)**: confirmado lo que el Hallazgo #13 dejó anotado para después — medido en el
dispositivo, header (69px) + nav (53px) + selector Mapa/Lista (61px) sumaban 183px de un viewport de
~390px, sin alto usable para el mapa o la lista. **Presupuesto de alto para esta pantalla, a
respetar de acá en más si alguien agrega otra barra**: en teléfono horizontal (`landscape:max-lg:`),
las barras de arriba no deberían superar ~100-110px en conjunto — cualquier barra nueva tiene que
salir de ese total, no sumarse aparte.

- **El piso de 44px de área de toque (Hallazgo #11) es matemáticamente incompatible con 3 filas
  separadas dentro de ~100px**: 3 filas, cada una con un control de 44px, no pueden sumar menos de
  132px aunque el padding baje a 0. Compactar el padding de las dos filas por separado (opción 1 de
  la spec) no alcanzaba — hubo que **fusionar la nav ("Mapa en vivo"/"Jornadas") con el selector
  ("Mapa"/"Lista") en una sola fila**, quedando 2 filas en vez de 3.
- **La nav vive en `app/(dashboard)/layout.tsx` y el selector en `app/(dashboard)/mapa/page.tsx`**
  — ramas distintas del árbol, compartidas además por `/jornadas` (que no tiene selector con el que
  fusionarse). Se resolvió con un **portal** (la alternativa más liviana de las 3 que la spec
  autorizaba — estado levantado, contexto, o portal): `layout.tsx` siempre renderiza un
  `<div id="selector-movil-horizontal" className="contents" />` vacío dentro de la fila de nav (no
  necesita saber en qué ruta está — en `/jornadas` ese slot simplemente no recibe nada). `mapa/
  page.tsx` resuelve ese nodo con `useSyncExternalStore` (mismo patrón que `ThemeToggle` ya usa para
  leer algo que solo se conoce en el cliente, sin el `setState` síncrono dentro de un efecto que
  bloquea el lint de este repo) y hace `createPortal` de sus botones "Mapa"/"Lista" ahí — **solo**
  visibles en `landscape:max-lg:` (`hidden landscape:max-lg:flex`); la fila original del selector,
  dentro de `mapa/page.tsx`, se esconde en esa misma condición (`landscape:max-lg:hidden`) y sigue
  igual que siempre en vertical y escritorio. Los botones son literalmente el mismo JSX (una
  constante `botonesSelectorVista`) reusado en las dos ubicaciones — mismo estado, sin
  desincronización posible.
- **La fusión también reveló que los pills de `SidebarNav` (`px-3 py-2`, ~36px) ya estaban por
  debajo del piso de 44px** — no lo tocó ninguna spec anterior porque no estaban en su alcance. Al
  compactar justo esta fila, se corrigió de una vez con `landscape:max-lg:h-11` en el pill (alto
  explícito, no más padding — el padding se comparte con el sidebar vertical de escritorio, que no
  se tocó). Se quitó también el `w-full` que tenía `SidebarNav` en modo horizontal (ocupaba todo el
  ancho de la fila y no dejaba espacio para el selector fusionado al lado).
- **Compactado, sin fusionar**: el header (`landscape:max-lg:py-1`, con el texto "app-transp" oculto
  en esa misma condición) y el padding de la fila de nav (`landscape:max-lg:py-1`).
- **Alturas finales, en teléfono horizontal**: header ≈ 44-52px (según si el ancho del dispositivo
  ya cruzó `md` y el `Button` compartido pasó a su tamaño de escritorio) + fila nav/selector
  fusionada ≈ 52px → **~96-104px de barras en total** (antes 183px), dejando **~286-294px para el
  mapa o la lista** — dentro del objetivo de "~100px de barras, ~290px de contenido" que pedía la
  spec.
- **`/jornadas` en horizontal**: comparte el mismo header y la misma fila de nav (ahora compactos),
  pero sin nada que fusionar — queda en sus 2 filas de siempre (header + nav, ~96-104px en total),
  sin ningún cambio de código propio de esa pantalla.
- **No se tocó** el `absolute inset-0` del `MapContainer` (#11), el `max-lg:absolute max-lg:inset-0`
  del panel de choferes (#12), ni el `lg:min-h-[600px]` (#13).

**Hallazgo #15 — en horizontal, los controles pasan a una columna a la derecha, no arriba
(2026-09-18)**: compactar las barras (#14) no alcanzó — probado en el teléfono, el mapa seguía sin
alto cómodo. **Criterio general, para la próxima pantalla que alguien adapte a horizontal**: en un
teléfono acostado el alto es el recurso escaso (~390px) y el ancho sobra (~850px) — los controles
van al costado en una columna vertical, no arriba en barras horizontales, que es exactamente el
recurso que falta.

- **Sí alcanzó con reorientar el contenedor de la nav** (la plomería del portal del Hallazgo #14 no
  cambió) — pero **también hizo falta mover el header ahí**: sus controles (alternar tema, cerrar
  sesión) no tenían ningún contenedor reutilizable para reorientar, así que
  `app/(dashboard)/layout.tsx` pasó de 3 hijos (`header`, fila de nav, `main`) a una estructura con
  un wrapper nuevo agrupando `header`+fila de nav+`main`, hermano de una **columna nueva**
  (`landscape:max-lg:flex landscape:max-lg:w-32`, con `landscape:max-lg:order-2` mientras el wrapper
  es `landscape:max-lg:order-1`). ⚠️ **El wrapper EN SÍ no se oculta nunca** — solo cambia de orden
  (`order-1`) y sigue mostrando a `main`/`{children}` siempre. Lo que se oculta en horizontal son
  **`header` y la fila de nav, cada uno con su propio `landscape:max-lg:hidden` individual** (no uno
  compartido en el wrapper) — `main` no lleva esa clase en ningún lado, por diseño: si el wrapper
  entero se ocultara, el contenido (mapa/lista/tabla) desaparecería al rotar, que es exactamente el
  bug que había que evitar. `header`/`main` no se movieron DENTRO de la columna (`<main>` es un
  elemento semántico, no debe contener nav/controles). El único mecanismo nuevo fue ese wrapper de
  agrupación — nada de estado levantado ni contexto.
- **Qué contiene la columna, de arriba abajo**: `<SidebarNav horizontal />` (segunda instancia del
  mismo componente — la primera, dentro de la fila de nav ahora oculta en horizontal, deja de
  importar en esa condición; no hizo falta un tercer modo/prop, el componente ya sabía reorientarse
  solo con clases `landscape:max-lg:`), el
  slot `#selector-movil-horizontal` (el mismo del Hallazgo #14, reubicado acá — sigue siendo un solo
  slot con `id` único, `mapa/page.tsx` no cambió cómo lo busca), `ThemeToggle`, `LogoutButton` —
  estos dos también se duplican (segunda instancia cada uno) en vez de portalizarse, mismo criterio
  que `SidebarNav`: son componentes sin estado propio relevante fuera de sí mismos, dos instancias
  behaving igual y sincronizadas por el estado global que ya comparten (`next-themes`, la sesión).
- **Etiquetas en la columna angosta (`w-32`, 128px)**: los pills de `SidebarNav` pasan a ícono
  solo (`landscape:max-lg:hidden` en el `<span>` de texto) con `aria-label` agregado incondicional
  en el `<Link>` — nombre accesible sin depender de qué esté visible. `ThemeToggle` y `LogoutButton`
  no necesitaron cambios: ya eran ícono-solo o ya ocultaban su texto por su cuenta (`aria-label`
  propio en los dos).
- **Áreas seguras**: `pr-[calc(0.5rem+env(safe-area-inset-right))]` en la columna,
  `pl-[env(safe-area-inset-left)]` en `main` — valores de `env()`, sin números inventados. La
  columna scrollea por dentro (`overflow-y-auto`) si algún día no entran los controles, nunca
  reintroduce scroll de página (invariante del #13).
- **Medido/estimado — columna vs. contenido en horizontal**: columna 128px de ancho (dentro del
  presupuesto de 120-140px pedido) con 6 controles a 44px + `gap-1` + `p-2` ≈ 300px de los ~390px de
  alto disponibles (con margen, y `overflow-y-auto` como red de seguridad) — contenido (mapa o
  lista) pasa a ocupar el alto **completo** del viewport (~390px, sin ninguna barra arriba), contra
  ~290px que dejaba el Hallazgo #14 y los ~207px originales.
- **`/jornadas` en horizontal** comparte el mismo `layout.tsx` — recibe la misma columna
  automáticamente (con solo 4 controles, el slot ahí queda vacío) sin ningún código propio de esa
  pantalla; la tabla/tarjetas y los filtros no se tocaron.
- **Nota aparte de la spec, resuelta en este mismo commit**: los pills de `SidebarNav` en
  **vertical** también estaban por debajo del piso de 44px (Hallazgo #11) — quedó pendiente porque
  no estaba en el alcance de esa spec. Se corrigió de una vez (`landscape:max-lg:h-11` → `max-lg:h-11`,
  cubre las dos orientaciones sin tocar escritorio) — costo estimado ~8px en vertical (mapa de 366 a
  ~358px), aceptado sin problema dado el margen que ya tenía esa medición.
- **No se tocó** el `absolute inset-0` del `MapContainer` (#11), el `max-lg:absolute max-lg:inset-0`
  del panel de choferes (#12), el `lg:min-h-[600px]` (#13), ni la lógica del portal en sí — de esta
  última solo cambió dónde vive el slot y la dirección (`flex-col` en vez de `flex-row`) de lo que se
  porta ahí.

Verificación: `tsc --noEmit`/`lint`/`format:check` limpios en `dashboard/`. El servidor de desarrollo
sigue respondiendo sin error 500 tras todos estos cambios. **Pendiente, sin poder verificar en este
entorno**: confirmar en el teléfono real, en las dos orientaciones de rotación, que no queda ninguna
barra horizontal arriba, que el mapa/la lista ocupan el alto completo, que los ~4-6 controles de la
columna se ven y se tocan sin errar, que la columna nunca queda debajo del notch/la cámara en
ninguno de los dos sentidos de rotación, que rotar con el mapa abierto no lo deja gris ni pierde el
centro, y que `/jornadas` en horizontal se ve bien con la misma columna.

**Hallazgo #16 — jerarquía visual dentro de la columna lateral (2026-09-18)**: confirmado en el
teléfono que la columna del Hallazgo #15 funciona (controles tocables, mapa con alto completo), pero
mezclar alternar tema/cerrar sesión (utilidades) en la misma tira que la navegación se veía
desprolijo. Se evaluó volver a una barra delgada arriba con esos dos controles y **se descartó por su
costo**: respetando el piso de 44px (#11), esa barra mide ~48px mínimo — casi la mitad del alto que
la columna acababa de recuperar (mapa de ~390px a ~342px). Se resolvió **dentro de la columna, sin
gastar alto**: reordenar, no agregar una barra.

- **Orden final de la columna, de arriba abajo**: (1) el ícono del logo (`Truck`, sin el texto
  "app-transp" — no entra legible en 128px), decorativo — confirmado contra el header real que ese
  logo **nunca fue un enlace** (`<div>` sin `href`/`onClick`), así que se mantuvo decorativo, sin
  forzarlo a cumplir 44px (no se toca, no es un control); (2) navegación (`SidebarNav horizontal`) +
  el slot del selector "Mapa/Lista" (`#selector-movil-horizontal`, sigue vacío en `/jornadas`), igual
  que en el Hallazgo #15; (3) al pie, empujadas con `mt-auto` y separadas por `border-t`: alternar
  tema y cerrar sesión — utilidades de la aplicación, no navegación. `mt-auto` (no un alto fijo ni un
  spacer) las mantiene pegadas abajo sin importar cuántos ítems tenga la nav ni si el slot está
  vacío.
- **`ThemeToggle` necesitó un wrapper `flex justify-center`** que `LogoutButton` no necesitó: el
  botón de `ThemeToggle` es `size="icon"` (ancho fijo `w-11`), y un ancho fijo no se estira con
  `align-items: stretch` por defecto — quedaba pegado al borde izquierdo de la columna en vez de
  centrado. `LogoutButton` (`size="sm"`, sin ancho propio) sí se estira solo, y su contenido ya
  queda centrado por las clases base del `Button` compartido — no necesitó nada extra.
- **Presupuesto revisado**: con el logo y el divisor sumados, ~340px de controles en `/mapa` (2 pills
  de nav + 2 botones del selector + logo + tema + cierre de sesión) sobre los ~390px disponibles —
  entra con ~50px de margen, más el `overflow-y-auto` que ya existía como red de seguridad. En
  `/jornadas` (sin selector) son ~244px — bastante más margen todavía.
- **Ancho de la columna (128px) y alto del contenido (~390px) sin cambios** — esta spec es
  exclusivamente reordenar y separar visualmente, no tocó ninguna medida de las que fijó el
  Hallazgo #15.
- **No se tocó** ningún mecanismo de los Hallazgos #11-#15 (`absolute inset-0`, el portal y su slot,
  `lg:min-h-[600px]`, el wrapper de agrupación, `env(safe-area-inset-right)`).

**Hallazgo #17 — los rangos de fecha de un reporte se interpretan siempre como días de calendario de
España (2026-09-18)**: **regla, a respetar en cualquier filtro/reporte por fecha que se agregue de
acá en más — un rango de fechas significa siempre días de calendario de `Europe/Madrid`, con
intervalo semiabierto (`>= inicio`, `< finExclusivo`), y la conversión de día de calendario a
instante UTC ocurre siempre del lado del servidor.**

- **Diagnóstico (Fase 1, recorrida completa antes de tocar código)**: la interpretación del rango
  real estaba en los Route Handlers, no en el navegador ni en el mock server. `exportar-reporte-
  dialog.tsx` manda las cadenas `"YYYY-MM-DD"` tal cual (sin convertir) a `POST /api/reportes/
  exportar`; ese Route Handler (y, **con el mismo mecanismo**, `GET /api/jornadas` — los filtros de
  la tabla) armaban `` `${fecha}T00:00:00` ``/`` `${fecha}T23:59:59.999` `` **sin offset** y los
  comparaban contra `fecha_check_in` (`timestamptz`, confirmado en `supabase/schema.sql`) — Postgres
  interpreta una cadena así en la zona de la **sesión** (la de Supabase, UTC), no en la de España.
  Una jornada que arrancó a las 00:30 de Madrid quedaba fuera de su propio día. El mock server
  (`server/mock/reportes.js`) no hace ningún filtrado propio — solo recibe el arreglo ya filtrado —
  pero **sí tenía el mismo tipo de bug en la salida**: `formatearHora`/`formatearFecha` usaban
  `toLocaleTimeString`/`toLocaleDateString` **sin `timeZone`**, así que en Render (que corre en UTC)
  el Excel mostraba las horas de check-in/check-out en UTC, no en la hora real en que ocurrieron en
  España — confirmado con una prueba empírica forzando el proceso a `TZ=UTC`: sin el fix, una
  jornada de las 10:30 de Madrid aparecía como "09:30"; con `timeZone: "Europe/Madrid"` agregado,
  aparece correcta.
- **Fix — conversión centralizada, un solo lugar**: `dashboard/lib/rango-fechas-espana.ts` (nuevo)
  expone `inicioDiaEspanaUtc(fechaIso)`/`finDiaEspanaUtcExclusivo(fechaIso)` — reciben un día de
  calendario español y devuelven el instante UTC equivalente, calculando el desfase vigente
  (`+01:00`/`+02:00`) con `Intl.DateTimeFormat` (formatear un instante COMO SI se mostrara en
  España, interpretar esa hora de pared como si fuera UTC, y comparar contra el instante original —
  la diferencia es el desfase real ese día; nunca un número fijo a mano). Usado desde `GET /api/
  jornadas` y `POST /api/reportes/exportar`, los dos con `.gte()`/`.lt()` (antes `.lte()` con
  `23:59:59.999`, el borde que pierde la última fracción de segundo que la spec pedía evitar) —
  **confirmado que ambos comparten el mecanismo, se corrigieron en la misma pasada**, así que la
  tabla y el reporte vuelven a coincidir exactamente para el mismo rango. Verificado con un script
  Node aparte (no solo razonado): los dos casos de borde de la spec (jornada a las 00:30 y a las
  23:30 de Madrid) caen en el día español correcto, y el desfase cambia correctamente de +02:00 a
  +01:00 entre el 24 y el 26 de octubre de 2026 (el cambio de horario real de ese año).
- **`todayIsoDate()`/`daysAgoIsoDate()` (`dashboard/lib/utils.ts`)**: seguían usando `toISOString()`
  (UTC) — pasan a `Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" })` (el locale `sv-SE`
  da `"YYYY-MM-DD"` directo). Corre en el navegador pero el resultado no depende de la zona del
  dispositivo del administrador — `Intl` con `timeZone` explícito ignora la zona del sistema. Se
  agregó `firstDayOfMonthIsoDate()` (nuevo, para el atajo "Este mes"). Los tres siguen usándose
  únicamente para **prellenar** un `<input type="date">` — la interpretación real/autoritativa del
  rango es la del servidor, arriba.
- **Los atajos de rango del Hallazgo #11 (Hoy / Últimos 7 días / Este mes) se unificaron con estos
  helpers** — antes tenían su propio cálculo con los getters locales del navegador (`fechaLocalIso`
  en `filtros-jornadas.tsx`, ya eliminado), un criterio distinto y por su cuenta correcto pero
  redundante ahora que `lib/utils.ts` también calcula en España.
- **Encontrado de paso, fuera de alcance de esta spec, sin tocar**: `formatFechaHora`/`formatFecha`
  (`dashboard/lib/utils.ts`) — las que usa toda la tabla/detalle de jornadas del Dashboard para
  MOSTRAR check-in/check-out al administrador — tampoco fijan `timeZone`, así que muestran la hora
  en la zona del **dispositivo del administrador**, no necesariamente la de España. Distinto del bug
  de esta spec (ese es sobre qué jornadas entran en un rango/reporte y las horas DENTRO del Excel;
  esto es sobre cómo se ve un timestamp puntual en la pantalla) y con una superficie mucho mayor
  (toca casi cualquier vista de una jornada) — si se decide que también debe fijarse siempre en hora
  de España, es una spec propia.
- **Fuera de alcance, no tocado**: la app móvil; cualquier zona horaria que no sea `Europe/Madrid`
  fija.

**Hallazgo #17, Parte B — el modal "Ver ruta" usaba `vh` en vez de `dvh`**: `h-[70vh]` en
`ruta-jornada-dialog.tsx` → `h-[70dvh]` — mismo criterio que el resto del Dashboard (Hallazgo #11).
Confirmado por cálculo (no se pudo medir en un dispositivo real desde este entorno) que **no
desbordaba** dentro del modal a pantalla completa: el panel del modal en mobile es `h-full` (ocupa
el viewport real vía `fixed inset-0`, inmune al salto de `vh`) con un header `sticky` (~50px) + `p-4`
(32px) alrededor del mapa — `70dvh` + ~82px de contenido contra un modal de 100% del viewport solo
desborda por debajo de ~273px de alto, muy por debajo de cualquier teléfono real incluso en
horizontal (~390px, ~30% de margen). No es el mismo patrón del Hallazgo #11 (ese padre nunca tuvo un
alto genuinamente definido; este sí lo tiene) — **no** se convirtió a `flex-1`/`min-h-0` ni a
`absolute inset-0`, tal como pedía la spec no hacer si no hacía falta.

**Hallazgo #18 — formato de fecha/hora del Excel: 24 horas y locale explícitos, no ambientales
(2026-09-18)**: con el Hallazgo #17 ya resuelta la zona horaria, las horas del Excel coincidían con
las del Dashboard pero se veían en formato 12h (AM/PM). **Regla, ahora en los dos lados del
sistema**: fecha y hora se formatean siempre con locale y zona horaria explícitos (`es-ES`,
`Europe/Madrid`, `hour12: false`), nunca dependiendo de la configuración del entorno — ni la del
navegador del administrador (Dashboard, Hallazgo #7) ni la del proceso en Render (`server/mock`).

- **La causa real no era la que suponía la spec**: `formatearHora`/`formatearFecha` en
  `server/mock/reportes.js` **ya pasaban un locale explícito** (`"es-MX"`, no ausente) — confirmado
  leyendo el código antes de asumir. El problema es que `es-MX` usa 12 horas con AM/PM por defecto;
  `es-ES` da 24 horas directo. Se cambió a `es-ES` **y además** `hour12: false` explícito (los dos,
  no uno — mismo criterio que el Hallazgo #7: no depender de que el default de un locale se
  mantenga).
- **La fecha ya salía bien, verificado empíricamente (no asumido)**: simulando las condiciones de
  Render (`TZ=UTC`, `render.yaml` fija Node 20.18.0), `formatearFecha` con `es-MX` **ya daba**
  `DD/MM/YYYY` (`"15/01/2026"`) — el orden estadounidense que temía la spec no estaba pasando. No se
  tocó ninguna lógica de fecha más allá de alinear el locale a `es-ES` por consistencia con la hora.
- **Verificado con el Excel real generado, no solo las funciones sueltas**: se invocó
  `generarLibroExcel()` (la función interna, sin mandar ningún correo), se leyó el `.xlsx` resultante
  con `ExcelJS` de vuelta, y se confirmaron los valores tal como quedan en la celda — `"15/01/2026"`,
  `"10:30"`, `"19:15"` (una jornada de 09:30 a 18:15 UTC = 10:30 a 19:15 en Madrid, invierno) — con
  `TZ=UTC` forzado, igual que Render.
- **Barrido el archivo completo**: no queda ningún otro `toLocale*` en `server/mock/` — el cuerpo del
  correo y el nombre del archivo (`construirHtmlCorreo`, el `filename` de los adjuntos) solo
  reinsertan `rangoInicio`/`rangoFin` tal como llegan del Dashboard (`"YYYY-MM-DD"`, sin reformatear),
  no había otra omisión que corregir.
- **ICU completo, no reducido**: confirmado que Node no cae a `en-US` en silencio —
  `Intl.NumberFormat("es-ES").resolvedOptions().locale` devuelve `"es-ES"` — probado en Node 26 local
  (Render usa 20.18.0, per `render.yaml`); los builds oficiales de Node traen ICU completo por
  defecto desde la v13, así que esto no debería depender de la versión exacta, pero no se pudo
  confirmar contra el Node 20.18.0 real de Render desde este entorno.
- **Fuera de alcance, sin tocar**: el cálculo/contenido del reporte (mismas columnas, mismos
  valores), `formatFechaHora`/`formatFecha` del Dashboard (la deuda de zona horaria anotada en el
  Hallazgo #17, distinta de esto).
- **Pregunta abierta de la spec, sin resolver todavía**: si las celdas de fecha/hora del Excel
  deberían ser valores de fecha reales (para poder ordenarlos/calcular con ellos) en vez de texto
  formateado como hoy — pendiente de decidir aparte, no se tocó.

**Hallazgo #19 — el Excel exportado escribe fechas, horas y duraciones como valores reales, no texto
(2026-09-18)** — responde la pregunta abierta del Hallazgo #18: **las celdas de fecha, hora del día
y duración del reporte (`server/mock/reportes.js`, `exceljs` v4.4.0) son valores numéricos con
formato declarado, no texto** — se pueden sumar, ordenar y usar en tablas dinámicas sin convertirlas
antes.

- **El número se construye a mano a partir de los componentes de reloj de pared en `Europe/Madrid`
  (`componentesEnEspana()`, mismo mecanismo `Intl`+`timeZone` del Hallazgo #17) — nunca entregando un
  `Date` a `exceljs`.** Una fecha de Excel es solo un número (días desde el 30/12/1899, sin ninguna
  zona horaria propia); si se delega la conversión en la librería, lo más probable es que use UTC o
  la zona del proceso (Render = UTC) y reintroduzca el Hallazgo #17 por la puerta de atrás — esta vez
  sin AM/PM que lo delate (`"07:30"` en vez de `"09:30"`, con pinta de dato correcto).
- **Una duración es una fracción de día — para pagar una tarifa por hora hay que multiplicar
  `horas * 24 * tarifa`** (`=A2*24*tarifa` en Excel). Es la línea que le va a hacer falta a quien
  arme la planilla de pagos.
- **Formato `[h]:mm` (con corchetes) en la columna de duración, no `h:mm`** — sin los corchetes, una
  suma que pasa de 24 horas vuelve a cero (25:30 se ve `01:30`); con `[h]:mm` acumula sin dar la
  vuelta, que es lo que hace falta al totalizar una semana o un mes.
- **Columnas que cambiaron** (de las 23 del reporte): `fecha` (`dd/mm/yyyy`), `horaCheckIn`/
  `horaCheckOut` (`hh:mm`), `horasTotales` (`[h]:mm`) y — no estaba en la spec original, encontrada
  al revisar el archivo completo — **`horaIncidencia`** (`hh:mm`), la hora de la incidencia que
  también se mostraba como texto formateado. El resto (nombres, empresa, ruta, matrícula, combustible
  con `%`, los hipervínculos a fotos/ubicación, `kmInicial`/`kmFinal`/`kmRecorrido` que ya eran
  numéricos) no se tocó.
- **`calcularHorasTotales()` ya calculaba el número en horas decimales** antes de convertirlo a texto
  con `.toFixed(2)` — se usa ese número directo (dividido por 24), sin reconstruirlo parseando nada.
- **`horaIncidencia` no podía seguir el patrón de "concatenar por salto de línea" que ya tenían
  `tipoIncidencia`/`descripcionIncidencia`** (pensado para cuando una jornada admita más de una
  incidencia, algo que hoy nunca pasa) — una celda numérica no puede llevar dos valores. Se usa la
  primera incidencia (hoy la única); si en el futuro una jornada admite varias, esta columna
  puntual necesita su propio rediseño, documentado en el código.
- **Celdas sin dato siguen en texto** (`"-"`/`"N/A"`: sin check-out todavía, jornada abierta; sin
  incidencia) — no es "quedar a medias" (lo que la spec pedía evitar), es la ausencia legítima de un
  valor, mismo criterio que ya usaba `kmFinal` antes de esta spec.
- **Sin fila de totales** — no existía antes, y agregarla era opcional en la spec; se mantuvo fuera
  para no ampliar qué contiene el archivo.
- **Verificado empíricamente sobre el `.xlsx` real** (no solo mirado): se generó el archivo, se leyó
  de vuelta con `exceljs`, y se confirmó que las celdas son de tipo numérico con formato (no `String`)
  — con `TZ=UTC` forzado (igual que Render), una jornada de 09:30 a 18:15 UTC (invierno) se reconstruye
  como `10:30`/`19:15`, una duración de `08:45` (= 8.75h), y una jornada de verano (octubre,
  `+02:00`) como `07:00`/`15:00` — coincide con lo que ya muestra el Dashboard para las mismas
  jornadas, porque la conversión a España es la misma del Hallazgo #17, sin tocar. El orden
  cronológico de los seriales de fecha se confirmó correcto cruzando septiembre→octubre.
  **No se pudo verificar en este entorno** que la suma de varias duraciones en Excel real supere las
  24 horas sin dar la vuelta (`exceljs` no evalúa fórmulas ni renderiza — esa prueba necesita abrir
  el archivo en Excel/LibreOffice de verdad) ni que ninguna columna muestre `########` por ancho
  insuficiente — los anchos existentes ya eran generosos para el contenido anterior (p. ej. incluían
  margen para `"10:30 a.m."`) y el contenido nuevo es igual o más corto, así que no deberían
  necesitar ajuste, pero queda pendiente abrir el archivo para confirmarlo a ojo.
- **No se tocó** nada de los Hallazgos #17/#18 (`rango-fechas-espana.ts`, el filtro semiabierto, la
  conversión a `Europe/Madrid`) — esta spec los consume como fuente de los componentes de reloj de
  pared, no los modifica.

**Hallazgo #20 — toda fecha/hora que el Dashboard MUESTRA (no solo filtra o exporta) se presenta en
hora de España, y toda hora que RECIBE de un formulario se interpreta con el mismo criterio
(2026-09-21)**. La regla del Hallazgo #17 ahora cubre las tres etapas: filtrado, reporte, y
presentación — **siempre `Europe/Madrid`, `es-ES` y `hour12: false` explícitos, nunca heredados del
navegador ni del proceso.**

- **Dónde se producía el valor (navegador, no servidor) — confirmado rastreando el código, no
  adivinando**: `useJornadas()` (`lib/hooks/use-jornadas.ts`) usa TanStack Query sin ningún
  `prefetchQuery`/`HydrationBoundary` — `app/providers.tsx` crea el `QueryClient` vacío dentro de un
  `useState`, así que durante el SSR `data` es `undefined` y `TablaJornadas` renderiza con un arreglo
  vacío: `formatFechaHora` nunca llega a ejecutarse con datos reales del lado del servidor.
  `JornadaDetalleDialog` recibe la jornada desde un `useState` que arranca en `null`.
  `trazado-ruta.tsx` cuelga de un mapa cargado con `dynamic(..., { ssr: false })`. Los tres caminos de
  entrada de una fecha a la pantalla confirman lo mismo — es un caso de borde (solo afecta a un
  administrador fuera de España), no la situación grave de "la tabla viene mostrando horas corridas
  desde el día uno" que habría sido si el valor se produjera en el servidor.
- **`formatFechaHora`/`formatFecha` (`lib/utils.ts`)**: pasan a declarar `timeZone: "Europe/Madrid"`,
  locale `"es-ES"` y (solo `formatFechaHora`, que tiene componente de hora) `hour12: false` — mismo
  trío del Hallazgo #18, mismo motivo: los tres dependen de un valor ambiente (zona del dispositivo,
  idioma del navegador) si no se declaran. Verificado forzando el proceso a una zona distinta de
  España (`TZ=UTC` — esta shell no propaga bien valores de `TZ` con `/` como
  `America/Mexico_City`, usado como equivalente): antes del fix, una jornada de las 10:30 de Madrid
  se mostraba como `"09:30"`; después, `"10:30"` sin importar la zona del proceso. Confirmado también
  invierno/verano y el caso de madrugada (00:30 Madrid cae en su propio día).
  **`formatFecha` no la llama nadie hoy** (código muerto, confirmado con una búsqueda exhaustiva) —
  se corrigió igual porque la spec la nombra explícitamente, pero queda anotado por si en algún
  momento se decide eliminarla en vez de mantenerla sin uso.
- **El camino de entrada estaba inconsistente, confirmado y corregido en la misma pasada**: el editor
  de check-out (`editar-jornada-dialog.tsx`) prellenaba con `isoAFechaLocal`/`isoAHoraLocal` (getters
  LOCALES del navegador — `getFullYear`/`getHours`/...) y, al guardar, interpretaba lo tipeado con
  `` new Date(`${fecha}T${hora}`).toISOString() `` (sin offset, también zona del navegador). Los dos
  caminos eran consistentes ENTRE SÍ (por eso la guarda anti-truncado de segundos, Hallazgo #6, nunca
  se rompió), pero quedaban inconsistentes con la pantalla, que ahora muestra España: un admin fuera
  de España iba a ver `"10:30"` en la tabla, escribir `"10:30"` en este campo, y guardar un instante
  distinto. `dashboard/lib/hora-espana.ts` (nuevo) expone `componentesEnEspana()` (para prellenar) e
  `instanteEnEspanaComoUtc()` (para el envío) — **no se tocó ni se reusó `rango-fechas-espana.ts`**
  (explícitamente cerrado, Hallazgo #17): ese módulo resuelve un problema más angosto (límites de un
  día completo para filtrar un rango), y acá hace falta cualquier hora dentro del día, en las dos
  direcciones — se aceptó duplicar el mecanismo de desfase (~15 líneas, ya verificado) antes que
  tocar un archivo cerrado. La guarda anti-truncado sigue funcionando porque prellenado y comparación
  usan la MISMA función (`componentesEnEspana`), determinística — cambió QUÉ criterio de zona usa,
  no que los dos caminos dejen de coincidir entre sí.
  ⚠️ **Pendiente con disparador, no para resolver ahora**: `desfaseMinutos()` es el mismo algoritmo
  de ~20 líneas escrito dos veces (`rango-fechas-espana.ts` y `hora-espana.ts`) — no solo la cadena
  `"Europe/Madrid"` en común, es justamente el pedazo difícil de acertar (el manejo del horario de
  verano/invierno). **Costo concreto de dejarlo así**: si el día de mañana se corrige un bug en una
  copia y no en la otra, la divergencia no tira ningún error — da una hora corrida durante parte del
  año, y recién se nota en el cambio de horario de marzo/octubre, cuando ya hace tiempo que se hizo
  el cambio. **Disparador**: extraer `desfaseMinutos()` a un módulo compartido la próxima vez que se
  toque cualquiera de los dos archivos (no antes — mezclar esa extracción con un cambio que todavía
  no pasó su propia verificación en la app real mezclaría dos riesgos que conviene mantener
  separados). La firma que sobrevive esa fusión es la de `rango-fechas-espana.ts`
  (`desfaseMinutos(instante, zona)`), ya general — la de `hora-espana.ts` es la que se descarta.
  **Un tercer archivo comparte la misma decisión de negocio sin compartir este algoritmo**:
  `server/mock/reportes.js` (Hallazgo #18) también sabe de `Europe/Madrid`, pero usa `Intl`
  directamente para *formatear* una hora, no para *calcular un desfase* — no hay código duplicado
  ahí, pero son 3 archivos en 2 sub-proyectos (`dashboard/` y `server/mock/`) que tienen que seguir
  de acuerdo sobre la misma zona horaria.
- **Verificado con un script Node aparte** (mismo método que los Hallazgos #17-#19): conversión
  ida y vuelta (fecha+hora de España → instante UTC → fecha+hora de España) exacta en 4 casos,
  incluyendo el día del cambio de horario de octubre 2026; desfase +01:00/+02:00 correcto en
  invierno/verano.
- **No se agregó ninguna etiqueta "hora de España" en pantalla** — decisión ya tomada en la spec, no
  hace falta hoy porque todos los administradores están en España.
- **No hace falta ninguna advertencia sobre horarios históricos mal mostrados** — el diagnóstico dio
  "navegador", no "servidor": para un administrador ubicado en España (la situación real hoy), la
  hora que vio siempre fue la correcta.

**Hallazgo #21 — el reporte exportado tiene que contener exactamente lo que la tabla muestra
(2026-09-21)**. Detectado por el usuario con datos reales: filtró `/jornadas` por chofer "cesar", la
tabla mostró 18, el Excel trajo 8. **Regla, de acá en más**: lo que se exporta es siempre lo que la
pantalla está mostrando; el diálogo de exportar no tiene ningún criterio propio ni memoria entre
aperturas; y el archivo declara sus propios filtros y su total, para que una futura divergencia
(la que sea) se vea **abriendo el archivo**, no solo confiando en que el Dashboard mandó lo correcto.

- **La causa real no era la que suponía la spec**: no hay ningún `useState` ni valor persistido a
  nivel de módulo en `exportar-reporte-dialog.tsx` — nunca hubo "memoria de una exportación
  anterior". Lo que pasaba: el diálogo recalculaba `rangoInicio`/`rangoFin` en cada render con
  `filtros.desde || daysAgoIsoDate(7)` — cuando la tabla no tenía fecha filtrada (`desde`/`hasta`
  vacíos = "todo el tiempo"), el diálogo sustituía en silencio ese "todo el tiempo" por un default
  de "últimos 7 días" que la tabla nunca usó, porque `POST /api/reportes/exportar` **exigía** un
  rango (400 si faltaba) mientras que `GET /api/jornadas` ya lo trataba como **opcional**. Filtrar
  por "cesar" sin fecha → tabla: 18 (todo el tiempo) → diálogo: solo los últimos 7 días de esas 18 →
  8. Confirmado leyendo el código, no el resultado, tal como pedía la spec.
- **`POST /api/reportes/exportar` sí recibía y aplicaba el filtro de chofer** (y empresa y estado) —
  confirmado en el código antes de asumir nada. No era el escenario grave (jornadas de otro chofer
  filtrándose adentro); era el reportado (jornadas propias quedando afuera).
- **Las jornadas abiertas ya se incluían por defecto** en el reporte (sin filtro de estado = todos
  los estados) — coincide con lo que ya hacía la tabla. **Cuántas de las 18 de "cesar" estaban
  abiertas no se pudo determinar desde este entorno** — requiere consultar la base real, que no
  tengo acceso a consultar directamente; si hace falta ese número puntual, es una consulta rápida en
  Supabase (`estado = 'abierta'` sobre esas 18 filas).
- **`GET /api/jornadas` y `POST /api/reportes/exportar` ahora comparten el armado del filtro** —
  `dashboard/lib/jornadas-filtro.ts` (nuevo) expone `aplicarFiltrosJornadas(query, filtros)`,
  reusada por los dos Route Handlers en vez de que cada uno arme su propia consulta Supabase por su
  cuenta (que fue, estructuralmente, lo que permitió que los dos contratos divergieran). ⚠️ Nota de
  tipos: un genérico propio sobre el builder de supabase-js (probado con auto-referencia y con
  `this`) dispara "Type instantiation is excessively deep" — limitación conocida de supabase-js sin
  un `Database` generado, no un error de modelado. Se resolvió con `Q` sin restricción + un cast
  interno (`as unknown as`) — la firma pública sigue siendo `Q -> Q`, sin perder tipado para quien
  llama a la función.
- **`POST /api/reportes/exportar` pasa a tratar `rangoInicio`/`rangoFin` como opcionales**, igual
  que `desde`/`hasta` en `/api/jornadas` — "sin fecha" es "sin límite de ese lado", nunca un default
  inventado.
- 🔄 **Ajuste (2026-09-22), verificado en producción ("cesar" 18 = 18 = 18 y el resto de la Fase 3):
  el diálogo vuelve a ser de solo lectura, salvo el correo de destino.** La versión original de este
  Hallazgo dejaba empresa/chofer/estado/rango editables dentro del diálogo (arrancaban iguales a la
  tabla pero se podían ajustar sin tocarla); en uso real se pidió lo contrario. Con los filtros
  editables, que el archivo coincida con la pantalla dependía de mantener sincronizados DOS criterios
  (el de la tabla y el que el usuario tocara en el diálogo); de solo lectura, hay un solo criterio —
  el de la tabla — y la coincidencia es estructural, no algo que dependa de verificar que nadie
  divergió. El diálogo sigue arrancando de los filtros ACTIVOS de la tabla (vía el remount por `key`
  que ya existía) pero ahora los lee directo de la prop `filtros` sin `useState` propio para
  empresa/chofer/estado/desde/hasta — no hay nada que editar, así que no hay nada que guardar. Los
  filtros se siguen mostrando **a la vista** (nunca ocultos: `<dl>` de solo lectura, con el mismo
  contraste que el resto del texto de la UI, no el gris apagado de un input `disabled`) — esconderlos
  hubiera sido una regresión del sentido original del #21. Para exportar un rango distinto hay que
  filtrar la tabla primero y volver a abrir "Exportar" — costo aceptado a cambio de la garantía más
  fuerte.
- ⚠️ **La pieza más importante de la spec**: el diálogo muestra "Se exportarán N jornada(s)" **antes**
  de exportar, recalculado con cada cambio de filtro — reusa `useJornadas()` (el mismo hook que ya
  usa la tabla) con `pageSize: 1`, así el número sale de la MISMA fuente que la tabla, no de un
  cálculo aparte. Si el conjunto queda vacío, el botón de enviar se deshabilita y se avisa en
  pantalla — **y además**, del lado del servidor, `/api/reportes/exportar` devuelve 400 sin llamar al
  mock server si la consulta da 0 filas (defensa en profundidad: protege aunque alguien pegue
  directo al endpoint sin pasar por el diálogo).
- **El archivo declara sus filtros**: nueva hoja "Filtros" (segunda hoja del libro, después de
  "Jornadas" — la hoja de datos no se tocó, sigue siendo la misma del Hallazgo #19) con el rango de
  fechas efectivo, empresa/chofer/estado aplicados (o "Todas"/"Todos"), la fecha y hora de
  generación (hora de España, mismo criterio del Hallazgo #20) y el total de jornadas — verificado
  generando el `.xlsx` real y leyéndolo de vuelta, con las 4 combinaciones de filtros (rango
  completo, sin ningún filtro, solo "desde", solo estado).
- **Verificado con un script Node aparte** (mismo método que los Hallazgos #17-#20): la función
  compartida `aplicarFiltrosJornadas`, contra una consulta simulada que registra las llamadas —
  confirmado que "chofer sin fecha" (el caso que fallaba) ya NO aplica ningún `gte`/`lt`, y que
  "sin ningún filtro" no aplica nada en absoluto, igual que la tabla.
- ✅ **Verificado en la app desplegada (confirmado por el usuario antes del 2026-09-22)**: el caso
  "cesar" da 18 = 18 = 18 (tabla, contador del diálogo, filas del archivo) y el resto de la Fase 3 de
  la spec pasó. No se pudo reproducir ni verificar desde este entorno (sin acceso a Supabase ni a la
  app desplegada) — esta confirmación vino del usuario.
- ✅ **Resuelto en el mismo commit: tope de 5000 jornadas por reporte, sin dejar un truncamiento
  silencioso posible.** El contador del diálogo (punto anterior) atrapa la divergencia que ya se
  había visto ("cesar" 18 vs 8), pero quedaba un hueco sin nombrar: `POST /api/reportes/exportar`
  cortaba la consulta con `.limit(MAX_JORNADAS_POR_REPORTE)` (5000) sin comparar nunca ese número
  contra el total real, y PostgREST tiene su **propio** tope de filas por respuesta (`db-max-rows`,
  configurado del lado de Supabase, valor desconocido en este proyecto y no debería hacer falta
  conocerlo) que puede recortar la respuesta por debajo incluso de ese `.limit()`, en silencio, sin
  que ningún código local lo note. Dos capas, mismo criterio que el contador aplicado un nivel más
  abajo:
  - **Servidor** (`dashboard/app/api/reportes/exportar/route.ts`): el `.select()` ahora pide
    `{ count: "exact" }` además de las filas; si `count > filas.length` (el `.limit()` propio actuó,
    o `db-max-rows` actuó, o cualquier otra causa futura), el endpoint devuelve 400 sin llamar al
    mock server — nunca se manda un reporte más corto de lo que dice ser.
  - **Cliente** (`exportar-reporte-dialog.tsx`): el diálogo ya tiene el conteo en la mano (mismo
    hook `useJornadas` de arriba), así que si `totalJornadas > MAX_JORNADAS_POR_REPORTE` bloquea el
    envío ANTES de intentarlo — evita gastar tiempo armando un Excel que se sabe de antemano que el
    servidor va a rechazar (defensa en profundidad: el servidor sigue siendo quien decide, esto es
    solo una respuesta más rápida en el caso común). ⚠️ El texto del aviso se corrigió el 2026-09-22:
    decía "Acotá el rango o los filtros", redactado cuando esos campos eran editables ahí mismo; con
    el diálogo de solo lectura (ver ajuste más arriba) esa instrucción quedó imposible de seguir
    dentro del diálogo — ahora dice "Filtrá la tabla de Jornadas para acotarlo y volvé a exportar."
  - `MAX_JORNADAS_POR_REPORTE` vive en un solo lugar (`dashboard/lib/jornadas-filtro.ts`), usado por
    las dos capas — mismo patrón que `aplicarFiltrosJornadas`.
  - **Verificado con un script Node aparte** (mismo método que el resto de este Hallazgo): las dos
    condiciones (`count > filas.length` del servidor, `totalJornadas > MAX_JORNADAS_POR_REPORTE` del
    cliente) copiadas textualmente del código real, contra 7 escenarios — respuesta completa sin
    truncar, el bug original reproducido (18/8), `.limit(5000)` recortando (6000/5000),
    **`db-max-rows` recortando por debajo del `.limit()` sin que el cliente lo hubiera bloqueado
    antes (4000 jornadas, pero solo 1000 llegan — el caso que motivó esta capa)**, el borde exacto
    del límite (5000/5000, no debe bloquear), un excedente de una sola fila (5001/5000) y el caso de
    cero resultados. Los 7 se comportaron como se esperaba.
- **Ajuste de solo lectura (2026-09-22) — verificación**: `npx tsc --noEmit`, `npm run lint` y
  `npm run format:check` en `dashboard/` limpios. Es un cambio de interfaz puro — no toca
  `lib/jornadas-filtro.ts`, el guard de truncamiento de las dos capas, la hoja de filtros del
  `.xlsx` ni el mecanismo de remount por `key` del diálogo. ✅ **Confirmado por el usuario contra la
  app desplegada**: el bloque de filtros se ve bien encuadrado en móvil vertical y horizontal
  (Hallazgo #11) y el envío de punta a punta (correo con el `.xlsx` adjunto) sigue funcionando —
  cierra el resto de la Fase 3 de esta spec.

**Hallazgo #22 — el 429 del mock server era un bloqueo de borde (Cloudflare), no el cold start ya
conocido (2026-09-22)**: detalle completo en §2 ("Cold start" y el bullet de 429 justo debajo).
Resumen: un 429 "Too Many Requests" persistente en `app-transp-mock-server` (a diferencia del 502
de cold start, que se resuelve en el segundo intento) resultó ser un bloqueo temporal en la capa
Cloudflare que Render pone delante de todos sus servicios — invisible en Events/Logs/cuenta de
Render. Se resolvió solo; queda documentado el método de diagnóstico rápido (`curl -i` contra la
raíz y contra la ruta real con un body mínimo) para la próxima vez.

**Hallazgo #23 — se generó el `Database` de Supabase y se encendió el chequeo de nombres de
columna en toda consulta del Dashboard (2026-09-22)**: detalle completo en §6 (deuda técnica,
ahora resuelta). Resumen: ningún `createClient` pasaba el genérico `Database` de supabase-js
(default `any`), así que ningún nombre de columna de ninguna consulta se verificaba en
compilación — un typo que coincidiera con otra columna real habría filtrado por el campo
equivocado sin ningún error. `npm run types:supabase` (nuevo script) genera
`dashboard/lib/supabase/database.types.ts` contra la base real y los dos `createClient<Database>`
ya lo usan. Comparado contra `supabase/schema.sql`, el archivo venía desactualizado (le faltaban 4
columnas de `jornadas` que agregó `schema_v5_edicion_jornadas.sql` y nunca se plegaron de vuelta)
— plegado en commit aparte, mismo criterio que `schema_v3`/`v4`. Verificado con dos pruebas de
typo deliberado (en `jornadas` y en `admins`, fuera del filtro compartido) y contra la app
desplegada de punta a punta.

**Hallazgo #24 — tabla y pantalla de flota, con matrícula normalizada como clave real
(2026-09-22)**: primera etapa de darle entidad propia a los camiones (`spec_flota_vehiculos.md`).
`jornadas.matricula` sigue siendo texto suelto — enlazar la jornada a un vehículo es una segunda
etapa deliberadamente fuera de esta.

- **Tabla `public.vehiculos`** (`supabase/schema_v8_flota_vehiculos.sql`, plegada también en
  `schema.sql` desde el primer commit — mismo criterio que v3/v4, no el desfase que encontró el
  #23): `matricula`, `tipo_propiedad` (`text` + `check`, mismo patrón que `jornadas.estado` — no
  un enum de Postgres), `capacidad_tanque_litros`/`marca`/`modelo`/`anio` opcionales, `estado`
  (`activo`/`baja`, nunca se borra — no hay ninguna acción de eliminar en la pantalla ni en la
  API).
- ⚠️ **La unicidad real vive en un índice de expresión sobre la matrícula normalizada**
  (mayúsculas, sin caracteres no alfanuméricos — `vehiculos_matricula_normalizada`), no en la
  columna cruda, y **vale también para los vehículos de baja** (sin `where estado = 'activo'` en
  el índice): un vehículo de baja que "vuelve" se reactiva (`POST /api/vehiculos/editar` con
  `estado: "activo"`), nunca se duplica.
- **El Route Handler hace el chequeo de duplicado en JS** (trae toda la tabla — una flota son
  decenas de filas, no miles como jornadas — y compara cada matrícula normalizada con la misma
  función que usa el índice), no con una función RPC ni una columna generada extra: mantiene el
  índice "sin columna extra" que pedía la spec, y el índice de Postgres queda como garantía real
  (defensa en profundidad) si dos altas coinciden en la misma fracción de segundo — confirmado
  insertando en paralelo por fuera del chequeo de JS: Postgres lo rechaza igual (`23505`).
- **Verificado contra la base real, no simulado**: `1234ABC` creado; `1234 abc` (espacio) y
  `1234-ABC` (guion) rechazados, los dos con mensaje que identifica el vehículo existente y si
  está activo o de baja; dado de baja y confirmado que sigue en la lista; reintentado y ofrecida
  la reactivación (no un duplicado); reactivado y confirmado que sigue siendo la misma fila
  (mismo `id`); vehículo con todos los campos opcionales cargados y sin ellos; validaciones de
  tipo de propiedad/capacidad/año probadas una por una. Regresión: `/jornadas`
  (caso "cesar" sigue en 18), `/mapa` y `/flota` responden bien.
- **Presupuesto de la columna lateral en horizontal (Hallazgo #16)**: calculado por el mismo
  método que #16 (aritmética de clases Tailwind, sin dispositivo real disponible en este entorno)
  — con la 3ª entrada de nav, ~340px pasaban a ~388px sobre los ~390px disponibles, dentro del
  margen de error de esas cifras aproximadas. Se sacó el logo decorativo de esa columna en el
  mismo commit (el fallback que #16 ya había decidido de antemano), quedando ~356px. ✅
  **Confirmado por el usuario en dispositivo real**: la columna entra bien en horizontal y la
  pantalla de Flota se ve bien en tarjetas en vertical — cierra el resto de la Fase 3 de esta
  spec.
- ⚠️ **Hueco encontrado, no de esta spec**: la spec asumía que `Input`/`Select`
  (`components/ui/`) ya cumplían el piso de 44px de alto en mobile (Hallazgo #11) — confirmado
  contra el código real que **no es así**: el #11 les corrigió la fuente (`text-base md:text-sm`,
  evita el zoom de iOS) pero no el alto, que sigue en `h-9` (36px) fijo, sin una variante mobile
  como sí tiene `Button` (`h-11 md:h-9`). Es parejo en todo el Dashboard (mismo gap en
  `editar-jornada-dialog.tsx`), así que `VehiculoDialog` los usa tal cual existen hoy — corregirlo
  solo acá habría sido inconsistente con el resto de la app. Queda como deuda técnica separada
  (ver §6).
- `DASHBOARD_SESSION_SECRET` agregado a `dashboard/.env.local` (gitignored, nunca se commitea) —
  faltaba para desarrollo local (solo estaba configurada en Render) y bloqueaba probar un login
  real contra el servidor local; sin esto, la verificación de este Hallazgo (y la de varios
  anteriores) dependía de golpear la app ya desplegada. Cualquier valor sirve como secreto HMAC
  local — no necesita coincidir con el de producción.

**Hallazgo #25 — alta y administración de choferes desde el Dashboard, con cambio de contraseña
obligatorio en el primer ingreso (2026-09-23)**: `spec_alta_choferes_dashboard.md`. El registro
propio desde la app móvil (`RegistroScreen.tsx`) se deshabilitó — la única vía de alta pasa a ser
el Dashboard, para que el rastro de auditoría de los Hallazgos #6/#7 se sostenga (si el
administrador conserva la contraseña de un chofer, puede editar jornadas en su nombre sin dejar
huella).

- **Diagnóstico (Fase 1) antes de tocar nada**: `RegistroScreen.tsx` + `registrarCuenta()`
  (`authService.ts`) hacían dos pasos sin transacción — `supabase.auth.signUp()` y después
  `insert` en `choferes` — y el correo sintético con el que Auth identifica al chofer es,
  confirmado carácter por carácter, `apptransp.chofer.{numeroEmpleado}.f83a1c@gmail.com` (no lo
  que decía el comentario viejo de `schema.sql`, que quedó corregido). `numero_empleado` es
  `text unique not null` — `"04"` y `"4"` son valores distintos a propósito, no se inventó una
  normalización que la base no tiene.
- ⚠️ **Decisión de negocio, tomada por el usuario, no por mi cuenta** (la spec lo pedía
  explícitamente): las 7 columnas de `choferes` (`numero_empleado`, `nombre`, `apellidos`, `dni`,
  `fecha_nacimiento`, `pais_nacimiento`, `sexo`) eran y siguen siendo NOT NULL — el administrador
  completa las 7 al crear el perfil desde el Dashboard, no quedó ninguna para que el chofer
  complete después. No se tocó esa restricción ni se agregó una pantalla de "completar perfil" en
  la app.
- **Dos columnas nuevas** (`supabase/schema_v9_choferes_administrados.sql`, plegada en
  `schema.sql`): `activo boolean not null default true` (no rompe choferes existentes) y
  `debe_cambiar_contrasena boolean not null default false` (los que ya se registraron solos NO
  quedan forzados a cambiar nada — la bandera solo se enciende para altas/reseteos nuevos).
- ⚠️ **Corrección a un supuesto de la propia spec**: pedía "elegir el orden" entre crear el
  usuario de Auth y la fila de `choferes`. No es una elección — `choferes.id` es FK a
  `auth.users.id`, así que Auth tiene que existir primero por definición. Lo que sí se decidió es
  la compensación si falla el segundo paso: se BORRA el usuario de Auth recién creado (rollback)
  en vez de dejar un huérfano invisible (existe en Auth, puede iniciar sesión, pero no aparece en
  ningún lado porque no hay fila que lo represente) — el estado que queda es "no se creó nada",
  reintentable. Si ese borrado de compensación también falla, el mensaje se lo dice explícitamente
  al administrador con el id del usuario huérfano, en vez de tragárselo en silencio. Antes de
  tocar Auth para nada, se chequea si el número de empleado ya existe (comparación exacta) — evita
  crear-y-compensar en el caso común de un duplicado/typo.
- **Contraseña temporal**: generada del lado del servidor (`lib/choferes.ts`,
  `generarContrasenaTemporal()`), sin caracteres que se confundan al dictar por teléfono
  (sin `l`/`1`, sin `O`/`0`, sin `I`), devuelta UNA sola vez en la respuesta HTTP de crear o
  resetear — nunca se guarda en la tabla, nunca se manda por correo (no hay correo real:
  el chofer usa un dominio sintético), nunca queda en un log.
- ⚠️ **Mostrar el usuario exacto antes de confirmar el alta**: el formulario del Dashboard
  (`ChoferDialog`) muestra, en vivo mientras se tipea el número de empleado, "El chofer va a
  entrar con el número: `04`" + el correo sintético completo — mismo criterio que el contador del
  Hallazgo #21 (mostrar el dato antes del paso irreversible), para que un cero a la izquierda mal
  tipeado se note en pantalla, no cuando el chofer no pueda entrar.
- **Dar de baja actúa en los dos sistemas a la vez**, no solo en la tabla: `activo = false` +
  `supabase.auth.admin.updateUserById(id, { ban_duration: "876000h" })` (baneo efectivamente
  permanente — no existe un "para siempre" real en la API). Reactivar hace lo mismo al revés
  (`ban_duration: "none"`). El ban se aplica ANTES de tocar la tabla: si falla, no queda el estado
  inconsistente "la tabla dice de baja pero Auth lo sigue dejando entrar".
- ⚠️ **La baja no es instantánea, documentado, no arreglado**: la app es offline-first — un
  chofer con sesión abierta puede seguir cargando jornadas localmente hasta que intente
  sincronizar. El ban corta el acceso (nuevo login, o el próximo refresh de token), no borra lo
  que ya tenga guardado en el teléfono.
- **App móvil (Parte B)**: `Usuario` suma `debeCambiarContrasena`; `RootNavigator.tsx` agrega una
  rama antes de la de "autenticado" — mientras esa bandera sea `true`, el stack solo monta
  `CambiarContrasenaObligatorioScreen` (pantalla nueva), sin tabs ni forma de llegar a ninguna
  pantalla que cargue datos. `cambiarContrasenaObligatoria()` (`authService.ts`) cambia la
  contraseña en Auth y apaga la bandera en el mismo llamado; `AuthContext.marcarContrasenaCambiada()`
  actualiza el estado en memoria y en `SecureStore` para que sobreviva un cierre de la app.
  `RegistroScreen.tsx` pasó de formulario a mensaje ("pedile el acceso a tu administrador") — se
  mantuvo el enlace desde `LoginScreen.tsx` en vez de borrarlo, para no dejar un botón que no
  lleva a ningún lado; sin ningún camino donde el chofer cargue datos que no van a ningún lado.
  `registrarCuenta()`/`NuevoRegistro` se eliminaron (código muerto, nada más los usaba).
- ⚠️ **Presupuesto de la columna lateral en horizontal (Hallazgo #16), esta vez SÍ se excede**:
  con la 4ª entrada de nav (Choferes), calculado ~404px sobre ~390px disponibles — a diferencia
  del #24 (que entraba justo), acá no entra. Decisión explícita del usuario, en vez de rediseñar
  la navegación: dejar que el `overflow-y-auto` ya puesto en esa columna (red de seguridad desde
  el Hallazgo #15) haga su trabajo. **No confirmado en dispositivo real desde este entorno.**
- **Verificación**: `npx tsc --noEmit`/`lint`/`format:check` limpios en `dashboard/` y en la raíz
  (app móvil) — los del Dashboard, recién después de correr la migración (antes, el chequeo de
  columnas del Hallazgo #23 rechazaba correctamente todo lo que tocaba `activo`/
  `debe_cambiar_contrasena`, todavía inexistentes).
  - **Ciclo completo contra la base real**, con choferes de prueba (borrados al terminar): creado
    el chofer `04` → 409, identifica a Pau (real, activo) — confirma que la unicidad exacta
    funciona contra un dato de producción real, no simulado. Creado `4` (sin el cero) → 200, fila
    aparte — confirma que `"04"` y `"4"` son valores distintos, como se decidió en Fase 1. Ciclo
    de contraseña simulando exactamente las llamadas de `authService.ts` (mismo
    `signInWithPassword`/`updateUser`, cliente `anon`, no el Dashboard): login con la temporal →
    `debe_cambiar_contrasena: true` → cambio de contraseña → la temporal vieja queda rechazada
    ("Invalid login credentials") → la nueva funciona y `debe_cambiar_contrasena` ya está en
    `false`. Reseteo desde el Dashboard → la contraseña anterior queda rechazada, la temporal
    nueva funciona, `debe_cambiar_contrasena` vuelve a `true`. Dar de baja → login rechazado con
    **"User is banned"** (el corte real, no un chequeo de tabla). Reactivar → login vuelve a
    funcionar.
  - **Fallo parcial simulado**: Auth creado, insert a `choferes` forzado a fallar (`sexo`
    inválido, viola el `CHECK`) → compensación (`deleteUser`) → confirmado con
    `admin.getUserById` que el usuario de Auth ya no existe y que no quedó ninguna fila en
    `choferes` — ni huérfano de Auth ni huérfano de tabla, tal como se diseñó.
  - **Contraseña temporal, confirmado que no aparece en ningún lado que no sea la respuesta
    única**: `GET /api/choferes` no incluye `contrasenaTemporal` en ninguna fila (las únicas
    coincidencias de "contrasena" en la respuesta son el nombre del campo booleano
    `debe_cambiar_contrasena`), y ninguna de las contraseñas temporales generadas en esta
    verificación aparece en el log del servidor de desarrollo.
  - **Encoding**: un `país_nacimiento` con "España" salió corrupto (`Espa�a`) al mandarlo por
    `curl -d` en este shell (Git Bash/Windows) — confirmado que es un artefacto del shell, no un
    bug: la misma petición armada con `fetch` desde Node (sin pasar por el shell) guardó y
    devolvió "España" bien. No se tocó código por esto.
  - **Regresión**: `/jornadas`, `/mapa`, `/flota` y `/choferes` responden 200; el caso "cesar"
    sigue dando **18**. No se probó un login con la contraseña real de un chofer YA existente (no
    corresponde resetearle la contraseña a alguien real solo para probar) — el mismo camino de
    código ya quedó verificado de punta a punta con los choferes de prueba.
  - **No verificado desde este entorno**: la UI real de `CambiarContrasenaObligatorioScreen` ni el
    gateo de `RootNavigator.tsx` en un dispositivo — se verificaron las llamadas a Supabase que
    esas pantallas hacen (mismo resultado, no la misma pantalla). Requiere un `.apk` nuevo
    instalado (Hallazgo #5) para llegar a un dispositivo real — **no se debe dar de alta ningún
    chofer real hasta que ese `.apk` esté instalado**, tal como pedía la spec.

**Hallazgo #26 — el chofer puede cambiar su contraseña por sí mismo, y una jornada abierta que
está en Supabase pero no en el teléfono se recupera sola al entrar (2026-09-23)**:
`spec_deudas_app_movil.md`. Cierra el punto que el Hallazgo #25 había dejado fuera de alcance
(cambio voluntario) y la deuda del #5 (jornada huérfana tras perder la base local). Las dos partes
entran en el mismo `.apk` — no hay ningún chofer onboardeado todavía, así que es el momento más
barato para pagarlas.

- **Parte A — cambio voluntario**. `cambiarContrasenaVoluntaria()` (`authService.ts`), nueva
  pantalla `CambiarContrasenaScreen.tsx`, entrada en el header junto a "Salir" (no en el camino de
  Check-in/Historial).
  - ⚠️ **La contraseña actual se verifica de verdad, no solo se pide**: `updateUser()` de Supabase
    no la comprueba — cambia la contraseña de quien tenga sesión válida, sin preguntar nada. La
    verificación real es un segundo `signInWithPassword()` con la contraseña que el chofer dice
    tener; si el servidor la rechaza, se corta ahí, antes de tocar nada. Confirmado contra la base
    real: una contraseña actual incorrecta se rechaza SIN afectar la contraseña real (que sigue
    funcionando después del intento fallido); la correcta permite el cambio, la vieja deja de
    servir y la nueva funciona.
  - ⚠️ **Diagnóstico que decidía el diseño entero (Fase 1, confirmado leyendo el código): el
    logout NO toca la base local.** `cerrarSesion()` (`authService.ts`) solo llama a
    `supabase.auth.signOut()`; `AuthContext.cerrarSesion()` además borra la clave
    `app_transp_usuario` de `SecureStore` — ninguno de los dos toca SQLite
    (`jornadasRepo.ts`/`database.ts`). Y ninguna de las dos funciones de cambio de contraseña
    (obligatoria del #25, voluntaria de acá) llama a `signOut()` ni invalida la sesión — el token
    vigente sigue sirviendo después de `updateUser()`. Con esto confirmado, cambiar la contraseña
    con una jornada abierta sin sincronizar no pone en riesgo esa jornada — no porque se haya
    blindado nada nuevo, sino porque el mecanismo que podía arriesgarla (logout limpiando SQLite)
    no existe.
  - `debe_cambiar_contrasena` no se toca en el cambio voluntario (ya está en `false`, si no esta
    pantalla ni se vería — la obligatoria del #25 manda mientras esté en `true`) — un cambio por
    voluntad propia no es un reseteo, no debe volver a exigir nada.
  - Mismas reglas de contraseña que el cambio obligatorio del #25 (mínimo 6 caracteres, sin
    inventar una segunda regla) — un aviso explícito, antes de confirmar (no después), dice que si
    el chofer olvida la contraseña nueva nadie puede devolvérsela: el correo es sintético, la
    única salida es un reseteo desde el Dashboard.
- **Parte B — recuperación automática de una jornada abierta**. Nueva función
  `recuperarJornadasAbiertas()` (`syncService.ts`), enganchada al mismo ciclo de revisión de 15s
  que ya tenía `NetworkContext.tsx` (junto a la sincronización y la reconciliación del #9) —
  automática, no a pedido: un chofer apurado no confirmaría un cartel, y el costo de ese "no" es
  una jornada que ya no se puede cerrar nunca.
  - ⚠️ **Por qué el mecanismo del #9 (`reconciliarJornadasAbiertas`) no cubría esto — confirmado
    leyendo el código, no asumido**: ese mecanismo recorre `obtenerJornadasParaReconciliar()`, que
    lee de SQLite LOCAL y pregunta por cada una a Supabase — si la base local está vacía
    (desinstalación, Android limpiando almacenamiento, teléfono nuevo), no hay nada sobre lo que
    iterar y devuelve `[]` sin error: funciona perfecto y no encuentra nada, que es distinto de
    fallar. `recuperarJornadasAbiertas()` es la contraparte que faltaba: consulta a Supabase **por
    chofer** (`eq("chofer_id", ...)`), no por id — así encuentra jornadas que el teléfono nunca
    llegó a conocer.
  - ⚠️ **La recuperación resultó ser COMPLETA, no parcial — corrigiendo la propia hipótesis de la
    spec, confirmado leyendo `subirJornada()` (`syncService.ts`), no asumido.** La spec sospechaba
    que las fotos del check-in podían no viajar hasta el cierre. No es así: `subirJornada()` sube
    y hace upsert de TODOS los campos de check-in (fotos incluidas) la PRIMERA vez que sincroniza,
    sin importar si la jornada sigue abierta o ya se cerró — solo los campos de CIERRE están
    condicionados a `estado === "cerrada"`. Una jornada que llegó a sincronizar al menos una vez
    antes de perderse localmente se recupera completa. Verificado contra Supabase real: una
    jornada de prueba insertada como "ya sincronizada" trajo `foto_tacometro_inicial_url` (y
    `foto_ruta_url`, cuando existía) ya poblada en la consulta de recuperación — no hizo falta
    ninguna decisión de negocio sobre "cerrar sin evidencia" porque la evidencia sí está. El límite
    real, sin arreglo posible, es el anterior: un check-in hecho sin señal que nunca llegó a
    sincronizar, en un teléfono que se limpió, no está en ningún lado.
  - **Un chofer puede tener varias jornadas abiertas en paralelo** (ya documentado en el código
    existente, `obtenerJornadasAbiertas()` — "Tarea 6") — confirmado con la consulta real trayendo
    2 jornadas abiertas simultáneas del mismo chofer de prueba. La identificación de "misma
    jornada" para no duplicar es por `id` (el uuid generado en el dispositivo al hacer check-in,
    primary key en los dos lados) — nunca se pisa una jornada local existente: solo se INSERTAN
    las que Supabase tiene y SQLite no, nunca se actualiza una que ya está.
  - `insertarJornadaRecuperada()` (`jornadasRepo.ts`) completa `fotoTacometroInicialUri`/
    `fotoRutaUri` (NOT NULL en el esquema local) con la URL remota — mismo criterio que ya
    establecía `sobrescribirCierreRemoto()` para el lado del check-out: a
    `<Image source={{uri}}>` le da igual si `uri` es un archivo local o una URL de Supabase
    Storage. `sincronizacion = 'sincronizado'` de entrada, para que el ciclo de subida no intente
    resubir lo que ya nació sincronizado.
  - El aviso en pantalla (`Alert.alert`, sin sumar ninguna librería) lo dispara
    `useJornadasAbiertas.ts` al detectar una tanda nueva recuperada — reusa el mismo puente que ya
    tenía para la reconciliación del #9, agregando el aviso que la reconciliación no necesita (esa
    corrige algo que el chofer no tiene por qué notar; esto es una jornada entera que reapareció).
- **Verificación**: `npx tsc --noEmit`/`lint`/`format:check` limpios en la raíz (único
  sub-proyecto tocado). Contra Supabase real, con un chofer de prueba (borrado en los dos sistemas
  al terminar): el ciclo completo de la Parte A (contraseña incorrecta rechazada sin efecto
  secundario, cambio correcto, vieja rechazada, nueva funciona, `debe_cambiar_contrasena` se
  mantiene en `false`); la consulta exacta de recuperación de la Parte B contra 2 jornadas
  abiertas de prueba insertadas directo en Supabase, trayendo las 2 con las fotos de check-in ya
  pobladas.
  - **No verificado desde este entorno** (sin dispositivo disponible): la UI real de las dos
    pantallas nuevas, `idsJornadasExistentes()`/`insertarJornadaRecuperada()` corriendo contra
    SQLite real (expo-sqlite es un módulo nativo, no ejecutable en un proceso Node de este
    entorno), el `Alert.alert` disparando en pantalla, y sobre todo **la prueba que define la
    Parte B y que la spec pide explícitamente no saltear**: desinstalar la app con una jornada
    sincronizada, reinstalar, entrar, y confirmar que la jornada aparece y se puede cerrar. Todo
    esto requiere el `.apk` nuevo instalado — sigue sin haber ningún chofer real onboardeado, así
    que no hay apuro que lo fuerce a saltearse esta verificación.

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

- ⚠️ **`Input`/`Select` (`components/ui/`) no cumplen el piso de 44px de alto en mobile**
  (encontrado 2026-09-22 revisando `spec_flota_vehiculos.md`, que daba esto por resuelto). El
  Hallazgo #11 corrigió la FUENTE de los dos (`text-sm` → `text-base md:text-sm`, evita el zoom
  automático de Safari/iOS al enfocar) pero no el ALTO, que sigue fijo en `h-9` (36px) en
  cualquier tamaño de pantalla — a diferencia de `Button`, que sí tiene variante mobile (`h-11
  md:h-9`). Es parejo en TODO el Dashboard (todo formulario que use estos dos componentes,
  incluido `editar-jornada-dialog.tsx` desde antes de esta fecha), no algo nuevo de ninguna spec
  puntual — por eso ninguna spec debería corregirlo en soledad (dejaría esa pantalla inconsistente
  con el resto). Arreglo, si se decide hacerlo: sumar `h-11 md:h-9` a los dos componentes
  compartidos, una vez, con el mismo criterio que ya tiene `Button`.
- ✅ **Resuelto (2026-09-22): `Database` generado y enganchado en los dos `createClient` — chequeo de
  nombres de columna encendido en toda consulta Supabase del Dashboard.** Cerraba la deuda anotada
  arriba en esta misma sección al revisar el escape de tipos del Hallazgo #21. `npm run
  types:supabase` (`dashboard/package.json`) genera `dashboard/lib/supabase/database.types.ts`
  contra el proyecto real (`npx supabase gen types typescript --project-id ... | prettier --write`)
  y los dos `createClient<Database>(...)` (`lib/supabase/client.ts`, `lib/supabase/server.ts`) ya lo
  usan.
  - ⚠️ **El esquema versionado venía mintiendo — confirmado, no solo temido.** Comparando el
    `Database` generado (la base real) contra `supabase/schema.sql`: a `jornadas` le faltaban ahí
    `fue_editado`, `editado_por`, `editado_en`, `motivo_edicion` — agregadas por
    `schema_v5_edicion_jornadas.sql`, nunca plegadas de vuelta al archivo base, a diferencia de
    `schema_v3`/`schema_v4`, que sí lo estaban. El resto (`choferes`, `admins`,
    `ubicaciones_tracking`, las vistas `ultimas_posiciones`/`ubicaciones_tracking_planas`, la función
    `insertar_ubicacion`) coincide exacto.
  - ✅ **Resuelto (2026-09-22, commit aparte)**: las 4 columnas se plegaron a la definición de
    `jornadas` en `supabase/schema.sql`, siguiendo el mismo criterio ya usado con `schema_v3`/`v4`
    — se pliega la columna al `create table`, y el archivo de migración (`schema_v5_edicion_
    jornadas.sql`) queda donde está, sin tocar, como documentación histórica (no se borra ni se
    anota "ya incorporado" — ninguno de los dos anteriores lo tenía tampoco). El motivo no era de
    prolijidad: alguien reconstruyendo la base desde `schema.sql` en un entorno nuevo obtenía una
    `jornadas` sin las columnas de auditoría, y `POST /api/jornadas/editar` se habría roto al
    primer uso — son justo las columnas que registran quién corrigió qué en un sistema de pagos.
  - **1 solo error de compilación al encender el genérico** (mucho menos de lo esperado): en
    `app/api/jornadas/editar/route.ts`, el objeto dinámico de `.update(...)` estaba tipado
    `Record<string, unknown>` — demasiado laxo para el `Update` real de `jornadas`. Se tipó como
    `TablesUpdate<"jornadas">` (del propio `database.types.ts`) en vez de silenciarlo — ahora cada
    asignación dinámica a ese objeto (`actualizacion.foo = ...`) también verifica contra columnas
    reales.
  - ⚠️ **El `as unknown as` de `aplicarFiltrosJornadas` se pudo sacar del todo — pero no por las
    buenas, a la primera.** Un primer intento (genérico auto-referenciado `Q extends {ilike(columna:
    string, ...): Q, ...}`, sin ningún cast) compiló limpio — el error "excessively deep" que motivó
    el cast original no reapareció con el `Database` ya generado. Probado con el mismo typo
    deliberado que pide la Fase 3 de la spec (`"chofer_nombr"`): **`tsc` no lo atrapó.** Causa: la
    constraint tipaba `columna` como `string` suelto — dentro del cuerpo de una función genérica,
    TypeScript solo ve la constraint declarada, nunca el tipo real con el que el llamador instancia
    `Q`, así que esa primera versión quedó tan sin verificar como antes de esta tarea entera, aunque
    compilara limpio. Corregido tipando `columna` contra
    `keyof Database["public"]["Tables"]["jornadas"]["Row"]` en la constraint — con eso, el mismo
    typo SÍ lo rechaza `tsc` (confirmado de nuevo, y revertido). El cast desapareció igual: la
    solución final no lo necesita.
  - **Segunda prueba de typo, fuera de `jornadas`**: `"email"` → `"emial"` en la consulta a `admins`
    de `app/api/auth/login/route.ts` (no pasa por `aplicarFiltrosJornadas`) — `tsc` lo rechazó igual,
    confirmando que la verificación llegó a todo el Dashboard, no solo al filtro compartido.
    Revertido.
  - **Verificado además contra la base real, no solo contra tipos**: `.from("jornadas").select("*",
    {count:"exact"})` y `.from("ultimas_posiciones").select("*")` corridos con la service_role key
    real devolvieron datos (26 jornadas, 5 posiciones) — confirma que envolver `Database` en
    `createClient` no cambió ningún comportamiento en runtime (los genéricos de TypeScript se borran
    al compilar). Se probó también un login real: se insertó un admin de prueba temporal, se
    verificó que la consulta + `bcrypt.compare` corrieron bien contra Supabase real (falló después,
    al firmar la cookie, por `DASHBOARD_SESSION_SECRET` ausente del `.env.local` local — nada que ver
    con este cambio, la variable solo está configurada en Render), y se borró el admin de prueba al
    terminar.
  - `npx tsc --noEmit`, `npm run lint`, `npm run format:check` limpios en `dashboard/` con todo lo
    de arriba aplicado.
  - **Mantenimiento operativo**: `npm run types:supabase` (regenera + formatea en un solo comando) y
    la regla "regenerar al cambiar el esquema" escrita junto a `supabase/schema.sql`, no solo acá —
    donde la vea quien lo cambie. `dashboard/.gitignore` y el `.gitignore` de la raíz ignoran
    `supabase/.temp/` (caché local que deja el CLI al correr el comando, no es parte del esquema
    versionado).
- Nominatim, desde 2026-09-10 (ver §4), corre contra su servidor demo público y gratuito, no una
  instancia propia — ver la advertencia en esa sección. Si el uso crece mucho, evaluar alojar una
  instancia propia o un proveedor pago. (El trazado de rutas ya no depende de un servidor demo desde
  el 2026-09-13 — ver más abajo y §4: se migró a Geoapify, con plan gratuito de 3.000 créditos/día.)
- ✅ **Pings de GPS duplicados — mitigado en origen (2026-09-14)**, previamente deuda técnica
  abierta desde 2026-09-13 (ver §4, "Trazado histórico de rutas"): `ubicaciones_tracking` podía
  tener filas con lat/lng/timestamp exactamente idénticos repetidos hasta 5 veces para un mismo
  ping real. La sospecha inicial (`useSeguimientoGPS.ts`: el `useEffect` de
  `Location.watchPositionAsync` no cancelaba bien la suscripción anterior si se remontaba rápido) se
  **descartó con evidencia**: el patrón `cancelado` (flag por closure) + `suscripcionRef` (`useRef`,
  no una variable local) en la limpieza es justamente el diseño robusto contra esa race — la
  limpieza siempre lee `suscripcionRef.current` en el momento en que corre, nunca un valor
  obsoleto. Tampoco es un problema de dependencias inestables (`usuario` solo cambia de referencia
  en login/logout; `claveJornadas` sale de una consulta SQLite con `ORDER BY fechaCheckIn DESC`
  estable). Revisando pings reales de varias jornadas/choferes/días (vía `service_role`): los
  duplicados aparecían **incluso con una sola jornada activa** (descarta que fuera por solapamiento
  de jornadas concurrentes cambiando `claveJornadas`), en ráfagas de tamaño variable (x1 a x5) que
  tienden a agruparse después de una brecha de varios minutos sin pings, o justo antes del
  check-out — consistente con que el proveedor de ubicación del SO reentregue una posición
  cacheada/reciente al reanudar la entrega de actualizaciones (la app solo trackea en primer plano,
  así que volver de segundo plano es un candidato natural), más que con un bug de este efecto — pero
  el mecanismo nativo exacto **no se pudo confirmar** sin logs de dispositivo en vivo, fuera del
  alcance de esta corrección. Ante esa incertidumbre, `useSeguimientoGPS.ts` ahora filtra en origen:
  compara cada posición nueva contra el último ping efectivamente enviado (mismo criterio exacto que
  `quitarPingsDuplicados` del lado del Dashboard — lat+lng+timestamp idénticos) y descarta el envío
  si coincide, con un `console.warn` para poder confirmar en logs si sigue pasando. El filtro
  defensivo del lado del Dashboard (`ruta-jornada-match/route.ts`) se mantiene igual — sigue siendo
  la red de seguridad para filas ya guardadas antes de este fix, o si el mecanismo nativo vuelve a
  aparecer por otra vía.
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
