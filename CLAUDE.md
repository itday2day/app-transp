# CLAUDE.md — app-transp (Day2Day)

Sistema de control de jornadas y flotas para choferes de carga. Tres proyectos independientes sobre un mismo backend Supabase.
Detalle histórico completo (diagnósticos, mediciones, verificaciones): `contexto_proyecto.md`. **No lo leas entero**; busca con grep por `Hallazgo #N` o por palabra clave solo cuando el tema lo requiera.

## Cómo trabajar

- Pregunta antes de asumir. Respuestas y comentarios en español.
- Metodología SDD: Fase 1 especificación (aprobación explícita del usuario antes de tocar código) → Fase 2 implementación → Fase 3 verificación.
- Lee solo los archivos que necesitas; no recorras carpetas enteras.
- Diagnostica midiendo (dispositivo real, base real), no solo leyendo código. Varios bugs se resolvieron así.
- Publicar una actualización OTA (`eas update`) o generar builds: solo con aprobación explícita.

## Estructura

| Carpeta        | Qué es                                                                                                    | Stack                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/` (raíz)  | App móvil de choferes (check-in/out, fotos, km, combustible, GPS, incidencias)                            | Expo ~57, React Native 0.86, TypeScript estricto            |
| `dashboard/`   | Panel administrativo (mapa en vivo, jornadas, corrección con auditoría, flota, choferes, empresas, Excel) | Next.js 16 App Router, Tailwind v4, TanStack Query, Leaflet |
| `server/mock/` | Único servidor que corre: `POST /reports/export-excel` (ExcelJS + Resend)                                 | Node + Express                                              |
| `server/src/`  | Referencia obsoleta, NO usar como fuente de verdad                                                        | —                                                           |
| `supabase/`    | `schema.sql` + migraciones `schema_vN_*.sql`                                                              | PostgreSQL + PostGIS + RLS                                  |

Infra: Supabase real (cuenta `it@day2day.es`), Render plan free (dashboard en `app.day2day.es` y `app-transp-dashboard.onrender.com`; mock server aparte), GitHub `itday2day/app-transp` rama `master` con auto-deploy, Geoapify (rutas), Nominatim (geocodificación), Resend (correo).

## Verificación antes de cerrar cualquier tarea

Cada sub-proyecto tiene su propio tsconfig/eslint/prettier. En **cada uno que toques** (raíz, `dashboard/`, `server/mock/`):
`npx tsc --noEmit` + `npm run lint` + `npm run format:check`

## Reglas que no se rompen

### Git, despliegue y datos

- **Nunca** `commit`/`push`/`stash`/`reset`/`--amend`/`git add -A` sin aprobación explícita del usuario, cada vez. `git add` siempre con rutas explícitas (una por archivo, nunca `-A`). `git commit -F <archivo UTF-8>` (nunca `-m` en la shell, pisa tildes). `master` tiene auto-deploy en Render: un push ya es un despliegue real.
- `eas build`/`eas update`: solo con aprobación explícita (ver arriba).
- Ningún dato personal real (DNI, teléfono, correo, nombre completo) en logs, informes ni mensajes de commit — usar ids cortos de 8 caracteres.
- Cuando una tarea incluye una migración de Supabase: el orden de despliegue es **migración → Dashboard → app**. El administrador tiene que poder operar con el esquema nuevo antes de que los choferes reciban una app que dependa de él.

### Supabase: cómo se aplica una migración

- Las escrituras por MCP (`apply_migration`, `execute_sql` de escritura) se rechazan en este entorno: la confirmación del MCP no le llega al usuario. Vía real: un único script `.sql` pensado para pegarse completo en el SQL Editor de Supabase, con esta estructura fija: `begin;` → guardia (`do $$ ... end $$;` que aborta si el estado previo no es el esperado) → el contenido literal de la migración → registro manual en `supabase_migrations.schema_migrations` → `commit;` → una verificación final (un `SELECT`) como **última** sentencia, porque el editor solo muestra el resultado de la última.
- El SQL Editor convierte LF a CRLF al pegar — cualquier comparación de texto contra una definición guardada (`pg_get_functiondef`, etc.) tiene que descartar `chr(13)` antes de comparar.

### Catálogo por chofer (empresas/rutas)

- Cada chofer solo lee (RLS) las empresas/rutas vinculadas a él: tablas `chofer_empresas`/`chofer_rutas` con FK compuestas (`(chofer_id, empresa_id)`/`(ruta_id, empresa_id)`), sin función única de escritura.
- Un trigger `AFTER INSERT` en `jornadas` crea y vincula como «pendiente de revisión» la empresa/ruta nueva que el chofer escribe en una jornada (nunca falla el guardado de la jornada si el trigger falla).
- `renombrar_empresa`/`renombrar_ruta`/`fusionar_empresas`/`fusionar_rutas`: funciones `EXECUTE` solo para `service_role` (revocado explícitamente a `anon`/`authenticated`, no basta con revocar `PUBLIC` — el default ACL del proyecto les da `EXECUTE` a los tres en cada función nueva).
- La lista que ve la app = lo que la base le entrega a ese chofer + lo que agregó localmente (tabla `catalogoLocalPendiente`, se limpia sola cuando el servidor ya trae ese nombre).

### App móvil

- **Nunca módulos nativos nuevos** (`AsyncStorage`, `expo-file-system`, `expo-localization`, sliders nativos…). Exigen rebuild. Usar `almacenamientoSeguro.ts`. Si hay cambio nativo: subir `version` en `app.json` (runtimeVersion = `appVersion`, jamás `fingerprint`) y generar `.apk` nuevo.
- **Offline-first**: escribir primero a SQLite local, sincronizar después. La sincronización debe ser **idempotente**: reintentar desde cualquier punto de corte nunca pierde ni duplica datos.
- Un intento sin red no cuenta para el tope `MAX_INTENTOS` (5).
- Estilos y colores solo desde `src/theme/` (tokens Day2Day). Sin `any`: navegación tipada con `src/navigation/types.ts`.
- Si envuelves un hijo flex en un `Pressable`/`View` nuevo, el wrapper necesita el mismo estilo de tamaño (regresión silenciosa #49).
- El chofer se registra en la app con una invitación generada en el Dashboard (código de 8 caracteres o enlace); `RegistroScreen.tsx` la valida y el trigger `crear_chofer_desde_invitacion()` la consume al crear la cuenta. No hay alta libre sin invitación.

### Dashboard web

- No usa Supabase Auth: cuentas individuales en tabla `admins` (bcrypt) + cookie HMAC firmada con `DASHBOARD_SESSION_SECRET`. `editado_por` sale de la sesión, nunca de un campo libre.
- `service_role` solo del lado servidor (`lib/supabase/server.ts`, `server-only`). Nunca al navegador.
- Mapa en vivo = polling cada 8 s, **no** Supabase Realtime (RLS).
- **Leaflet**: el `MapContainer` va con `absolute inset-0` dentro de un padre `relative`. Nunca `h-full` si el alto del padre sale de flexbox.
- Responsive: layout mobile/desktop corta en **`lg` (1024px)**, no `md`. Fuente 16px en inputs móviles (`md:text-sm`), áreas táctiles ≥44px, `dvh` en vez de `vh`. En teléfono horizontal las barras superiores no pasan de ~100px; los controles van en columna lateral de 128px.
- Los campos `<input type="date">` en ancho estrecho se prueban en **iPhone real** (Safari no respeta `w-full`); usar ancho explícito.
- Filtros compartidos: `aplicarFiltrosJornadas()` (`lib/jornadas-filtro.ts`) lo usan tabla y exportación. **Lo exportado = lo que muestra la tabla.** Tope 5000 jornadas por reporte, con chequeo de truncamiento en servidor y cliente.
- Tras cambiar el esquema de Supabase: `npm run types:supabase` y plegar la migración a `schema.sql`.

### Fechas y horas (Hallazgos #17–#20)

- Siempre `timeZone: "Europe/Madrid"`, locale `es-ES`, `hour12: false`, explícitos. Nunca depender del navegador ni de Render (UTC).
- Rangos de fecha = días de calendario de Madrid, intervalo semiabierto (`>= inicio`, `< finExclusivo`); la conversión a UTC ocurre solo en el servidor (`lib/rango-fechas-espana.ts`, `lib/hora-espana.ts`).
- Excel: fechas, horas y duraciones son valores numéricos con formato, construidos a mano desde componentes de Madrid (no pasar un `Date` a exceljs). Duración en formato `[h]:mm`.

### Datos

- Matrícula: 7 caracteres, mayúsculas, sin separadores (`normalizarMatricula`); unicidad real por índice sobre la forma normalizada, también para vehículos de baja (se reactivan, no se duplican).
- DNI: 9 caracteres normalizado, `UNIQUE`. Teléfono del chofer: E.164 (`^\+[1-9]\d{7,14}$`).
- `numero_empleado` + correo sintético (`apptransp.chofer.{numero}.f83a1c@gmail.com`, `numeroEmpleadoAEmail()`) es un camino **legado**, no el principal: hoy solo lo usa un chofer (el "01"). Los choferes nuevos se registran por invitación con correo real; `identificadorACorreo()` decide cuál camino tomar en el login.
- Chofer: contraseña temporal generada en servidor, mostrada una sola vez; `debe_cambiar_contrasena` fuerza el cambio en el primer ingreso. Dar de baja = `activo=false` + ban en Auth (no es instantáneo en teléfonos offline).
- **La corrección del administrador gana**: trigger en BD y `campos_editados_admin` protegen los campos corregidos; la app los baja con `sincronizarCambiosDelServidor()`.
- Las vistas de tracking solo las lee `service_role` (revocadas a `anon`/`authenticated`).

### Plataforma

- Render free: cold start (502 que se resuelve al reintentar) y 429 de borde Cloudflare (no es bug del código; diagnóstico con `curl -i` a `GET /` y a `POST /reports/export-excel` con `{}`). SMTP bloqueado: el correo sale por la API HTTPS de Resend.
- Dominio `day2day.es` verificado en Resend (2026-09-15): el export de reportes manda desde `reportes@day2day.es` a destinatarios reales. `RESEND_FROM_EMAIL` vive en el servicio `app-transp-mock-server` (el que llama a la API de Resend desde `server/mock/reportes.js`), **no** en el del Dashboard — son dos servicios con id casi idéntico.

## Hallazgos: una línea por regla

- #11–#16: móvil del Dashboard (Leaflet, selector Mapa/Lista, sin scroll de página, columna lateral).
- #17–#20: zona horaria y formato de fecha/hora, de punta a punta.
- #21: exportación idéntica a la tabla, con contador previo y hoja "Filtros".
- #23: `Database` generado en supabase-js; ver agujero abajo.
- #24–#25, #33–#34, #38: flota, alta de choferes, normalización de DNI/matrícula/teléfono, selector de país.
- #26–#29, #39: recuperación de jornadas, sincronización reintentable, historial tras reinstalar.
- #28: corrección del admin gana (trigger + descarga al teléfono).
- #32: Administración puede crear jornadas desde el Dashboard.
- #36, #40, #41, #49: UI (empresa como dato principal, modo Ver/Editar, identidad Day2Day, visor de fotos).
- #51, #52, #54: identificador real del chofer en reportes, seguridad de vistas, fechas en Safari.

## Deuda y pendientes abiertos

- `npm run types:supabase` no detecta drift en policies, triggers, índices ni constraints; hay que comparar a mano `schema_v*.sql` con `schema.sql`.
- `desfaseMinutos()` duplicado en `rango-fechas-espana.ts` y `hora-espana.ts`: extraer a un módulo compartido la próxima vez que se toque cualquiera de los dos.
- Candidato #53: `ON DELETE CASCADE` en `jornadas`/`ubicaciones_tracking` al borrar un chofer; probablemente pasar a `RESTRICT` (sin spec aún).
- Reporte Excel: máximo 3 fotos de incidencia por jornada. Nominatim usa el servidor demo público.
- Pendiente confirmar que la cuenta de Resend sea `it@day2day.es`. iOS sin build propio.
