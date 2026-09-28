# Hallazgos del piloto — app-transp

_Historial técnico completo. El plan operativo (checklist previo y desarrollo del piloto) vive
aparte, en `plan_despliegue_piloto.md`; este documento es el registro de qué se rompió, por qué, y
cómo se confirmó que quedó arreglado._

### 1. Ruta histórica no coincide con el camino real (detectado 2026-09-12, resuelto definitivamente 2026-09-13, deuda técnica asociada cerrada y confirmada en dispositivo real 2026-09-14)

Al revisar la ruta de una jornada ya cerrada en `/mapa`, el trazado seguía calles reales pero por un
camino distinto al que el chofer efectivamente recorrió. Este fue el hallazgo más largo del piloto:
se fue diagnosticando y corrigiendo en capas, cada una confirmada contra la API real, no asumida.

**Primera causa (parcial)**: `dashboard/lib/osrm.ts` usaba el servicio `/route` de OSRM (ruta óptima
entre paradas deliberadas) en vez de `/match` (Map Matching, hecho para ajustar una traza de GPS al
camino real). Se corrigió el 2026-09-12/13, pero el síntoma persistió con una variante distinta: la
ruta pasaba directamente por encima de edificios.

**Segunda causa (confirmada probando contra la API)**: `MAX_PUNTOS_OSRM` seguía en `100`,
un valor calibrado para el límite de largo de URL del viejo `/route`. El servidor demo público de
OSRM limita `/match` por **cantidad de puntos**, no por largo de URL — confirmado a mano: 10 puntos
responde `200 Ok`, 11 puntos responde `400 TooBig`. Cualquier jornada de más de ~3 minutos de
tracking (ping cada ~20s) ya mandaba más de 10 puntos, así que `/match` fallaba silenciosamente el
100% de las veces y el sistema quedaba siempre en el fallback de línea recta — por eso el primer fix
no se notaba.

Fix: `MAX_PUNTOS_OSRM` bajado a `10`, documentado como límite específico de esta instancia
demo (no del protocolo OSRM). Con este fix la prueba real seguía mostrando una línea recta, con un
error distinto en consola (`NoMatch`), lo que llevó a la tercera causa.

**Tercera causa (confirmada probando contra la API con datos reales de una jornada)**: la
jornada de prueba (`50d7f66e-bfbf-4e35-839b-a2d9df3b8068`) tenía 9 filas de pings guardadas, pero
solo 3 posiciones/horarios realmente distintos — el resto eran copias exactas (mismo lat/lng/timestamp
bit a bit), repetidas hasta 5 veces. Esos duplicados exactos rompen el Hidden Markov Model de
`/match`. Se probó subir el radio (50/100/200m) como alternativa y se descartó con evidencia: no
soluciona el `NoMatch` y, por encima de 25m, el servidor devuelve un error distinto de radio.

Fix: `dashboard/lib/osrm.ts` filtró los pings consecutivos con lat+lng+timestamp idénticos
(`quitarPingsDuplicados`) antes de armar la traza. Con este fix, las jornadas cortas ya mostraban
`code: "Ok"`, pero en jornadas largas el trazado seguía sin ser preciso (ver cuarta causa).

**Cuarta causa**: con una sola llamada a `/match` de máximo 10 puntos totales, la dirección general
de un trayecto largo quedaba bien, pero se perdían las vueltas y calles intermedias entre esos 10
puntos tan espaciados (`/match` respondía `code: "Ok"`, sin ningún error, pero con muy poco detalle
real). Fix intermedio: se partió el trayecto en tramos consecutivos de hasta 10 puntos con
solapamiento (`OSRM_MAX_TRAMOS`), llamando a `/match` una vez por tramo en secuencia — funcionó
(verificado con una jornada larga simulada: 4 tramos, 231 puntos de trazado real), pero era una
solución con bastante superficie de código alrededor de una limitación ajena (el límite de 10 puntos
del servidor demo de OSRM, no documentado oficialmente).

**Causa raíz de fondo y solución definitiva**: se evaluaron alternativas de proveedor (Mapbox Map
Matching, Geoapify, autohospedar OSRM — ver especificación técnica guardada en este proyecto) y se
migró por completo de OSRM a **Geoapify Map Matching**, que acepta hasta 1.000 waypoints por llamada
(100x el límite de OSRM) con plan gratuito de 3.000 créditos/día sin tarjeta — alcanza con una sola
llamada para prácticamente cualquier jornada real, eliminando toda la lógica de tramos.

Cambios (commit `6f100e4aee41175bafd43f35c8aed57c34c2220d`):
- La llamada pasó del navegador al servidor (`dashboard/app/api/tracking/ruta-jornada-match/route.ts`,
  nuevo) porque Geoapify exige una API key que no debe quedar expuesta en el cliente.
  `dashboard/lib/osrm.ts` se eliminó; `dashboard/lib/ruta-matching.ts` lo reemplaza como cliente
  delgado que solo llama al nuevo endpoint.
- `quitarPingsDuplicados` se mantuvo sin cambios de criterio.
- Sin `GEOAPIFY_API_KEY` configurada, con menos de 2 pings únicos, o si la llamada falla, cae al
  mismo fallback de línea recta de siempre, con `console.error` en los logs de Render.
- Hallazgo de paso: `dashboard/.env.example` nunca se había subido al repo por una falta de excepción
  en `dashboard/.gitignore` (`.env*` estaba ignorado sin el `!.env.example` que sí tiene el
  `.gitignore` de la raíz) — corregido, ya trackeado.
- Verificado contra la API real de Geoapify (no solo contra la documentación): la respuesta es un
  `FeatureCollection` con geometría `MultiLineString` (distinto del `LineString` único de OSRM);
  Geoapify no tiene un parámetro de radio/precisión equivalente al `radiuses` de OSRM, maneja su
  propia tolerancia internamente. Probado con la misma ruta simulada de 10.4 min/32 pings: una sola
  llamada (835ms), 225 puntos de trazado real (comparable a los 231 puntos que daban 4 llamadas
  secuenciales de OSRM). Probado también con los pings reales de la jornada que rompía con `NoMatch`
  (gap real de 29 minutos entre pings) — Geoapify los matcheó sin problema.

Verificado en Render: commit `6f100e4aee41175bafd43f35c8aed57c34c2220d` está desplegado y **live** en
producción (deploy `dep-dajhhhvqj5pc73dlfcgg`). **Confirmado por el usuario con jornadas largas
reales en `/mapa` y en el modal "Ver ruta": el trazado funciona correctamente.**

**Deuda técnica asociada (causa #3), diagnosticada, corregida en origen y confirmada en dispositivo
real (2026-09-14)**: la sospecha original documentada — que el `useEffect` de `useSeguimientoGPS.ts`
no cancelaba bien la suscripción anterior de `Location.watchPositionAsync` — se investigó a fondo y
**se descartó con evidencia**: el patrón `cancelado` (flag por closure) + `suscripcionRef` (`useRef`)
en la limpieza es el diseño correcto contra esa race; tampoco había dependencias inestables en el
efecto. Revisando pings reales de varias jornadas, choferes y días (no solo la ya conocida), los
duplicados aparecían incluso con una sola jornada activa, en ráfagas de tamaño variable (x1 a x5)
agrupadas típicamente después de una brecha de varios minutos sin pings o justo antes del check-out
— consistente con que el proveedor de ubicación del sistema operativo reentrega una posición cacheada
al volver de segundo plano. El mecanismo nativo exacto no se pudo confirmar sin logs de dispositivo
en vivo.

Fix aplicado en `src/hooks/useSeguimientoGPS.ts`: se compara cada posición nueva contra el último
ping efectivamente enviado, y se descarta el envío si coincide exactamente (mismo criterio que
`quitarPingsDuplicados` del Dashboard, pero ahora en origen, antes de escribir la fila), con un
`console.warn` para poder confirmar en logs si el patrón sigue apareciendo. `tsc`/`lint`/`format:check`
limpios.

**Confirmado en dispositivo real con el `.apk` nuevo**: jornada de prueba con 4 pings, 4 timestamps
únicos, cero duplicados — incluyendo el escenario exacto que antes producía ráfagas (una brecha de
casi 5 minutos entre el segundo y el tercer ping, 11:55:12 → 12:00:36, compatible con paso a segundo
plano). **Hallazgo #1 y su deuda técnica asociada quedan completamente cerrados.**

### 2. Pedido: ver la ruta de cualquier jornada desde su detalle en /jornadas (2026-09-13)

Hasta ahora "Ver ruta" solo estaba disponible en `/mapa`, atado a la jornada abierta actual del
chofer seleccionado en el panel de activos — no había forma de ver la ruta de una jornada ya cerrada
o pasada.

**Implementado**: botón "Ver ruta" en `jornada-detalle-dialog.tsx` (el modal de detalle de
`/jornadas`) que abre un modal nuevo y más grande con el mapa y el trazado de esa jornada puntual —
reutilizando el endpoint `/api/tracking/ruta-jornada` (ya genérico por jornada, no requiere que esté
activa) y la lógica de `use-ruta-jornada.ts` / `ruta-historica.tsx`, sin el polling de 8s del mapa en
vivo. Si la jornada no tiene pings registrados, se muestra un aviso en vez de un mapa vacío. Sujeto a
la misma corrección del hallazgo #1 (comparten el mismo módulo de matching).

### 3. Exportación de reportes fallaba tras configurar Resend: env var cargada en el servicio equivocado (detectado y resuelto 2026-09-15)

Después de verificar el dominio `day2day.es` en Resend, la primera prueba de exportación de reporte
falló dos veces seguidas, con dos errores distintos:

1. Primero, `502 Bad Gateway` del servidor de reportes — causa simple: el servicio estaba dormido
   (plan free, cold start) y todavía no había terminado de levantar cuando llegó el pedido. Se
   confirmó mirando los logs del propio servicio (`app-transp-mock-server`): el proceso recién quedó
   escuchando ~2 minutos después del pedido fallido. No era un problema real, solo había que
   reintentar una vez despierto.
2. Al reintentar, aparecio un `500` distinto, con el mensaje "No pudimos generar o enviar el
   reporte." — este sí era un error real. Los logs del servidor mostraron la causa exacta: Resend
   devolvía `403 Forbidden` con `"You can only send testing emails to your own email address..."`,
   es decir, seguía en modo sandbox pese a que el dominio ya estaba verificado.

**Causa raíz confirmada**: `RESEND_FROM_EMAIL=reportes@day2day.es` se había cargado en las env vars
de `app-transp-dashboard` (`srv-daf8j6tbedkc73889bo0`), pero el código que efectivamente llama a la
API de Resend (`enviarPorResend()` en `server/mock/reportes.js`) corre en un servicio distinto,
`app-transp-mock-server` (`srv-daf8j6tbedkc73889bn0`) — un ID que difiere en un solo carácter
(`...bo0` vs `...bn0`). El mock server nunca recibió la variable nueva y seguía usando el remitente
por defecto de Resend, sujeto a la restricción de sandbox.

Fix: se cargó `RESEND_FROM_EMAIL=reportes@day2day.es` en el servicio correcto
(`app-transp-mock-server`, merge, deploy `dep-dakh9ubm8hqs73ejp2jg`). **Confirmado por el usuario:
la exportación ya funciona de punta a punta.**

⚠️ Nota para el futuro: `app-transp-dashboard` y `app-transp-mock-server` tienen IDs de servicio en
Render casi idénticos (difieren en un solo carácter, `bo0`/`bn0`) — doble-chequear siempre a qué
servicio se le está cargando una variable de entorno antes de guardar, sobre todo variables
relacionadas con envío de correo/reportes, que viven en el mock server y no en el dashboard.

### 4. Servicio de Render duplicado `day2day-reportes` — eliminado (detectado y resuelto 2026-09-15)

Al revisar los servicios de Render durante el diagnóstico del hallazgo #3, apareció un tercer
servicio, `day2day-reportes` (`srv-daf9p0ht0dsc73d771f0`, región Frankfurt, creado 2026-09-07), con
el mismo repo, misma rama y el mismo comando de build/start (`cd server/mock && npm install` /
`npm start`) que `app-transp-mock-server` (región Oregon) — un duplicado del mismo servidor de
reportes.

**Confirmado antes de tocarlo**: no estaba en uso por el Dashboard — la llamada real de exportación
de reportes va a `app-transp-mock-server.onrender.com` (`MOCK_SERVER_URL` apunta al servicio
correcto), nunca a `day2day-reportes.onrender.com`. Además, a diferencia del servicio real (que tiene
`rootDir: server/mock`), `day2day-reportes` tenía `rootDir` vacío (apuntando a la raíz del repo), por
lo que se re-desplegaba en **cada commit del monorepo entero** — incluso cambios de solo el Dashboard
o la app móvil — gastando minutos de build del plan free sin ningún beneficio.

**Eliminado por el usuario en el dashboard de Render (2026-09-15)**, confirmado con
`list_services`: ya no aparece en la cuenta, quedan solo `app-transp-dashboard` y
`app-transp-mock-server`. Ítem cerrado.

### 5. Jornada abierta de un chofer "desaparece" de la app al reinstalar el `.apk` — no es un bug, es Android borrando el almacenamiento local (detectado y resuelto 2026-09-15)

El chofer Pau (número de empleado 04) tenía una ruta abierta (check-in hecho, sin check-out, desde
el 2026-09-04 16:00) cuando se le actualizó el `.apk` en el celular. Al volver a entrar a su perfil,
todo su historial había desaparecido de la app (tuvo que volver a loguearse) — pero la jornada
seguía apareciendo abierta, sin problema, en `/jornadas` del Dashboard.

**Causa confirmada**: la actualización se hizo **desinstalando la app vieja antes de instalar el
`.apk` nuevo**. Android borra automáticamente todo el almacenamiento privado de una app al
desinstalarla — tanto la base SQLite local (`src/db/`, donde vive el historial y las jornadas del
chofer, ver arquitectura offline-first en `contexto_proyecto.md` §3) como el almacenamiento seguro
de la sesión (`expo-secure-store`). Por eso desaparecieron ambas cosas juntas: no es un bug de
sincronización, es el comportamiento esperado de Android al desinstalar cualquier app. Supabase (la
fuente de verdad real) nunca perdió el dato — la jornada de Pau siguió intacta y abierta ahí todo el
tiempo, visible en el Dashboard.

**Resuelto — pero en dos pasos, porque el primero no alcanzó**: se usó "Corregir" en el modal de
detalle (`editar-jornada-dialog.tsx` / `POST /api/jornadas/editar`) para cargar km final (18000) y
combustible final (80) con un motivo de corrección explicando la causa. Esto guardó bien esos
valores y marcó `fue_editado = true` con el badge "Editado" — **pero la jornada siguió apareciendo
"abierta"** en la tabla y el check-out seguía en blanco en el detalle. Confirmado contra el esquema
real de la tabla `jornadas` (consulta a `information_schema.columns`): `estado` es una columna de
texto **independiente** de `fecha_check_out` (no se calcula sola a partir de si el check-out está
vacío), y **"Corregir" nunca tuvo un campo para completar `fecha_check_out` ni para cambiar
`estado`** — solo corrige empresa/matrícula/ruta/km/combustible. O sea: no existía ninguna forma de
cerrar una jornada abierta desde el Dashboard (ver Hallazgo #6, ya resuelto).

Se cerró la jornada con una corrección directa en Supabase (el usuario tenía acceso al SQL Editor;
el valor exacto de `estado` se confirmó de antemano con `select distinct estado from jornadas` →
`abierta`/`cerrada`, sin adivinar):

```sql
update jornadas
set fecha_check_out = '2026-09-13 11:05:00' at time zone 'Europe/Madrid',
    estado = 'cerrada'
where id = '262b7846-4fee-48d0-a4a4-a56d2f6affa5'
  and estado = 'abierta'
returning id, chofer_nombre, estado, fecha_check_in, fecha_check_out, km_final, combustible_final;
```

Confirmado con el `returning` de la propia consulta: `estado: cerrada`, `fecha_check_out:
2026-09-13 13:05:00+00` (11:05 hora de Madrid, convertida correctamente a UTC). **Jornada de Pau
cerrada de punta a punta.**

**Procedimiento corregido para futuras actualizaciones de `.apk`** (en el checklist del plan):
instalar el `.apk` nuevo **directo encima del anterior, sin desinstalar primero**. Mientras el
proyecto mantenga el mismo `applicationId` (`com.day2day.apptransp`) y el mismo keystore de firma de
EAS, Android reconoce esto como una actualización normal y preserva la base local y la sesión, en
vez de borrar todo.

⚠️ **Deuda técnica identificada, no urgente, sin resolver**: el sistema no tiene ninguna forma de que
la app "recupere" una jornada abierta desde Supabase si alguna vez pierde su base local por otro
motivo que no sea seguir el procedimiento de arriba (pérdida del celular, reset de fábrica, borrado
manual de datos de la app, etc.) — hoy la vía de recuperación en esos casos es una corrección manual
desde el Dashboard (ver Hallazgo #6). Quedaría bien evaluar en una spec futura si conviene que la
app, al loguearse con una base local vacía, consulte a Supabase si el chofer tiene una jornada
abierta y la reconstruya localmente (o al menos avise dentro de la app en vez de dejar al chofer sin
ningún indicio de que tiene una ruta pendiente de cerrar). No es bloqueante para el piloto.
**→ Cerrada el 2026-09-23 por el Hallazgo #27.**

### 6. El Dashboard no tenía forma de cerrar una jornada abierta — "Corregir" solo editaba, nunca hacía check-out (detectado 2026-09-15, resuelto y confirmado end-to-end 2026-09-15)

Encontrado al intentar cerrar la jornada de Pau (Hallazgo #5): "Corregir" (`editar-jornada-dialog.tsx`
/ `POST /api/jornadas/editar`) permitía modificar empresa, matrícula, ruta, km inicial/final y
combustible inicial/final de una jornada — pero **no tenía ningún campo para `fecha_check_out`, ni
para cambiar `estado`**. Estas dos columnas son independientes entre sí en la tabla `jornadas`
(`estado` no se deriva de si `fecha_check_out` está vacío), así que aunque se cargaran km/combustible
final a mano, la jornada seguía figurando "abierta" indefinidamente. La única salida era una
corrección manual directa en Supabase (SQL Editor), que no queda registrada en el sistema de
auditoría normal (`Corregir` sí deja rastro con `fue_editado`/`editado_por`/`motivo_edicion`; un
`UPDATE` manual en SQL no).

**Resuelto con spec propia** (`spec_cierre_manual_jornada.md`, guardada en este proyecto), ampliada
durante la revisión para incluir también foto de tacómetro final e incidencia con fotos de respaldo,
todo opcional — los mismos datos que un check-out normal desde la app. Implementado en commit
`82818350b80512490e76440f9bd24b079dc34842`:

- `POST /api/jornadas/editar` pasa de aceptar JSON a `multipart/form-data`, con nuevos campos
  opcionales: `fechaCheckOut`, `latFinal`, `lngFinal`, `tuvoIncidencia`, `tipoIncidencia`,
  `detalleIncidencia`, `fotoTacometroFinal` (archivo), `fotosIncidencia` (0+ archivos). Si
  `fechaCheckOut` llega y la jornada estaba "abierta", el mismo `UPDATE` pasa `estado` a "cerrada" —
  sin lógica de reapertura. Valida que `fechaCheckOut` no sea anterior a `fecha_check_in` (400 sin
  guardar nada si lo es).
- Antes de tocar código se confirmó contra el código real (no se asumió nada, mismo criterio que en
  hallazgos anteriores): bucket y convención de rutas de Storage
  (`src/services/storageService.ts`/`syncService.ts` → bucket `evidencias`,
  `{choferId}/{jornadaId}-final.jpg` para tacómetro final con `upsert:true`,
  `{choferId}/{jornadaId}-incidencia-{índice}.jpg` para fotos de incidencia, siempre agregadas sin
  pisar las que ya subió el chofer — el índice arranca en `fotos_incidencia.length` actual); valores
  de `tipo_incidencia` (`IncidenciasForm.tsx` → "Avería vehículo", "Tráfico/Retraso", "Cliente
  ausente", "Otro", ya coincidían con `dashboard/lib/types.ts`).
- **La spec asumía mal una regla de validación** ("tipo de incidencia obligatorio si hubo
  incidencia") — se confirmó contra `CheckOutForm.tsx` que el tipo **nunca** es obligatorio, solo el
  detalle lo es, y únicamente cuando el tipo es "Otro". Se implementó la regla real, no la asumida.
- **Bug propio encontrado y corregido antes de terminar**: un `<input type="datetime-local">` solo
  tiene precisión de minuto. Si `fechaCheckOut` se reenviara siempre que tiene un valor (mismo
  criterio que `kmFinal`), cualquier corrección de cualquier otro campo en una jornada **ya cerrada**
  le habría truncado en silencio los segundos/milisegundos a `fecha_check_out` en cada edición. Se
  agregó un valor inicial estable derivado de la jornada, y el campo solo se manda si el admin lo
  cambió de verdad.

Verificado en Render: commit `82818350b80512490e76440f9bd24b079dc34842` está desplegado y **live** en
`app-transp-dashboard` (deploy `dep-dakilcm7bikc7395op50`). `tsc`/`lint`/`format:check` limpios; se
probó el mecanismo de Storage real (upload/URL pública/delete) contra el bucket `evidencias` con un
archivo descartable, sin tocar ninguna jornada real.

**Confirmado por el usuario con una prueba real de punta a punta en el navegador del Dashboard**:
cierre completo funciona. Ver Hallazgo #7 para los 3 ajustes pedidos después de esta prueba (mapa
para ubicación, no reemplazar foto de tacómetro ya existente, formato 24 horas).

### 7. Ajustes al cierre manual de jornada, pedidos tras la prueba real del Hallazgo #6 (resuelto y confirmado end-to-end 2026-09-15)

Después de probar el cierre manual del Hallazgo #6 en el Dashboard, el usuario pidió 3 ajustes:

1. **Selector de ubicación en mapa** en vez de los inputs numéricos de `lat_final`/`lng_final` —
   proveedor elegido: **Leaflet + OpenStreetMap** (sin API key, sin costo, sin variable de entorno
   nueva en Render), con buscador de direcciones vía Nominatim y un pin arrastrable/clickeable.
   `lat_final`/`lng_final` siguen siendo opcionales.
2. **La foto de tacómetro final deja de poder reemplazarse una vez cargada** — esto modifica una
   decisión de la spec original del Hallazgo #6, que decía que una foto nueva reemplazaba a la
   anterior. Ahora: si `foto_tacometro_final_url` ya tiene un valor (cargado por el chofer desde la
   app o por un admin en una corrección previa), el input de carga se deshabilita en el Dashboard y
   el backend también rechaza/ignora un archivo entrante para ese campo (defensa en profundidad). Si
   está vacío, se puede cargar una foto igual que antes, sin que sea obligatoria. Las fotos de
   incidencia no cambian (siguen siendo append-only, nunca se reemplazan).
3. **La hora de check-out debe mostrarse y completarse siempre en formato 24 horas**, sin importar
   el idioma/configuración regional del navegador o sistema operativo del administrador — el input
   `datetime-local` nativo no lo garantiza en todos los navegadores. No cambia el contrato del
   endpoint (sigue mandando ISO/UTC).

Spec completa aprobada: `spec_ajustes_cierre_manual_jornada.md` (entregada al usuario, enmienda de
`spec_cierre_manual_jornada.md`). Implementado en commit `3416a156a96b018bb93f54b935eb27724204419d`:

- **Mapa**: nuevo `dashboard/components/jornadas/mapa-ubicacion-picker.tsx` — `MapContainer` propio
  (Leaflet/OSM, ya eran dependencias del proyecto por `MapaFlota`, no hizo falta instalar nada nuevo
  ni tocar `package.json`), `dynamic(..., { ssr: false })` igual que el resto de mapas del Dashboard.
  Pin arrastrable + click-para-mover + buscador. Nuevo `GET /api/geocodificar/buscar` (geocodificación
  directa, complementa a la inversa que ya existía) — corre server-side porque Nominatim exige un
  `User-Agent` propio que un `fetch()` de navegador no puede fijar. Probado contra la API real de
  Nominatim `/search` (formato exacto de la respuesta confirmado, no asumido). Centrado inicial:
  lat/lng final ya guardados (con pin) → lat/lng de check-in (sin pin) → Barcelona por defecto (donde
  opera el piloto; el centro de `MapaFlota` sigue en Ciudad de México, sin tocar, fuera de alcance).
- **Foto de tacómetro final no reemplazable**: input deshabilitado en la UI mostrando la foto
  existente cuando `foto_tacometro_final_url` ya tiene valor; el backend ignora en silencio un
  archivo entrante en ese caso, sin romper el resto de la corrección — confirmado que es defensa en
  profundidad y no solo una restricción visual.
- **Formato 24 horas**: en vez de sumar `react-datepicker`, se separó el campo en `<input
  type="date">` (valor siempre `"YYYY-MM-DD"`, sin ambigüedad de locale) + un input de texto propio
  para la hora con máscara y validación de patrón `HH:mm` — al ser texto plano controlado por el
  propio código, el formato nunca depende del navegador. Sin dependencias nuevas. El contrato del
  endpoint no cambió (sigue mandando ISO/UTC vía `toISOString()`, ahora construido desde
  `` `${fecha}T${hora}` ``); la guarda que evita reenviar `fechaCheckOut` sin cambios (para no truncar
  segundos en una jornada ya cerrada) se adaptó a comparar fecha y hora por separado.

Verificado en Render: commit `3416a156a96b018bb93f54b935eb27724204419d` está desplegado y **live** en
`app-transp-dashboard` (deploy `dep-dakjau2jnfac73cnilq0`). `tsc`/`lint`/`format:check` limpios;
`contexto_proyecto.md` §4 actualizado con los 3 ajustes.

**Confirmado por el usuario con una prueba real de punta a punta en el navegador del Dashboard**:
mapa de ubicación, restricción de foto de tacómetro no reemplazable, formato 24 horas, y sin
regresiones sobre el Hallazgo #6 — todo funciona. **Hallazgos #6 y #7 quedan completamente cerrados.**

### 8. Pedido: pull-to-refresh en la pantalla inicial (Check-In) para forzar el reintento de envío (resuelto y confirmado en dispositivo real 2026-09-15)

`HistorialScreen.tsx` ya tenía pull-to-refresh (ver "Robustecimiento del Check-Out" en
`contexto_proyecto.md` §3) para forzar el reintento de sincronización ignorando el tope de
`MAX_INTENTOS = 5` de `syncService.ts` — la única forma manual que tenía el chofer de reintentar una
jornada que quedó en estado `error`. La pantalla inicial (`CheckInScreen.tsx`, la lista de rutas
activas) no tenía este mecanismo.

Spec completa aprobada: `spec_pull_to_refresh_checkin.md` (entregada al usuario). Implementado:

- **Patrón confirmado en `HistorialScreen.tsx` antes de tocar nada** (no se asumió): `RefreshControl`
  sobre el contenedor scrolleable, `refreshing`/`onRefresh` disparando `sincronizarAhora(true)` desde
  el contexto `useNetwork()` (no `syncService.ts` directo), seguido de una recarga de la lista. Sin
  `tintColor` custom, sin lógica especial de conectividad propia (`sincronizarAhora` ya la maneja
  internamente). Replicado igual en `CheckInScreen.tsx`.
- **Una diferencia deliberada, documentada por el implementador**: Historial reusa su propio estado
  `cargando` como bandera del spinner; `CheckInScreen.tsx` tiene un `if (cargandoViajes) return null`
  que Historial no tiene, así que reusar esa misma bandera habría dejado toda la pantalla en blanco
  en cada pull-to-refresh en vez de mostrar el spinner sobre el contenido visible. Por eso usa un
  estado `refrescando` propio, con `try/finally`.
- `useJornadasAbiertas()` ya exponía `recargar` — reutilizado tal cual, sin duplicar la query.
- Confirmado que `TarjetaJornada.tsx` ya tenía indicador de sincronización por fila y que se
  refresca solo (no hacía falta tocarlo — coincide con lo que pedía la spec).

Verificación: `tsc`, `lint`, `format:check` limpios. `HistorialScreen.tsx` no se tocó (confirmado con
`git status`). ⚠️ A diferencia del Dashboard, esta app móvil no se despliega vía Render — no hay
commit/deploy que verificar ahí; requirió generar un `.apk` nuevo (`eas build --platform android
--profile preview`, corrido por el usuario — este entorno no tiene shell en su computadora ni el
repo clonado, así que el build no se pudo disparar desde acá) e instalarlo encima del anterior (sin
desinstalar, por el Hallazgo #5).

**Confirmado por el usuario en dispositivo real con el `.apk` nuevo**: el pull-to-refresh en
Check-In funciona. **Hallazgo #8 queda completamente cerrado.**

### 9. Una jornada cerrada desde el Dashboard sigue "en curso" en la app del chofer (detectado 2026-09-15, resuelto y confirmado en dispositivo real 2026-09-16)

**Causa**: `syncService.ts` es de subida exclusivamente — sube cambios locales pendientes a
Supabase, pero no existe ningún camino que baje el estado real de Supabase para una jornada que la
app ya considera `sincronizada`. Cuando un administrador cierra una jornada desde "Corregir" en el
Dashboard (Hallazgo #6), el `UPDATE` se hace del lado servidor con el `service_role` key, sin pasar
nunca por la app — la fila local en SQLite del chofer nunca se entera y queda con
`estado = "abierta"` indefinidamente, aunque en Supabase ya figure "cerrada". Distinto del Hallazgo
#5 (una jornada **perdida** localmente): acá la jornada sigue en SQLite, pero desactualizada frente
a un cambio hecho fuera de la app.

Spec completa aprobada: `spec_reconciliacion_cierre_remoto.md` (entregada al usuario). Implementado
en commit `8a4e982` ("feat: la app reconcilia jornadas cerradas desde el Dashboard"), hecho antes de
la spec del Hallazgo #10:

- **No existía ninguna función reutilizable tal cual para "hidratar" una jornada completa desde
  datos remotos**: `registrarCheckOut()` (el check-out normal) hace algo parecido, pero con dos
  supuestos que no encajan acá — pone `fechaCheckOut = new Date()` (la hora del dispositivo en el
  momento, cuando acá hace falta la hora real de cierre que ya viene de Supabase) y deja
  `sincronizacion = 'pendiente'` (pondría la jornada en cola para volver a subirse, cuando estos
  datos son el origen del `UPDATE`, no algo pendiente de subir). Se escribió una función nueva,
  `sobrescribirCierreRemoto()` (en `jornadasRepo.ts`), que reusa las mismas columnas/tabla/estilo de
  `registrarCheckOut` pero con esos dos criterios corregidos — documentado explícitamente por qué no
  se reutilizó la otra tal cual.
- **Hallazgo de diseño no anticipado en la spec**: `useSeguimientoGPS` no tenía ninguna API
  imperativa para "dejar de trackear" — es puramente reactivo a su prop `jornadaIds`. Y como
  `bottom-tabs` no desmonta `CheckInScreen` al cambiar de pestaña, si el chofer está en Historial
  cuando se cierra su jornada desde el Dashboard, ni el `useFocusEffect` ni el pull-to-refresh de
  Check-In se enteran hasta que vuelva ahí. Se armó un puente mínimo reutilizando el patrón que
  `NetworkContext` ya tenía (`ultimaSincronizacion`): un nuevo `jornadasReconciliadasEn`, que
  `useJornadasAbiertas()` escucha para refrescarse sola sin esperar foco — así `useSeguimientoGPS`
  deja de trackear la jornada cerrada por el mismo mecanismo reactivo de siempre, sin inventar una
  API nueva de "detener tracking".
- **3 disparadores, una sola implementación**: en vez de triplicar la lógica, la reconciliación quedó
  dentro de `useJornadasAbiertas().recargar()` — así el `useFocusEffect` y el pull-to-refresh (Hallazgo
  #8, que ya llaman a `recargar`) la heredan gratis, sin tocar `CheckInScreen.tsx`. Solo
  `NetworkContext.tsx` (el ciclo de 15s en segundo plano) tiene su propia llamada independiente,
  necesaria justamente para el caso "chofer en otra pestaña".
- Alcance de la comparación (confirmado contra el código real): jornadas locales candidatas con
  `estado='abierta'` **y** `sincronizacion='sincronizado'` (para no pisar ediciones locales
  pendientes) contra la fila real en Supabase — si el servidor ya la tiene cerrada, se sobreescribe
  localmente vía `sobrescribirCierreRemoto()`.

Verificación: `tsc`, `lint`, `format:check` limpios. Confirmado contra Supabase real (con el
`service_role` key) que la forma exacta de la fila remota coincide con lo que asume el código.

**Confirmado por el usuario en dispositivo real**: se cerró una jornada desde "Corregir" en el
Dashboard mientras la app la tenía abierta y sincronizada localmente, y el check-out en la app se
resolvió correctamente — la jornada dejó de aparecer "en curso" sin necesidad de reinstalar.
**Hallazgo #9 queda completamente cerrado.**

### 10. Pedido de UX: buscador en selectores de lista larga + encuadre con la barra de gestos de Android (2026-09-16, resuelto y confirmado en dispositivo real 2026-09-16)

**Pedido**: agregar un campo de búsqueda a cualquier selector de lista con varias opciones (en vez
de tener que scrollear a mano), y corregir que el contenido y la barra de tabs (Check-In/Historial)
no reservaban espacio para la barra de gestos del sistema Android, por lo que quedaban parcialmente
tapados.

Spec completa aprobada: `spec_ux_buscador_y_encuadre_movil.md` (entregada al usuario, en dos partes
independientes). Implementado en commit `a5f76c4`:

**Parte A — Selector buscable**:
- Nuevo componente genérico `SelectorBuscable<T>`, extraído de un componente ya existente que no
  estaba documentado hasta ahora, `SelectorPais.tsx` (selector de país en `RegistroScreen.tsx`) —
  `SelectorPais.tsx` pasó a ser un wrapper fino sobre `SelectorBuscable` (misma API pública,
  `RegistroScreen.tsx` no se tocó). Hoja modal + buscador que filtra por subcadena ignorando
  mayúsculas y acentos.
- Al revisar el código real (como pedía la spec) se confirmó que **sí existen selectores de lista
  larga que no estaban catalogados en `contexto_proyecto.md`**: se migraron a `SelectorBuscable` el
  selector de empresa en `CheckInForm.tsx` (19 opciones) y el selector de año en `SelectorFecha.tsx`
  (~82 opciones, con edad mínima 18).
- Se dejaron deliberadamente **sin** buscador (ya son listas cortas) usando el componente existente
  `SelectorDesplegable` — otro componente no documentado hasta ahora: ruta (2-4 opciones por
  empresa, necesita lógica de deshabilitado/opción especial), día (31) y mes (12).
- Fuera de alcance, sin tocar: `LanguageSelector`, tipo de incidencia, `SelectorCombustible`.
- i18n: las claves de traducción se renombraron de `selectorPais.*` a `selectorBuscable.*` (ahora
  genéricas, ya que el componente dejó de ser específico de país).

**Parte B — Encuadre con la barra de gestos de Android**:
- No hizo falta agregar `SafeAreaProvider` (ya estaba en `App.tsx`, no documentado hasta ahora) ni
  tocar la barra de tabs — `BottomTabBar` de React Navigation ya suma el inset inferior por defecto.
- Se agregó `paddingBottom` dinámico (vía `useBottomTabBarHeight()`) al contenido scrolleable de
  `CheckInScreen.tsx` y `HistorialScreen.tsx`, para que el último elemento de la lista no quede
  tapado por la barra de tabs.
- No se tocó iOS (no hay build todavía) ni las pantallas con header nativo (`DetalleJornadaScreen`,
  `NuevoCheckInScreen`, `RegistroScreen`, `LoginScreen`).

Verificación: `tsc`, `lint`, `format:check` limpios. `contexto_proyecto.md` actualizado. ⚠️ Igual que
los Hallazgos #8 y #9, esta app móvil no se despliega vía Render — no hay commit/deploy que verificar
ahí; requirió generar un `.apk` nuevo e instalarlo encima del anterior (sin desinstalar, por el
Hallazgo #5).

**Confirmado por el usuario con el `.apk` nuevo actualizado en dispositivo real: "funciona
correctamente"**. **Hallazgo #10 queda completamente cerrado.**

### 11. Pedido de UX: el Dashboard web usable desde un navegador móvil (2026-09-16/17, resuelto y confirmado en dispositivo real)

**Pedido**: el Dashboard funcionaba desde un teléfono pero "no estaba bien enmarcado" y costaba
usarlo. Se investigaron los patrones habituales (tabla a tarjetas, navegación colapsable, modales a
pantalla completa, áreas de toque) y se armó una spec de 4 partes:
`spec_dashboard_responsive_mobile.md`, más dos enmiendas
(`spec_ajustes_dashboard_responsive_mobile.md` y `spec_fix_mapa_altura_leaflet.md`).

Este hallazgo necesitó **4 commits**, con dos regresiones en el medio, y vale la pena que quede
documentado entero — no tanto por el CSS como por el método. Es además el primero de una serie de
seis (#11 a #16) sobre la misma pantalla; ver el cierre al final.

**Commit `d0f7e3b` — la primera pasada (las 4 partes de la spec original)**:
- `/mapa`: el apilado panel+mapa y el header con nav horizontal en móvil ya existían. Lo que faltaba
  era que toda la cadena de alto dependía de `min-h-screen` (`vh`), que salta cuando aparece o se
  oculta la barra de direcciones del navegador móvil → cambiado a `dvh`.
- `/jornadas`: `tabla-jornadas.tsx` (9 columnas, `min-w-[860px]`) suma una vista de tarjetas en
  móvil, alimentada por el mismo array ya cargado; cada tarjeta abre el mismo
  `JornadaDetalleDialog` que abre una fila.
- Los 3 modales pasan a pantalla completa en móvil (`dialog.tsx` es el único componente base);
  `mapa-ubicacion-picker.tsx` ya tenía alto fijo y no necesitó nada.
- `Input`/`Select`/`textarea` estaban en 14px, lo que dispara zoom automático al enfocarlos en
  Safari/iOS → subidos a 16px en móvil. El `Button` compartido pasó de 36px a 44px de alto en móvil,
  cubriendo de una sola vez exportar, corregir, cerrar sesión y alternar tema. ⚠️ **Esta pasada subió
  la fuente de los inputs pero no su alto** — un hueco que recién se detectó en el #24.

**Primera regresión, encontrada probando en el teléfono**: al rotarlo a horizontal aparecía el
layout de escritorio completo (barra lateral, tabla de 9 columnas, modal centrado) dentro de una
pantalla angosta en alto. **Causa**: la spec usó `md` (768px) como corte entre móvil y escritorio, y
un teléfono en horizontal supera ese ancho (800-930px en la mayoría de los modelos). Los breakpoints
de Tailwind son solo de ancho, así que el Dashboard trataba un teléfono acostado como una laptop.
Corregido en `d0f7e3b` subiendo el corte a `lg` (1024px) en los 4 archivos de layout. Los ajustes de
fuente y área de toque se dejaron a propósito en `md`: no están atados a esa decisión de layout.
En la misma pasada se corrigió que el panel de choferes dejaba un hueco vacío con pocos choferes —
la causa real no era un alto mínimo sino un `h-64` **fijo** en el `aside`, cambiado por
`max-h-[40dvh]` (techo, no piso).

**Segunda regresión, la más cara: `/mapa` quedó en blanco**, y tardó **tres intentos** en
resolverse. Los dos primeros (`66b1483f` y el trabajo previo) diagnosticaron leyendo la cadena de
CSS, sin poder abrir un navegador: corrigieron los **ancestros** del mapa (hacer `main` un contenedor
flex, pasar la raíz de la página de `h-full` a `flex-1`, agregar un `ResizeObserver` que llama a
`invalidateSize()`). Ninguno resolvió el problema, porque ninguno tocaba el eslabón roto.

**Causa raíz real, medida y no inferida** (commit `ff41707`): se conectó el navegador a la sesión y
se midió la página desplegada, forzando la rama móvil. El wrapper del mapa medía **295px**
(correcto, sus `min-h-[50dvh]`), pero el propio `.leaflet-container`, con `className="h-full w-full"`,
medía **0px**. Un `height: 100%` necesita que su padre tenga un alto **definido**; el alto que
Flexbox le da al wrapper vía `flex-1` + `min-height` no cuenta como definido para que un hijo
resuelva un porcentaje contra él, así que el `100%` resolvía a `auto` y colapsaba a cero. Eso explica
la asimetría exacta que se observaba: en escritorio la raíz es `lg:flex-row`, el wrapper es un ítem
de una fila y su alto sale de `align-items: stretch`, que **sí** es definido — por eso ahí siempre
funcionó. Explica también el hueco oscuro de las capturas: el espacio estaba reservado, el mapa
adentro medía cero, y los controles `+`/`−` no se veían porque viven dentro de ese contenedor, que
Leaflet recorta con `overflow: hidden`.

Fix: en `mapa-flota.tsx`, el `MapContainer` pasa de `h-full w-full` a `absolute inset-0`, apoyándose
en el `relative` que el wrapper ya tenía — una caja definida por posicionamiento, sin depender de
cómo Flexbox resuelve alturas. **Verificado en vivo sobre la página desplegada antes y después: 0px
→ 318px, con los controles de zoom visibles y sin cambios en escritorio (614px, mismos tiles).**
Los otros dos mapas se revisaron con el mismo criterio y **no** tenían el patrón, así que no se
tocaron: `mapa-ubicacion-picker.tsx` cuelga de un padre con `h-56` (píxeles fijos) y
`mapa-ruta-jornada.tsx` de uno con `h-[70vh]` (unidad de viewport) — ambos alturas genuinamente
definidas.

**Patrón a respetar de acá en más**: el contenedor de un `MapContainer` de Leaflet nunca debe
depender de `h-full` si su padre inmediato saca el alto de Flexbox. Usar `absolute inset-0` contra un
padre `relative`, o confirmar que el padre tenga un alto realmente fijo o en unidades de viewport.

**Lección de método, la parte más valiosa de este hallazgo**: las tres correcciones fallidas del mapa
tienen una sola causa común — se diagnosticó leyendo código, sin poder observar la página rota. Un
razonamiento de CSS internamente consistente puede apuntar con total convicción al eslabón
equivocado cuando la cadena es larga y hay varios candidatos plausibles; y cada intento fallido
costó un ciclo completo de spec, implementación, commit, deploy y prueba manual. El problema se
resolvió en una sola pasada apenas hubo una medición real. **Cuando un síntoma es visual y no se
puede reproducir, conseguir ojos sobre la página (navegador conectado, DevTools, una medición
concreta) vale más que cualquier cantidad de análisis del código.** Dato que además acotó el
problema a la mitad en un solo paso, y que conviene pedir siempre y temprano: *"¿falla también en
escritorio, o solo en el teléfono?"*.

**Otros dos ítems de `ff41707` / commits previos, ya implementados**: los filtros de `/jornadas`
(los campos de fecha se montaban sobre el botón "Limpiar" porque un `<input type="date">` nativo
tiene ancho mínimo intrínseco y los hijos de una grilla no se achican por debajo de su contenido —
corregido con `grid-cols-1` en móvil y `min-w-0`), y los 3 atajos de rango de fechas nuevos (Hoy /
Últimos 7 días / Este mes), que solo completan "Desde" y "Hasta" y disparan el mismo filtrado que
cargarlos a mano.

Verificado en Render: commit `ff41707` desplegado y **live** (deploy `dep-daltihgu01pc73fnichg`).
**Confirmado por el usuario en el teléfono: el mapa se ve completo.** **Hallazgo #11 cerrado.**

### 12. En el teléfono, el mapa y la lista de choferes no entran juntos: selector "Mapa / Lista" (2026-09-17, resuelto y confirmado en dispositivo real)

Con el mapa ya funcionando (#11), quedó a la vista el problema de fondo de `/mapa` en una pantalla
chica: el reparto de alto entre el mapa (piso `min-h-[50dvh]`) y el panel de choferes (techo
`max-h-[40dvh]`) deja a los dos incómodos. **Medido sobre la página real**: la lista de choferes
ocupaba ~569px de contenido contra los ~300px que le daba su techo en un teléfono de ~750px — entraba
poco más de la mitad, con scroll interno dentro de una caja chica.

Se eligió entre tres alternativas (dejar que la página scrollee con la lista entera, agrandar el
techo del panel, o un selector) el **selector "Mapa / Lista"**: por debajo de `lg` se muestra uno u
otro a pantalla completa, nunca repartidos. Es el único que le da la pantalla entera a cada uno y el
que mejor aguanta cuando la flota crezca. Spec: `spec_mapa_toggle_lista_movil.md`. Commit `d816bab`,
deploy `dep-daltujh5efls73brf4t0`.

Decisiones que sostienen el diseño:

- **El mapa queda montado todo el tiempo, solo oculto** (`display:none`, nunca desmontado):
  desmontarlo recrearía la instancia de Leaflet, perdería zoom/centro y volvería a pedir tiles en
  cada cambio; además el polling de 8s tiene que seguir corriendo esté visible o no.
- Como consecuencia, mientras está oculto su contenedor mide 0, y al volver puede quedar gris. Se
  agregó `RecalcularAlMostrar` (prop `vistaActiva` + `useMap()` + `invalidateSize()`) **junto** al
  `ResizeObserver` que ya existía de #11: el observer cubre redimensionados continuos (rotar), el
  explícito cubre la transición mostrar/ocultar.
- **Interacciones del panel con efecto en el mapa** (confirmadas leyendo `ControladorVista`):
  seleccionar un chofer dispara `flyTo`, y "Ver ruta" dibuja el trazado. Las dos **cambian
  automáticamente a la vista de mapa** — si no, la acción parecería no hacer nada. "Ocultar ruta" no
  cambia de vista.
- **Primera vez que la lección del #11 evita una regresión en vez de explicarla**: al reemplazar el
  techo del panel por `max-lg:flex-1`, el `h-full` interno de `PanelChoferes` iba a quedar colgando
  de un alto resuelto por `flex-grow` — exactamente el patrón que dejó el mapa en cero. Se aplicó el
  mismo fix (`relative` + `absolute inset-0`) **de entrada**, antes de que se convirtiera en otra
  regresión.

Verificado en el navegador conectado, en la rama móvil: vista Mapa 400×539 con tiles y controles;
vista Lista con el panel en 539px (contra ~200px del techo anterior); **cuatro ciclos Lista↔Mapa
manteniendo 539px, los mismos tiles y la misma huella de tile** (o sea, sin perder zoom ni centro) y
sin quedar gris; "Ver ruta" desde la Lista cambió a Mapa y dibujó el trazado, con el botón pasando a
"Ocultar ruta". **Confirmado después por el usuario en el teléfono.**

### 13. En horizontal, el mapa te dejaba atrapado: la página scrolleaba (2026-09-17, resuelto y confirmado en dispositivo real)

**Síntoma**: con el teléfono acostado, al scrollear hacia abajo el mapa quedaba ocupando toda la
pantalla y **no había forma de volver arriba**. El header y el selector quedaban fuera de vista, y
como cualquier arrastre sobre el mapa lo captura Leaflet para desplazarse, no quedaba ninguna zona
desde la que scrollear la página de vuelta. La única salida era rotar el teléfono a vertical.

**Causa, medida**: la raíz de `app/(dashboard)/mapa/page.tsx` tenía `min-h-[600px]` sin condicionar a
ningún breakpoint — un piso pensado para que el mapa no quedara aplastado en una ventana de
escritorio alta. Sumado al header y al selector (~122px), el contenido medía **722px contra un
viewport de 549px** en vertical (peor en horizontal: ~390px de alto, ~330px de desborde). La página
desbordaba, y por lo tanto scrolleaba.

Fix (commit `d46d67a`, deploy `dep-dalulagae00c73a2p6c0`): `min-h-[600px]` → `lg:min-h-[600px]`, más
`min-h-0` explícitos en la cadena como refuerzo contra el `min-height:auto` por defecto de un ítem
flex. **Verificado: el desborde pasó de 173px a 0.** La vista Lista comparte la misma raíz, así que
el mismo fix la cubrió.

**Criterio que queda**: en móvil, `/mapa` es una pantalla de **alto fijo que no scrollea**. Un mapa a
pantalla completa dentro de una página scrolleable atrapa el gesto y deja al usuario sin salida — es
el mismo tipo de trampa que el `h-full` del #11: obvio una vez visto, invisible hasta que alguien lo
prueba en el dispositivo.

### 14. Las tres barras superiores se comían la mitad de la pantalla en horizontal (2026-09-17, resuelto y confirmado en dispositivo real)

Con la página ya sin scroll, en horizontal quedaban **183px de ~390px** en tres barras apiladas:
header (69px), nav "Mapa en vivo / Jornadas" (53px) y selector "Mapa / Lista" (61px), dejando ~207px
de contenido. Probado en el teléfono: ni el mapa ni la lista eran usables.

Se fijó un **presupuesto como criterio de aceptación**: las barras no debían superar ~100px. Eso
convirtió la decisión de diseño en aritmética verificable, y la aritmética la resolvió sola: con el
piso de 44px de área táctil (#11), **tres filas separadas no pueden sumar menos de 132px** aunque el
padding baje a cero. Compactar por separado era imposible; había que fusionar.

Implementado (commit `bfba5a3`, deploy `dep-dalv546q1p3s73a57da0`): la nav vive en `layout.tsx` y el
selector en `mapa/page.tsx` — ramas distintas del árbol. Se resolvió con un **portal**, la más
liviana de las tres alternativas autorizadas (estado levantado, contexto o portal): `layout.tsx`
renderiza siempre un slot vacío (`className="contents"`) dentro de la fila de nav, y `mapa/page.tsx`
resuelve ese nodo con `useSyncExternalStore` (mismo patrón que ya usaba `ThemeToggle`; el lint del
repo bloquea un `setState` síncrono dentro de un efecto) y portea ahí sus botones solo en
`landscape:max-lg:`. Los botones son el mismo JSX reusado en las dos ubicaciones, así que no hay
desincronización posible.

Resultado: barras de ~96-104px (antes 183px), contenido de ~286-294px (antes 207px). **Verificado en
el navegador que las copias inactivas se ocultan con `display:none`**, que también las saca del árbol
de accesibilidad — o sea, un lector de pantalla ve un solo par de botones, no dos.

De paso, la fusión reveló que los pills de `SidebarNav` (~36px) ya estaban **por debajo del piso de
44px** sin que ninguna spec anterior lo hubiera cubierto; se corrigió primero en horizontal y después
en las dos orientaciones (ver #15).

### 15. Los controles pasan a una columna a la derecha en horizontal (2026-09-18, resuelto y confirmado en dispositivo real)

Compactar no alcanzó: probado en el teléfono, con ~290px el mapa seguía sin ser cómodo. El problema
de fondo era **cómo se estaba gastando el espacio**. En un teléfono acostado la pantalla es ancha y
baja (~850×390): el alto es el recurso escaso y el ancho sobra. Gastar ~100px del recurso escaso en
barras horizontales, teniendo 850px de ancho libre, es el reparto equivocado.

Propuesto por el usuario y especificado en `spec_columna_lateral_horizontal.md`: en horizontal **no
hay ninguna barra**; todos los controles van a una columna vertical pegada al borde derecho, y el
contenido ocupa el alto completo. Commit `5bb1670`, deploy `dep-damh7o8ae00c73bma8f0`.

- **Sin mecanismo nuevo**: el portal del #14 ya depositaba el selector dentro del contenedor de la
  nav, así que reorientar ese contenedor a columna hizo que el selector viajara con él. Lo único
  nuevo fue un wrapper de agrupación, necesario porque los controles del header (tema, cerrar
  sesión) no tenían ningún contenedor reutilizable.
- ⚠️ **Detalle que podría haber roto todo**: el wrapper agrupa `header` + fila de nav + `main`, pero
  **no se oculta nunca**. Lo que se oculta en horizontal son el `header` y la fila de nav, cada uno
  con su propio `landscape:max-lg:hidden`; `main` no lleva esa clase en ningún lado. Si el wrapper
  entero se ocultara, el contenido desaparecería al rotar — y ni `tsc` ni el servidor de desarrollo
  lo habrían detectado.
- Columna de **128px** de ancho, contenido a **~390px** de alto (contra ~290px del #14 y ~207px
  originales). Los pills pasan a ícono solo con `aria-label` incondicional. Áreas seguras con
  `env(safe-area-inset-right/left)`, no números inventados. La columna scrollea por dentro como red
  de seguridad, nunca reintroduce scroll de página.
- `/jornadas` comparte `layout.tsx` y **recibe la columna automáticamente**, sin una línea de código
  propio de esa pantalla.
- En el mismo commit se cerró lo de los pills: de `landscape:max-lg:h-11` a `max-lg:h-11`, cubriendo
  también vertical. Costo: el mapa en vertical pasó de 366 a 358px.

Verificado en el navegador, en vertical: desborde 0, mapa 358px, pills en 44px, columna en 0×0 (o
sea, existe y está colapsada como corresponde). **Confirmado por el usuario en el teléfono, en las
dos orientaciones.**

### 16. Reordenar la columna: las utilidades al pie (2026-09-18, resuelto y confirmado en dispositivo real)

La columna funcionaba, pero alternar tema y cerrar sesión —que son **utilidades**, no navegación—
quedaban en la misma tira que el resto, sin jerarquía, y se veía desprolijo.

Se evaluó volver a una barra delgada arriba con el nombre y esos dos botones, y **se descartó por su
costo**: respetando el piso de 44px, esa barra no puede medir menos de ~48px, y le devolvería al
problema casi la mitad del alto recién recuperado (el mapa bajaría de ~390 a ~342px). Se resolvió
**dentro de la columna, sin gastar un solo píxel de alto**. Commit `4b44732`, deploy
`dep-damhlfjtqb8s73fuda7g`.

Orden final: el icono del logo arriba (decorativo — **confirmado contra el código real que nunca fue
un enlace**, así que se mantuvo como tal y no se lo forzó a cumplir los 44px), la navegación y el
selector en el medio, y tema + cerrar sesión al pie, empujados con `mt-auto` y separados por un
divisor. El `mt-auto` (en vez de un alto fijo o un espaciador) los mantiene abajo sin importar
cuántos elementos tenga la nav ni si el slot del selector está vacío, que es el caso de `/jornadas`.

Detalle no anticipado: `ThemeToggle` necesitó un wrapper `flex justify-center` que `LogoutButton` no
necesitó — su botón tiene ancho fijo (`w-11`), y **un ancho fijo no se estira con el
`align-items: stretch` por defecto**, así que quedaba pegado al borde izquierdo mientras su vecino
sin ancho propio se centraba solo.

Presupuesto final: ~340px de controles sobre ~390px disponibles en `/mapa` (~50px de margen), ~244px
en `/jornadas`. ⚠️ Ese margen es sobre un teléfono de ~390px de alto en horizontal; en uno más chico
(un 360×640, que acostado deja ~360px) la columna empezaría a scrollear por dentro — no es un
problema, para eso está el `overflow-y-auto`, pero es la señal de que ahí conviene sacar el logo, que
es decorativo. **Ese presupuesto volvió a usarse en el #24, esta vez para anticipar el costo de una
función nueva antes de construirla, y se agotó del todo en el #25.**

**Confirmado por el usuario en el teléfono: "quedó mejor".**

### 17. Los rangos de fecha se interpretaban en UTC, no en hora de España (detectado 2026-09-17, resuelto y confirmado con una exportación real 2026-09-18)

Al cerrar la serie #11-#16 quedó anotada una deuda que parecía menor — dos helpers que calculaban
"hoy" en UTC — y resultó ser bastante más grande. **Era el único de todos los hallazgos del piloto
que afectaba directamente a los datos**, no a cómo se ven.

**Decisión de negocio, tomada antes de escribir el fix**: un rango de fechas significa **siempre días
de calendario de España** (`Europe/Madrid`), sin importar desde dónde, a qué hora ni con qué
dispositivo se consulte. Dos administradores que pidan el mismo rango tienen que obtener exactamente
las mismas jornadas. Es el mismo criterio que ya se había usado al cerrar la jornada de Pau a mano
(`at time zone 'Europe/Madrid'`, Hallazgo #5).

Spec: `spec_deudas_fechas_y_dvh.md`, con una **Fase 1 de diagnóstico obligatoria antes de tocar
código** — justamente porque la deuda anotada describía el síntoma más visible y no necesariamente la
causa. Diagnóstico (commit `945c783`, deploys `dep-dami8rugekts73ebl1tg` en el Dashboard y
`dep-dami8rugekts73ebl23g` en el mock server):

- El prellenado del formulario era **lo de menos**. `GET /api/jornadas` (los filtros de la tabla que
  el administrador usa todos los días) y `POST /api/reportes/exportar` armaban
  `` `${fecha}T00:00:00` ``/`T23:59:59.999` **sin offset** y los comparaban contra `fecha_check_in`
  (`timestamptz`). Postgres interpreta esa cadena en la zona de la sesión — la de Supabase, UTC — así
  que **una jornada iniciada a las 00:30 de Madrid quedaba fuera de su propio día**. El mismo
  mecanismo en los dos lugares, corregidos juntos para que tabla y reporte no se contradigan.
- **El Excel mostraba las horas en UTC**: `formatearHora`/`formatearFecha` en `reportes.js` usaban
  `toLocaleTimeString`/`toLocaleDateString` sin `timeZone`, y Render corre en UTC. Confirmado
  empíricamente forzando el proceso a `TZ=UTC`: una jornada de las 10:30 de Madrid aparecía como
  "09:30".

Fix: nuevo `dashboard/lib/rango-fechas-espana.ts` centraliza la conversión día-de-calendario →
instante UTC con `Intl.DateTimeFormat`, **nunca un offset fijo a mano** — España alterna entre
`+01:00` y `+02:00` y un número hardcodeado funciona medio año y falla el otro, en silencio. Los dos
endpoints pasaron a `.gte()`/`.lt()` (intervalo semiabierto, en vez del `23:59:59.999` que pierde la
última fracción de segundo). Los helpers de `lib/utils.ts` pasaron a `Intl` con
`timeZone: "Europe/Madrid"`, y los atajos de rango del #11 se unificaron con ellos (antes tenían su
propio cálculo con los getters del navegador: correcto por su cuenta, pero un segundo criterio
conviviendo). `formatearHora`/`formatearFecha` del mock server recibieron `timeZone: "Europe/Madrid"`.

Verificación, con un script Node aparte y no solo razonando: los dos casos de borde (jornada a las
00:30 y a las 23:30 de Madrid) caen en el día español correcto, y el desfase cambia de `+02:00` a
`+01:00` entre el 24 y el 26 de octubre de 2026 — el cambio de horario real de ese año. **Confirmado
por el usuario exportando un reporte real: las horas del Excel coinciden con las del Dashboard.**

También se cerró en el mismo commit la otra deuda menor: `h-[70vh]` → `h-[70dvh]` en el modal "Ver
ruta" (`ruta-jornada-dialog.tsx`), por consistencia con el resto del Dashboard. Se confirmó que no
desbordaba dentro del modal a pantalla completa, así que no hizo falta convertirlo a `flex-1` —
**cambiar lo que está roto, no lo que se parece a algo que estuvo roto**.

### 18. El Excel salía en formato 12 horas (2026-09-18, resuelto y confirmado con una exportación real)

Con la zona horaria ya resuelta, las horas del Excel coincidían con las del Dashboard pero se veían
como `10:30 a. m.` en vez de `10:30`. Spec: `spec_formato_horas_excel.md`. Commit `90f2291`, deploy
`dep-damiiics728c73c44760`.

**La causa que suponía la spec era incorrecta, y se descartó contra el código real antes de
aplicarla**: la spec afirmaba que faltaba el locale explícito, y no faltaba — estaba, era `es-MX`, y
`es-MX` usa 12 horas por defecto mientras que `es-ES` da 24 directo. La spec también temía que la
fecha saliera en orden estadounidense, y se comprobó empíricamente que ya salía `15/01/2026`. Dos
suposiciones descartadas con evidencia antes de escribir una línea.

Fix: `es-ES` **y además** `hour12: false` explícito — los dos, mismo criterio del Hallazgo #7 de no
depender de que el valor por defecto de un locale se mantenga. Verificado generando un `.xlsx` real
(no solo las funciones sueltas), releyéndolo con ExcelJS y mirando el valor en la celda, con `TZ=UTC`
forzado igual que Render: `"15/01/2026"`, `"10:30"`, `"19:15"`. Barrido el resto de `server/mock/`:
no quedaba ningún otro `toLocale*` con la misma omisión. **Confirmado por el usuario exportando un
reporte real: aparece en 24 horas.**

### 19. Las celdas de fecha y hora del Excel eran texto, no valores: ahora se puede calcular con ellas (2026-09-18, confirmado sobre un archivo real 2026-09-21)

Era la pregunta abierta que dejó el #18. Mientras el formato estuvo mal (UTC, AM/PM) era secundaria;
una vez que las horas se veían bien, lo que quedaba era que **no se podía calcular con ellas**. Y el
objetivo declarado del sistema es sacar los pagos a los choferes y los cobros a las empresas a partir
de estos reportes: con celdas de texto no se suman las horas, no se ordena cronológicamente (un orden
alfabético pone `01/10` antes que `30/09`), y una tabla dinámica no puede agrupar por mes.

**El momento lo decidió que todavía no las usara nadie.** Los reportes generados hasta ahora fueron
pruebas; en cuanto alguien arme una plantilla encima de este archivo, cambiar el tipo de las celdas
deja de ser un ajuste y pasa a romper el trabajo de otro. Spec: `spec_excel_valores_reales.md`.
Commit `b599611`, deploy `dep-damjaeoae00c73bok4j0`.

**El riesgo central no era técnico: era que el #17 volviera disfrazado.** Una fecha de Excel es solo
un número — días desde el 30/12/1899 — **sin ninguna zona horaria propia**. Al pasar de texto a
valor hay un punto donde se decide qué hora se guarda, y si esa decisión se delega en la librería, lo
más probable es que use UTC o la zona del proceso, que en Render es UTC. Habría sido exactamente el
bug del #17 entrando por la puerta de atrás, y **esta vez sin el AM/PM que lo delató**: `07:30` en
vez de `09:30`, con pinta de dato correcto. Por eso el número se construye a mano a partir de los
componentes de reloj de pared en `Europe/Madrid` (`componentesEnEspana()`, el mismo mecanismo
`Intl`+`timeZone` del #17), nunca entregándole un `Date` a `exceljs`.

Qué cambió, de las 23 columnas del reporte: `fecha` (`dd/mm/yyyy`), `horaCheckIn`/`horaCheckOut`
(`hh:mm`), `horasTotales` (`[h]:mm`) y `horaIncidencia` (`hh:mm`) — esta última **no estaba en la
spec**, apareció al barrer el archivo completo, que era justamente lo que la spec pedía hacer.

- **Los corchetes de `[h]:mm` no son decorativos.** Con `h:mm` a secas, una suma que pasa de 24 horas
  vuelve a cero: 25:30 se muestra como `01:30`. Con `[h]:mm` la hora acumula sin dar la vuelta, que
  es lo que hace falta al totalizar una semana o un mes. Es el error más fácil de cometer en todo
  este cambio y el más silencioso de todos los que podía tener un reporte de pagos.
- ⚠️ **Una duración es una fracción de día**: 8:30 se guarda como 0,354166…, así que la fórmula de
  pago es `=A2*24*tarifa`. Sin esa línea escrita, alguien calcula pagos 24 veces más bajos y el
  número parece plausible.
- **Se eligió la duración legible (`08:30`) por encima del decimal (`8,5`)**, sabiendo que cuesta
  ese `*24`. Si al primer mes resulta incómodo, agregar una columna decimal al lado es trivial;
  empezar con dos columnas y descubrir que una sobra cuesta lo mismo y ensucia el reporte mientras
  tanto.
- **El redondeo no llegó a ser un problema, pero estuvo cerca**: `calcularHorasTotales()` ya
  calculaba el número en horas decimales y recién después lo pasaba a texto con `.toFixed(2)`. Se usa
  el número de antes del `.toFixed`. Si se hubiera tomado el redondeado, 8h 20m (8,333… → 8,33)
  habría salido como `08:19`. La prueba que se hizo fue con 8,75 — **el único valor que no podía
  revelar el problema**, porque 8h 45m es exactamente representable con dos decimales.
- **`horaIncidencia` trajo un conflicto de diseño no previsto**: seguía el patrón de
  `tipoIncidencia`/`descripcionIncidencia`, que concatenan por salto de línea pensando en que una
  jornada pueda admitir más de una incidencia en el futuro. Una celda numérica no puede llevar dos
  valores. Se usa la primera incidencia (hoy la única) y queda documentado en el código que ese caso
  futuro necesita su propio rediseño.
- **Las celdas sin dato siguen en texto** (`"-"` sin check-out todavía, `"N/A"` sin incidencia),
  mismo criterio que ya usaba `kmFinal`. Contradice en la letra el criterio de la spec de no mezclar
  tipos en una columna, pero es correcto: `SUM` y `AVERAGE` ignoran el texto, así que no hay
  resultado parcial silencioso, y un `=D2*24*tarifa` sobre `"-"` da `#VALUE!` — ruidoso, que en una
  planilla de pagos es mucho mejor que el 0 silencioso de una celda vacía. Lo único a vigilar es que
  alguien "arregle" ese `#VALUE!` borrándolo en vez de notar que la jornada está abierta.

Verificación: se generó el `.xlsx`, se releyó con `exceljs` y se confirmó que las celdas son
numéricas (no `String`), con `TZ=UTC` forzado igual que Render — invierno (09:30-18:15 UTC) se
reconstruye como `10:30`/`19:15` con duración `08:45`, verano (`+02:00`) como `07:00`/`15:00`, y el
orden de los seriales es cronológico cruzando septiembre→octubre. **Confirmado por el usuario sobre
un archivo real exportado del Dashboard desplegado: ninguna columna muestra `########` y el formato
de la celda de duración dice `[h]:mm`.** Esas dos eran las únicas comprobaciones que `exceljs` no
podía hacer, porque no renderiza ni evalúa fórmulas.

### 20. La presentación también heredaba la zona del entorno — y el formulario de cierre con ella (2026-09-21, confirmado con una corrección real)

La última deuda de la serie de fechas: `formatFechaHora` y `formatFecha` en `dashboard/lib/utils.ts`
— las que usa toda la tabla y el detalle de jornadas para **mostrar** los horarios — tampoco fijaban
`timeZone`. Spec: `spec_horas_dashboard_espana.md`. Commit `4f3151e`, deploy
`dep-daoh8l97lnhs73f1a4fg`.

**Toda la urgencia del hallazgo dependía de una sola pregunta sin contestar**: si esas funciones
producían su valor en el navegador o en el servidor. En el navegador, usan la zona del dispositivo
del administrador y el resultado es correcto hoy, fallando solo para alguien que mire desde otro
huso: caso de borde. En el servidor, usan la del proceso —UTC en Render— y la tabla vendría mostrando
horas corridas para todo el mundo desde el día uno. Por eso la spec exigía contestar eso **antes** de
escribir una línea de fix.

⚠️ **La trampa del diagnóstico, que vale para cualquier pantalla futura**: en el App Router de
Next.js, un componente con `"use client"` **también se renderiza en el servidor** durante el SSR. Que
un archivo lo declare no significa que su formateo ocurra solo en el navegador. Lo que decide es si
esas funciones llegan a ejecutarse **con datos** durante el render del servidor.

**Respuesta: navegador, nunca servidor**, confirmada rastreando tres caminos independientes —
`useJornadas()` usa TanStack Query sin ningún `prefetchQuery`/`HydrationBoundary` (el `QueryClient`
nace vacío en `app/providers.tsx`), así que en el SSR `data` es `undefined` y la tabla renderiza
vacía; `JornadaDetalleDialog` recibe la jornada desde un `useState` que arranca en `null`; y
`trazado-ruta.tsx` cuelga de un mapa con `dynamic(..., {ssr:false})`. Tres caminos, la misma
respuesta: **era el caso de borde**. No hace falta ninguna advertencia sobre horarios históricos mal
mostrados a los administradores.

**El hallazgo más valioso no estaba en la pregunta original: el camino de entrada.** El editor de
check-out prellenaba con los getters locales del navegador y, al guardar, interpretaba lo tipeado con
`new Date(...).toISOString()` — también zona del navegador. Los dos eran consistentes **entre sí**,
por eso la guarda anti-truncado del #6 nunca falló. Pero arreglar solo la pantalla habría roto esa
consistencia: un administrador fuera de España vería `10:30`, escribiría `10:30` y **guardaría un
instante distinto**. Eso ya no es una lectura incómoda, es un dato mal guardado. Se corrigieron los
dos lados en la misma pasada, así que la inconsistencia nunca llegó a existir.

Fix: las dos funciones declaran `timeZone: "Europe/Madrid"`, locale `"es-ES"` y `hour12: false` — el
mismo trío del #18, y del lado del navegador el locale no es cosmético: **un administrador con el
navegador en inglés habría visto AM/PM y posiblemente el mes antes que el día**, el `09/10/2026`
ambiguo, en la pantalla que sustenta pagos. Nuevo `dashboard/lib/hora-espana.ts` con
`componentesEnEspana()` (prellenado) e `instanteEnEspanaComoUtc()` (envío). El barrido encontró
formateo suelto solo en los dos puntos que la spec ya anticipaba. `formatFecha` resultó ser código
muerto; **se corrigió y se conservó a propósito**: un helper muerto y correcto es una red para el
próximo que necesite mostrar una fecha, mientras que borrarlo invita a que esa persona escriba su
propio `toLocaleDateString` y reintroduzca el bug.

⚠️ **Deuda deliberada, anotada con disparador**: `desfaseMinutos()` quedó como el mismo algoritmo de
~20 líneas escrito dos veces, en `rango-fechas-espana.ts` y en `hora-espana.ts`. Se decidió **no**
extraerlo ahora, para no mezclar una refactorización sobre un archivo cerrado y verificado con un
cambio que todavía no había pasado su propia prueba en la app real. Los dos archivos llevan un
comentario que dice **el costo concreto** de una divergencia (no tira error: da una hora corrida
durante parte del año y se nota recién en el cambio de horario), y el pendiente quedó atado a un
disparador —*la próxima vez que se toque cualquiera de los dos archivos*— con la firma
`(instante, zona)` de `rango-fechas-espana.ts` marcada como la que sobrevive. Anotado también que
`server/mock/reportes.js` es un tercer lugar que comparte la decisión de negocio sobre
`Europe/Madrid` sin compartir este algoritmo: **tres archivos en dos sub-proyectos que tienen que
seguir de acuerdo**.

**Verificación, y una falsa alarma que dejó una lección**: la conversión se probó con `TZ=UTC` como
zona lejana (antes: `09:30`; después: `10:30`, sin importar la zona del proceso) y con una simulación
en Node del ciclo completo del formulario usando el código real del archivo. La prueba que faltaba
—la de la app desplegada— la hizo el usuario: al mirar la jornada corregida **en Supabase** apareció
una diferencia de dos horas contra el Dashboard, que resultó ser simplemente el `+02:00` de España en
verano. **La forma del síntoma ya lo descartaba**: la regresión del #6 trunca los **segundos**, no
corre las **horas**. Confirmado finalmente sobre la jornada real corregida: `fecha_check_out` intacto
hasta los milisegundos (`15:47:48.425`), sin truncar.

### 21. El reporte exportado traía menos jornadas de las que la tabla mostraba (detectado por el usuario 2026-09-21, resuelto y confirmado end-to-end 2026-09-22)

Lo encontró el usuario usando el sistema: filtró `/jornadas` por el chofer "cesar", vio **18 rutas**,
exportó, y el Excel trajo **8**. Spec: `spec_exportar_coincide_con_tabla.md` (commit `60eb132`), más
`spec_exportar_solo_lectura.md` (commit `9e18bc6`). Deploys `dep-dap3mrou01pc73d432bg` y
`dep-dap4jqe8bjmc73apb570`.

**De todos los hallazgos del piloto, este es el de peor clase.** No hay error, no hay advertencia, y
el archivo se ve perfectamente normal: alguien liquida 8 rutas en vez de 18 y el número parece
plausible. Los #17 a #20 se ocuparon de que las horas fueran correctas; este se ocupa de que estén
**todas**.

**La causa que suponía la spec era falsa, otra vez, y la real es más instructiva.** La spec decía que
el diálogo guardaba un rango viejo entre aperturas; no guardaba nada. Lo que pasaba es que **los dos
endpoints tenían contratos distintos sobre el mismo parámetro**: `POST /api/reportes/exportar`
exigía un rango de fechas mientras `GET /api/jornadas` ya lo trataba como opcional. Con un chofer
filtrado y sin fechas, la tabla mostraba todo el histórico y el diálogo rellenaba el hueco con un
default silencioso de "últimos 7 días". De ahí 18 en pantalla y 8 en el archivo. **Un valor por
defecto que tapa la ausencia de un dato es la misma familia que heredar del entorno**: alguien decide
en silencio algo que nadie pidió.

Qué quedó:

- **Un solo armado del filtro** (`lib/jornadas-filtro.ts`) compartido por los dos Route Handlers, en
  vez de dos implementaciones en paralelo del mismo criterio — que es exactamente lo que permitió la
  divergencia.
- ⚠️ **El contador previo, que vale más que el fix.** El diálogo anuncia *"Se exportarán N
  jornadas"* antes de exportar, y ese número **no** se cuenta sobre las filas que el navegador ya
  tiene: es una consulta nueva al servidor (`count: "exact"`, `pageSize: 1`, `queryKey` distinto del
  de la tabla para que no pueda reusar caché) por el mismo camino de filtrado que usará la
  exportación. El fix corrige el caso conocido; **el contador convierte en visible cualquier
  divergencia futura**, incluidas las que nadie previó, y la muestra antes de que el archivo exista.
- **Guard de truncamiento, en dos capas.** El servidor compara el `count` exacto contra las filas
  efectivamente recibidas y rechaza el reporte si no coinciden: cubre el `.limit(5000)` propio, el
  `db-max-rows` de PostgREST —cuyo valor en este proyecto **nadie conoce, y con esta comprobación no
  hace falta conocer**— y cualquier causa futura. El diálogo, además, bloquea el envío si el conteo
  ya supera el máximo. Nunca se manda un reporte más corto de lo que dice ser.
- **El `.xlsx` declara sus filtros en una segunda hoja**, no en filas por encima de la tabla: meter
  encabezados arriba de los datos habría estorbado justo lo que el #19 acababa de habilitar —ordenar
  y armar tablas dinámicas desde la primera fila.
- **El diálogo terminó siendo de solo lectura salvo el correo** (`9e18bc6`), revirtiendo la decisión
  que se había tomado al especificar. Probado en uso real, el usuario pidió lo contrario de lo que
  se había elegido, y tenía razón: con los filtros editables, que el archivo coincida con la pantalla
  depende de mantener sincronizados dos criterios; de solo lectura **hay uno solo y la coincidencia
  es estructural**. Los filtros se siguen viendo —ocultarlos habría reintroducido el bug— como texto
  con la misma redacción que la hoja "Filtros" del Excel, así que lo que se lee en pantalla y lo que
  se lee en el archivo son la misma frase.

**Confirmado por el usuario sobre la app desplegada**: el caso "cesar" da **18 = 18 = 18** (tabla,
contador, archivo); cambiar un filtro en la tabla actualiza el contador; los campos son de solo
lectura salvo el correo; un envío real de punta a punta sin filtros trajo las **26** jornadas que
hay guardadas; y el diálogo funciona en el teléfono en las dos orientaciones.

### 22. Un `429` del servidor de reportes que no venía del servidor de reportes (2026-09-22, se resolvió solo)

Durante la sesión apareció un `429 Too Many Requests` al llamar al mock server. Investigado en
commits `ce34eb5` y `cb550e2`, y **descartado como bug propio por eliminación**: el Express de
`server/mock/` solo devuelve `400`, `200` o `500` — no existe ninguna ruta de código que produzca un
`429`. Si el código no lo puede emitir, vino de una capa de más arriba.

**Conclusión, por inferencia y no por confirmación**: Render pone Cloudflare delante de los
servicios, y un bloqueo transitorio de esa capa explica el síntoma. No se pudo confirmar contra
Cloudflare —no hay acceso a ese panel desde acá— así que queda anotado como la explicación más
probable, no como causa verificada. Se resolvió solo, sin intervención.

**Lo útil para el piloto**, y por eso está documentado aunque no haya habido nada que arreglar:

- Es **distinto del `502` por cold start** que ya conocíamos (#3). Aquel se explica mirando los logs
  del servicio; este **no aparece en ningún log de Render**, porque el pedido nunca llega al
  servicio. Buscarlo ahí es perder el tiempo.
- Ante un `429`, la conducta correcta es **esperar y reintentar**, no diagnosticar el código.
- El patrón general vale más que el caso: **un código de estado que el propio servidor no puede
  emitir es la prueba de que hay una capa intermedia que nadie está mirando.** La lista de qué puede
  devolver tu código es un instrumento de diagnóstico.

### 23. El `Database` de Supabase, y un esquema versionado que mentía (2026-09-22, verificado de punta a punta)

Cierre de la deuda que apareció al revisar el escape de tipos del #21: los dos `createClient` del
Dashboard se llamaban sin el genérico `Database` (por defecto `any`), así que **ningún nombre de
columna de ninguna consulta a Supabase se verificaba en compilación**. El caso malo no es el typo
inexistente —da error de PostgREST, ruidoso— sino **un typo que coincida con otra columna real**:
filtra por el campo equivocado, devuelve filas plausibles y no falla nunca. Spec:
`spec_database_types_supabase.md`. Commits `ab23cf2` y `6c82c4e`, deploy `dep-dap6lih7lnhs73at7fgg`.

**Encender el genérico produjo un solo error real**, no la decena que se temía: el objeto dinámico
del `.update(...)` en `jornadas/editar/route.ts` estaba tipado `Record<string, unknown>`, demasiado
laxo. Se tipó como `TablesUpdate<"jornadas">` en vez de silenciarlo.

⚠️ **Lo más instructivo del hallazgo: la verificación casi da un falso positivo.** Al quitar el
`as unknown as` de `aplicarFiltrosJornadas`, el primer intento **compiló limpio, sin casts, con toda
la pinta de estar resuelto — y no atrapaba el typo deliberado de prueba**. El motivo: la constraint
declarada era `columna: string`, y dentro del cuerpo de una función genérica el compilador solo ve
la constraint, nunca el tipo real del llamador. La función habría quedado tan sin verificar como
antes, con la apariencia contraria. Se corrigió tipando la constraint contra
`keyof Database["public"]["Tables"]["jornadas"]["Row"]`, y recién ahí el typo fue rechazado.
**Lo único que lo delató fue la prueba del typo**; sin ella, el hallazgo se habría cerrado en falso.

Confirmado con **dos** typos deliberados y revertidos: `chofer_nombr` en el filtro compartido, y
`emial` en la consulta a `admins` de `login/route.ts` —que no pasa por ese filtro— para comprobar
que la verificación alcanzó a todo el Dashboard y no solo a `jornadas`.

**De paso, la comparación entre lo generado y `supabase/schema.sql` encontró un desfase real**: al
archivo versionado le faltaban las 4 columnas de auditoría de edición (`fue_editado`, `editado_por`,
`editado_en`, `motivo_edicion`) que agregó `schema_v5_edicion_jornadas.sql` y nunca se plegaron de
vuelta, a diferencia de v3 y v4, que sí lo estaban. **El riesgo era concreto**: quien reconstruyera
la base desde `schema.sql` obtendría una tabla `jornadas` sin las columnas de auditoría, y
`POST /api/jornadas/editar` se rompería al primer uso. Plegadas en commit aparte (`6c82c4e`),
siguiendo el mismo criterio que v3/v4. **Este desfase apareció solo porque se generaron los tipos: la
tarea se pagó sola antes de encender el compilador.**

**La contrapartida, escrita junto al esquema y no solo en `contexto_proyecto.md`**: un `Database`
generado que quedó viejo es **peor que no tenerlo**, porque el compilador aprueba con confianza una
columna que ya no existe. Para que no dependa de la memoria de nadie, la regeneración es un comando
(`npm run types:supabase`) y la regla vive donde la va a ver quien cambie el esquema.

Verificado de punta a punta contra la app desplegada: login real, `/api/jornadas`, `/mapa`, y el caso
"cesar" otra vez en **18 = 18 = 18** — porque un cambio de tipos no debería alterar ningún
comportamiento, y eso es motivo para comprobarlo, no para saltearlo.

⚠️ **Deuda que este hallazgo dejó anotada, y que el #29 confirmó real**: `npm run types:supabase`
regenera tipos de **columnas**, pero no compara policies, triggers, índices ni constraints contra la
base real. La deriva del #29 (una policy de `UPDATE` que existía en producción y nunca se plegó de
vuelta en `schema.sql`) es exactamente de esta clase, y ningún `tsc` la iba a atrapar.

### 24. Los camiones pasan a tener entidad propia: tabla de flota (2026-09-22, verificado en la base real y en el teléfono)

Primer hallazgo de toda la serie que **se abordó antes de que produjera un síntoma**. Los 23
anteriores empezaron con algo que alguien vio roto; este empezó con una pregunta del usuario sobre
qué cálculos toca el combustible. Spec: `spec_flota_vehiculos.md`. Commit `5bfc7ec`, deploy
`dep-dape8t7avr4c73dtmoa0`.

**El motivo no es el combustible.** Al preguntar quedó claro que el combustible es **referencia de
costo interno, no facturación**: la empresa lo cubre en los camiones propios y alquilados, los
autónomos lo cubren ellos, y no se le cobra a ningún cliente. Eso convierte la capacidad de tanque en
un dato útil pero no urgente. El motivo real es otro: **la matrícula viajaba como texto suelto en
cada jornada**, y cuando la flota esté completa y hayan pasado seis meses, agrupar consumo o
kilómetros por camión deja de ser una consulta y pasa a ser un trabajo de limpieza de datos.

**El diagnóstico fue honesto sobre lo que no probaba**: las 26 jornadas cargadas tienen 9 matrículas
distintas y **ninguna está escrita de dos formas**. O sea, el problema todavía no ocurrió. No
confirma el riesgo; solo no lo descarta. Se actuó igual, por asimetría de costo — barato ahora, caro
después — y eso hay que decirlo tal cual en vez de fabricar una urgencia que no había.

⚠️ **Lo más valioso salió del diagnóstico: ya hay dos normalizaciones distintas conviviendo.**
`SelectorMatricula.tsx` en la app del chofer normaliza a mayúsculas y saca espacios, **pero no
guiones**; la tabla de flota saca todos los caracteres no alfanuméricos. Dos consecuencias: en
`jornadas` ya pueden convivir hoy `1234-ABC` y `1234ABC` —el riesgo no es solo futuro, está
habilitado— y **cuando la segunda etapa enlace la jornada al vehículo, las matrículas con guion van
a ser las que fallen**. Son pocas, que es la peor forma de fallar. Es la misma forma del
`desfaseMinutos` duplicado del #20 y de los dos armados de filtro del #21.

Qué quedó:

- **Tabla `vehiculos`** con matrícula, tipo de propiedad (propio / alquilado / autónomo), capacidad
  de tanque (opcional), marca, modelo, año y estado activo/baja. Los camiones de autónomos entran en
  la misma tabla: el tipo de propiedad es justo lo que después permite **no mezclar** su consumo con
  el costo de la empresa.
- **La unicidad vive en un índice de expresión** sobre la matrícula normalizada, y vale también para
  los vehículos de baja: uno que "vuelve" se reactiva, nunca se duplica.
- **Dos capas, con roles distintos**: el Route Handler hace el chequeo de duplicado en JS —la flota
  son decenas de filas, no miles— para poder identificar **cuál** vehículo choca y ofrecer
  reactivarlo con un mensaje legible; el índice de Postgres es la garantía real. Confirmado
  insertando por fuera del chequeo de JS: lo rechazó igual (`23505`). Es el mismo patrón del guard
  de truncamiento del #21 — una capa para el mensaje, otra para la certeza.
- **Nunca se borra un vehículo**, se da de baja. Un administrador "ordenando" la lista destruiría la
  única forma de interpretar las jornadas viejas de ese camión.
- **La jornada sigue guardando la matrícula como texto.** Enlazarla es una segunda etapa deliberada,
  que toca la app del chofer y las jornadas ya cargadas.

⚠️ **Primera vez que un presupuesto documentado anticipa el costo de una función nueva.** Agregar
"Flota" a la navegación tocaba directamente el presupuesto del #16: la columna lateral en horizontal
pasaba de ~340px a ~388px sobre ~390px disponibles. Eso se calculó **antes de construir**, y el
fallback ya estaba decidido de antemano en el propio #16 — sacar el icono del logo, que es
decorativo. Se sacó en el mismo commit, quedando en ~356px. Confirmado después en el teléfono real.
Los #11 a #16 usaron la medición para explicar problemas; acá sirvió para no crearlos.

**Error de la spec, corregido**: afirmaba que los 44px de área táctil ya estaban resueltos en los
componentes compartidos. No lo están — el #11 subió la **fuente** de `Input`/`Select` a 16px y el
**alto** solo del `Button`. El implementador hizo bien en no arreglarlo únicamente en Flota: habría
dejado dos criterios de alto conviviendo en el mismo Dashboard, que es el pecado recurrente de este
proyecto. Queda como punto abierto propio.

**El flujo de `npm run types:supabase` funcionó sin fricción** — primer uso real de la regla que dejó
el #23. De paso se detectó que el CLI deja una carpeta de caché (`supabase/.temp/`) que había que
ignorar, ya agregada a los `.gitignore`.

Verificado contra la base real y confirmado por el usuario en el teléfono: `1234ABC` creado,
`1234 abc` y `1234-ABC` rechazados con un mensaje que identifica el vehículo, dado de baja y sigue en
la lista, reintentado ofrece reactivar en vez de duplicar, reactivado sobre la misma fila. Regresión:
"cesar" sigue en 18, `/mapa` y `/flota` responden bien, y la pantalla funciona en las dos
orientaciones.

### 25. El alta de choferes pasa al Dashboard, y la contraseña deja de ser del administrador (2026-09-23, verificado en dispositivo real)

El pedido era operativo: que el administrador cree el perfil del chofer y solo le entregue usuario y
contraseña, en vez de cargarlo a mano en el SQL Editor y en el panel de Auth. Lo que lo convirtió en
un cambio de diseño y no en una pantalla más fue una pregunta de seguridad que apareció al
especificarlo. Spec: `spec_alta_choferes_dashboard.md`. Commit `7b417b0`, deploy
`dep-dapomk97lnhs73fv8pn0`.

⚠️ **El razonamiento que decidió el diseño**: los Hallazgos #6 y #7 construyeron un rastro de
auditoría — cuando un administrador corrige una jornada queda registrado quién fue, cuándo y por
qué. Ese rastro **se apoya en que el administrador actúe como administrador**. Si conserva la
contraseña del chofer, puede entrar a la app en su nombre y crear o modificar una jornada sin dejar
ninguna huella, en un sistema cuyos datos sustentan pagos a personas. El código de auditoría estaba
bien; lo que lo dejaba sin efecto era una práctica de manejo de credenciales que no tenía nada que
ver con él. De ahí que el cambio obligatorio de contraseña en el primer ingreso no fuera opcional:
la temporal sirve una vez y después nadie más que el chofer la conoce.

Qué quedó:

- **Contraseña temporal generada por el servidor**, mostrada una sola vez, sin guardarse en ninguna
  tabla, correo ni log. **Cambio obligatorio en el primer ingreso**: hasta que no ocurre, el chofer
  no llega a ninguna pantalla que permita cargar datos (`RootNavigator.tsx` lo gatea con
  `debe_cambiar_contrasena`). El administrador puede además editar datos, dar de baja y resetear la
  contraseña.
- **El registro desde la app se deshabilitó**: el alta pasa a ser exclusiva del Dashboard.
  `RegistroScreen.tsx` pasó de formulario a mensaje, sin dejar un camino muerto. Dos vías para crear
  la misma entidad es el patrón que causó el #21.
- ⚠️ **Dar de baja actúa en los dos sistemas a la vez**: `activo = false` en la tabla **y**
  `ban_duration` en Supabase Auth. Marcar solo la tabla no le impide a Auth dejar pasar a nadie.
  Verificado con un "User is banned" real, no con un flag.
- **El orden no fue una elección**: `choferes.id` es FK a `auth.users.id`, así que el usuario de Auth
  tiene que existir primero por definición del esquema. Lo que sí se decidió fue la compensación: si
  falla el insert de la fila, **se borra el usuario de Auth recién creado**, dejando "no se creó
  nada" en vez de un huérfano invisible. Verificado forzando la falla con un `sexo` inválido que
  viola el `CHECK`, y confirmando con `admin.getUserById` que el usuario quedó completamente
  borrado.
- **El correo sintético se copió, no se compartió**, con el mismo comentario de costo en los dos
  lados — `authService.ts` y `dashboard/lib/choferes.ts`. El costo es concreto: si las dos cadenas
  difieren en un carácter, **el chofer no puede entrar y no hay ningún error que lo explique**. Mismo
  criterio que `desfaseMinutos()` en el #20.

**Fase 1: lo que el diagnóstico encontró y cambió el formulario.** `RegistroScreen.tsx` hacía
`signUp()` y, si eso funcionaba, el `insert` en `choferes` — dos operaciones sin transacción, el
mismo problema que el alta nueva tuvo que resolver bien. Y las **7 columnas de `choferes` son
`NOT NULL`** (`numero_empleado`, `nombre`, `apellidos`, `dni`, `fecha_nacimiento`, `pais_nacimiento`,
`sexo`): al mover el alta al Dashboard, datos personales que antes cargaba el propio chofer pasan a
ser responsabilidad del administrador. Se decidió que los complete todos, sin relajar la restricción
— con la consecuencia operativa de que **dar de alta a un chofer exige tener su documentación a
mano**, y no se puede improvisar en el momento.

**El cero a la izquierda era real y quedó resuelto como corresponde**: `numero_empleado` es
`text unique not null`, así que `"04"` (Pau, un chofer real) y `"4"` son valores genuinamente
distintos. Se comprobó contra la base: crear `04` devuelve 409 identificando a Pau —la unicidad ya
funcionaba en producción— y `4` se crea como fila aparte. **No se inventó una normalización que la
base no tiene**; lo que sí hace el formulario es mostrar el identificador exacto con el que el chofer
va a entrar, antes de confirmar, para que el cero se vea en pantalla en vez de descubrirse cuando
alguien no pueda entrar. Es la lección del contador del #21 aplicada a otro campo.

⚠️ **El presupuesto de la columna lateral se agotó.** La cuarta entrada de navegación la lleva a
~404px sobre ~390px disponibles: **ya no entra**. Se decidió dejar que el `overflow-y-auto` —puesto
en el #15 justamente como red de seguridad— absorba el excedente, en vez de rediseñar la navegación
dentro de este cambio. El costo es concreto y hay que nombrarlo: **los controles del pie (tema y
cerrar sesión, que el #16 puso ahí deliberadamente) quedan fuera de vista sin scrollear**, lo que
deshace en parte lo que el #16 resolvió. Confirmado en el teléfono que se llega a ellos scrolleando.
**Disparador: la próxima entrada de navegación obliga a repensar la columna, no a estirar la red otra
vez.**

**Práctica que quedó clara tras repetirse**: durante esta serie se crearon dos registros de prueba
contra la base de producción —un administrador temporal y el chofer `4`—. Los dos se limpiaron, y el
segundo se verificó también en **Authentication → Users**, porque una fila de `choferes` borrada deja
un usuario de Auth huérfano que nadie ve en ninguna lista. Es la misma asimetría de siempre: lo
visible se corrige, lo invisible se olvida. Cuando una prueba necesita escribir en producción, el
borrado va en un `finally` y la comprobación va en los dos sistemas.

**Confirmado por el usuario en dispositivo real, con el `.apk` nuevo**: crear el perfil, entrar con
la temporal, que obligue a cambiarla, que la vieja quede rechazada, resetear y que vuelva a pedir el
cambio, dar de baja y no poder entrar, y la pantalla de registro mostrando el mensaje. El chofer de
prueba se borró al terminar. Y una comprobación aparte, que no estaba en la spec pero convenía hacer:
**el DNI no viaja en el Excel exportado**, que es el archivo que se le manda a las empresas clientes.

### 26. El chofer puede cambiar su contraseña por sí mismo (2026-09-23, verificado en dispositivo real)

El punto que el #25 dejó explícitamente fuera de alcance. Se cerró junto con el #27 en un solo
`.apk`, y el motivo del momento no fue técnico sino de canal de distribución: **todavía no había
ningún chofer onboardeado**. Hoy actualizar la app es generar un `.apk` e instalarlo en un teléfono;
con choferes piloto trabajando pasa a ser coordinar con cada persona, explicarle que instale encima
sin desinstalar (#5) y confirmar que lo hizo. Es la asimetría de costo de la lección 6, aplicada al
canal en vez de a los datos. Spec: `spec_deudas_app_movil.md`. Commit `3f83586`.

**El agujero que cierra.** Después del #25 la contraseña del chofer no la conoce nadie más. Pero si
sospechaba que se le había filtrado, su única salida era pedirle a un administrador que se la
reseteara — y el reseteo genera una temporal que el administrador ve. O sea: **para dejar de tener
una contraseña comprometida, el chofer estaba obligado a pasar por una que el administrador
conocía**, justo en el momento en que tenía motivos para desconfiar. El rodeo reintroducía, aunque
fuera por minutos, exactamente la propiedad que el #25 vino a eliminar.

⚠️ **El criterio más fuerte de la spec resultó no hacer falta, y de qué clase es esa garantía.** La
spec exigía que cambiar la contraseña no cerrara la sesión y, sobre todo, que no tocara la base
local: si el logout limpiaba SQLite, un chofer con una jornada abierta sin sincronizar **habría
perdido la jornada por haber hecho lo correcto**. El diagnóstico mostró que el riesgo no existe —
`cerrarSesion()` solo llama a `signOut()` y borra la clave de `SecureStore`; ninguno de los dos toca
SQLite, y ni `updateUser()` ni las funciones de cambio llaman a `signOut()`. Pero conviene anotar
**cómo** se cumple: **por ausencia, no por diseño**. Nada impide que mañana un logout limpie la base
local o que una pantalla nueva llame a `signOut()` después de cambiar la contraseña, y el día que
eso pase no va a fallar nada visible — simplemente un chofer va a perder una jornada.

⚠️ **`updateUser` de Supabase no verifica la contraseña actual**: cambia la clave de quien tenga
sesión válida y no pregunta nada. Un campo "contraseña actual" que no haga algo explícito es
decorativo y da una sensación de seguridad que no existe, que es el inverso exacto de la lección 7.
Se verifica con un `signInWithPassword()` previo. Probado con una contraseña incorrecta (rechazada,
y la real seguía funcionando después del intento fallido) y con la correcta.

⚠️ **Efecto secundario que hay que conocer**: ese `signInWithPassword` está sujeto al rate limit de
Supabase. Un chofer que se equivoque varias veces seguidas con su contraseña actual puede quedar
bloqueado **en el mismo endpoint con el que se entra a la app**, y el síntoma —"no puedo entrar"— no
se parece en nada a lo que estaba haciendo. Es la forma del #22: un fallo que aparece lejos de su
causa.

**Verificado en dispositivo real**, y la comprobación que define el hallazgo se hizo aparte a
propósito: **la contraseña vieja deja de servir** y la nueva entra — cerrando sesión y probando las
tres claves de la ronda, no viendo el mensaje de éxito en pantalla. Sin ese paso, un `updateUser`
que fallara en silencio con la sesión abierta andando por inercia se habría visto exactamente igual,
y el chofer habría quedado creyendo que cerró una filtración que sigue abierta. Además: contraseña
actual incorrecta rechazada con su mensaje propio; una jornada abierta sobrevive al cambio y se
puede cerrar después; un chofer recién creado sigue yendo al cambio obligatorio del #25 y no a la
pantalla nueva; y un reseteo desde el Dashboard vuelve a exigir el cambio.

### 27. La app recupera una jornada abierta que existe en Supabase pero no en el teléfono (2026-09-23, verificado desinstalando la app) — cierra la deuda del #5

La deuda anotada en el #5 el 15/09: si el chofer desinstala la app, Android limpia el almacenamiento
o cambia de teléfono, la base local se va y con ella la jornada abierta. Del lado del servidor no se
perdía nada —si el check-in había sincronizado, la jornada seguía en Supabase, abierta— pero la app
no la veía. Mismo commit `3f83586`.

**El costo real no era la molestia**: el chofer **no podía cerrar esa jornada**, así que quedaba
abierta indefinidamente en el Dashboard y la siguiente no correspondía a lo que efectivamente hizo.
La salida era que un administrador la cerrara a mano, dejando un rastro de auditoría que atribuye el
cierre de un turno ajeno a alguien que no estuvo ahí.

⚠️ **Por qué el #9 no lo cubría, y por qué eso no era un defecto del #9.**
`reconciliarJornadasAbiertas()` recorre lo que SQLite ya tiene y pregunta por cada fila a Supabase.
Con la base local vacía no hay nada sobre lo que iterar: devuelve `[]` sin error. **Funciona
perfectamente y no encuentra nada, que es distinto de fallar.** Hacía falta una consulta por chofer,
no por id — una función nueva, no un arreglo de la vieja.

**La pregunta de la Fase 1 que decidía si esto servía de algo, y cuya respuesta contradijo a la
propia spec**: qué datos del check-in se quedan en el teléfono hasta el check-out. La spec daba por
probable que las fotos no viajaran y montaba sobre esa sospecha una decisión de negocio (cerrar sin
la evidencia del check-in, o pedirle al chofer que la rehaga). **No se queda nada:
`subirJornada()` sube todas las fotos y todos los campos de check-in en la primera sincronización**,
sin importar si la jornada sigue abierta; solo los campos de cierre están condicionados a que esté
cerrada. Confirmado leyendo el código, después contra la base real, y por último en uso — una
jornada abierta aparece **completa y con sus fotos** en el Dashboard. La decisión de negocio que la
spec anticipaba no hizo falta tomarla.

**El criterio que gobierna la recuperación: nunca pisar lo local.** Si el teléfono ya tiene una
jornada abierta, esa manda aunque el servidor tenga otra versión — la local puede contener un
check-in hecho sin señal que todavía no subió, y el servidor por definición no lo tiene. Perder
datos en nombre de recuperar datos habría sido el peor resultado posible.

**Verificado con una sonda, no con una inspección**: se cambió en Supabase el `km_inicial` de una
jornada abierta real de 136585 a `999999` y se disparó la recuperación. El teléfono siguió mostrando
**136585** — la recuperación saltea lo que ya tiene en vez de sobrescribirlo. Una segunda jornada
abierta creada solo en el servidor apareció en el teléfono sin duplicar la que ya estaba: quedaron
dos, no tres. Y sin ninguna jornada abierta en ningún lado, entrar no inventa nada.

**La prueba que cierra el #5, quince días después**: check-in, confirmación de que sincronizó,
**desinstalar** la app, reinstalar, entrar, y la jornada abierta aparece con sus datos y con un
aviso en pantalla de que fue recuperada — y **se puede cerrar**, que es el punto entero. Se
comprobó además el cruce de las dos partes de la spec: cambiar la contraseña con la jornada
recuperada abierta, y que siga ahí. Regresión del #9 confirmada: cerrar desde el Dashboard con la
app abierta sigue funcionando.

**Dos límites conocidos, que se documentan en vez de arreglarse**:

- **Lo que nunca sincronizó no se recupera.** Un check-in hecho sin señal que jamás llegó al
  servidor, en un teléfono que se limpió, no está en ningún lado.
- ⚠️ **La app tolera dos jornadas abiertas del mismo chofer, y la recuperación las trae las dos.**
  Para la recuperación es la decisión correcta —no se puede cerrar lo que no se ve—, pero deja a la
  vista un problema de fondo: **la secuencia que produce dos jornadas abiertas es exactamente la del
  #5**, teléfono limpiado a mitad de turno y chofer que vuelve a hacer check-in porque la app no le
  muestra nada abierto. Y dos jornadas abiertas del mismo chofer en un sistema que calcula horas
  efectivas son **horas solapadas**: el mismo rato de reloj pagado o cobrado dos veces. Hoy nada lo
  señala en ninguna pantalla. Queda como punto abierto del Dashboard.

Pregunta que quedó sin contestar y conviene cerrar: **¿la app filtra las jornadas locales por el
chofer logueado?** El cierre de sesión no limpia SQLite, así que un teléfono que pase de un chofer a
otro puede conservar jornadas del anterior. Es anterior a este commit y no lo introdujo, pero si la
respuesta es que no filtra, es un hallazgo por derecho propio.

### 28. Una corrección hecha desde el Dashboard sobre una jornada abierta se pierde cuando el chofer la cierra (detectado 2026-09-23, resuelto y confirmado en dispositivo real 2026-09-26)

**El escenario, tal como se confirmó primero**: un administrador ve un `km_inicial` mal cargado a
media mañana y lo corrige desde `/jornadas`. Queda el badge "Editado" del #6 y el #7, con su nombre
y su motivo. A la tarde el chofer cierra la jornada desde la app, la app vuelve a subir los campos
de check-in, y **el valor corregido desaparece**. No hay error, no hay conflicto, la jornada se
cierra normal. Lo que lo volvía grave no era el dato perdido: **el rastro de auditoría sobrevivía a
la corrección que registraba** — quedaba una jornada que afirmaba "editado por Fulano, motivo X" al
lado del valor original intacto.

**Decisión de negocio, tomada antes de escribir la spec: gana el Dashboard, y el teléfono recibe la
corrección.** El administrador es quien tiene el contexto para corregir un dato, y su corrección no
se puede perder — ni en una jornada que sigue abierta (el chofer tiene que verla antes de cerrar) ni
en una ya cerrada (tiene que llegar al historial). Spec: `spec_correccion_gana_dashboard.md`.
Commits `7f98637`, `5566fd7`, `aa622f8`.

**Fase 1 encontró la intersección real de campos en disputa** (los que edita `POST
/api/jornadas/editar` y que la app también vuelve a subir: kilometraje y combustible, inicial y
final) y confirmó que `subirJornada()` hace un `upsert` de la fila entera, no un `update` selectivo
— lo que decidía que la garantía final tenía que vivir en la base, no solo en la app, porque un
`.apk` viejo instalado a mano (#5) iba a seguir subiendo la fila completa sin enterarse de ningún
cambio de código nuevo.

Qué quedó, en tres partes:

- **Parte A — registro por campo**: columna `jsonb` `campos_editados_admin` en `jornadas`, escrita
  en el `UPDATE` del Dashboard, en vez de una tabla de auditoría aparte (no se pidió historial de
  versiones) o columnas paralelas por campo (rígido). El badge "Editado" pasa a poder decir **qué**
  se corrigió.
- **Parte B — descarga consolidada**: `sincronizarCambiosDelServidor()` reemplaza los dos mecanismos
  que ya existían por separado —`reconciliarJornadasAbiertas()` (#9) y la recuperación por chofer
  (#27)— con una sola consulta por chofer que cubre recuperación de jornada abierta, reconciliación
  de cierre remoto **y** descarga de correcciones al mismo tiempo. Watermark `editado_en >
  marca_de_agua`, persistido en `SecureStore` (no en SQLite, para sobrevivir a un reinstall) y
  avanzado siempre en bloque completo, nunca parcial, para no perder una corrección por un fallo a
  mitad de la descarga.
- **Parte C — la garantía, en la base**: un trigger `BEFORE UPDATE`
  (`jornadas_proteger_correcciones_admin_trigger`) que distingue `auth.role() = 'service_role'` (el
  Dashboard, que queda exento y es quien marca el jsonb) de cualquier otro caso (la app, a la que se
  le fuerza NEW→OLD campo por campo en los campos ya corregidos). Vive en la base y no en la app
  **a propósito**: cubre también al `.apk` que nadie actualizó.

Dos bugs propios de esta implementación, encontrados durante la verificación en dispositivo y
corregidos antes de cerrarla — ninguno de los dos era un error en el diseño de arriba, los dos
bloqueaban que funcionara:

1. **Una clave de `SecureStore` ilegal bloqueaba toda la Parte B, siempre, sin excepción.** La clave
   `"marcaAguaCorreccionesAdmin:"` usa `:`, carácter que `SecureStore` no admite (solo alfanumérico,
   `.`, `-`, `_`). Cada llamada a `obtenerMarcaAgua()` lanzaba una excepción antes de tocar Supabase
   o SQLite — por eso el fallo era 100% reproducible sin importar sesión, token ni conectividad.
   Cinco hipótesis previas (expiración de token por `AppState`, un `usuario` nulo por closure vieja
   en `NetworkContext`, el chofer de prueba eliminado de Auth, entre otras) se plantearon y
   descartaron una por una **con pruebas reales en el dispositivo**, no por lectura de código, antes
   de que un `adb logcat` mostrara la excepción real. Fix: separador `_` en vez de `:` (commit
   `5d60495`). **La lección que deja, y que se repite en el #29: una verificación que no corre en el
   dispositivo no verifica nada que toque un módulo nativo** — los 18 escenarios de la Fase 1
   corrieron contra Supabase real y ninguno pasó por `SecureStore`.
2. **La unión de `fotos_incidencia` perdía las fotos que había subido el chofer.** No era un error en
   la unión del trigger — esa parte estaba bien escrita. `aplicarCorreccionesAdmin()` (la función de
   la Parte B que aplica la descarga) escribía la URL de la foto que había agregado el administrador
   también en `fotosIncidenciaUris`, una columna pensada solo para fotos locales todavía sin subir.
   Eso hacía creer a `subirJornada()` que ya no tenía nada propio para mandar, así que el trigger
   nunca recibió del chofer nada que unir — no fallaba la unión, fallaba lo que llegaba a unir. Fix
   (parte del commit `424a3cb`, junto con el #29): dejar de escribir esa URL en la columna local,
   cambiar el criterio de "¿ya subí?" de "el array tiene longitud" a "esta URL en particular ya
   está", y unir en el propio teléfono con un `Set` antes de subir, para no duplicar en un reintento.

**Verificado en dispositivo real, con la ronda completa de pruebas de la spec**: el kilometraje del
administrador y el check-out del chofer sobreviven juntos en una jornada abierta; el mismo caso en
modo avión entre la corrección y el cierre (la prueba que confirma que la garantía vive en la base y
no depende de que la descarga haya corrido); con la app abierta, el chofer ve el valor nuevo y el
aviso sin reinstalar ni reiniciar; una jornada ya cerrada actualiza su historial con el valor
corregido (una vez resuelto también el #29-Parte E, que dejaba la pantalla de Detalle de Jornada sin
refrescarse); una jornada con check-in sin sincronizar sobrevive intacta a todo lo anterior (#27); y
las regresiones del #9 y del badge "Editado" siguen funcionando. **Hallazgo #28 cerrado.**

⚠️ Con esto resuelto, cae la mitigación operativa del punto 11 del plan del piloto ("una jornada se
corrige desde el Dashboard solo cuando está cerrada") — ver la actualización en
`plan_despliegue_piloto.md`.

### 29. La sincronización no era idempotente: una subida interrumpida a mitad podía quedar trabada para siempre (medido probando el caso offline completo del #28, 2026-09-25/26, resuelto y confirmado en dispositivo real)

Encontrado probando por primera vez —recién ahora, quince días después de escrito el checklist— el
caso "cargar una jornada sin señal y sincronizar después", que estaba anotado como prueba de
**Semana 2** del piloto. Falló en el primer intento. Spec: `spec_sincronizacion_reintentable.md`.
Commit `424a3cb` (después de `5d60495`, el fix de `SecureStore` del #28, y de `dc28032`, ver #30).

**El bug, medido y no supuesto.** Una jornada creada sin señal, con sus 3 fotos, no subía nunca — ni
con señal, ni con pull-to-refresh forzado. Nueve intentos fallidos, siempre el mismo error de
`RowLevelSecurity`. El mecanismo, confirmado paso por paso contra la base real: `subirJornada()`
sube las fotos **antes** de escribir la fila de `jornadas`; en un intento anterior la foto de
check-in **ya se había subido** (confirmado mirando el archivo en el bucket); la sincronización se
cortó antes de escribir la fila; y desde entonces cada reintento escribía un path que ya existía —
eso ya no es un `INSERT`, es un `UPDATE` sobre `storage.objects`. El bucket `evidencias` tenía
**solo** policies de `INSERT` y `SELECT` (confirmado con `pg_policies`): sin `UPDATE`, RLS rechazaba
cada reintento.

⚠️ **Por qué es el bloqueante más grave de todo el piloto, más que el #21.** Una conexión que se
corta a mitad de una sincronización no es el caso raro para un camión — es un túnel, un sótano, una
zona rural. El resultado es una jornada que no se puede subir **nunca**, con el chofer viendo "error
al enviar" para siempre y sin ninguna salida. Un turno trabajado que no llega al sistema es un turno
que no se paga y no se cobra, y a diferencia del #21 (un reporte incompleto que alguien podía volver
a generar), acá el dato no estaba en ningún lado para recuperarlo — el perjudicado es el chofer y no
tiene cómo enterarse.

**El defecto de fondo no era la policy que faltaba.** Taparlo con "agregar un UPDATE" habría dejado
abierta la pregunta de qué pasa si se corta después de la foto 2, o después de la fila. El criterio
que quedó es más amplio: **reintentar una sincronización de varios pasos tiene que ser seguro desde
cualquier punto de interrupción** — idempotencia de toda la secuencia, no un parche puntual.

Qué quedó, en las partes de la spec:

- **Parte A**: policy de `UPDATE` sobre `storage.objects` para `evidencias`, con **exactamente** la
  misma condición de carpeta que la de `INSERT` (`storage.foldername(name)[1] = auth.uid()::text`).
  Sin `DELETE` — no hace falta para el reintento y una evidencia que se puede borrar es un problema
  peor. Plegada en `supabase/schema.sql` (regla del #23) y aplicada a la base real, confirmada viva
  con `pg_policies`.
  ⚠️ **Concern retractada en la propia conversación de esta spec**: que esto debilitara la protección
  del #7 (la foto de tacómetro final no reemplazable). No la debilita — esa protección vive en el
  Route Handler del Dashboard con `service_role`, que ignora RLS por completo; estas policies (para
  el rol `authenticated`) nunca sostuvieron esa garantía. La única exposición real, y aceptada, es
  que un chofer pueda sobrescribir sus propias fotos en sus propias jornadas — lo cual además repara
  un archivo truncado por una subida cortada, en vez de dejarlo malo para siempre.
- **Parte B — auditoría de idempotencia de `subirJornada()` paso por paso**: con la policy de
  `UPDATE`, las fotos ya son seguras de reintentar; la fila de `jornadas` va por `upsert`, que ya lo
  era. Confirmado en el reintento que el trigger del #28 sigue protegiendo los campos que un
  administrador corrigió — un `upsert` sobre una jornada ya corregida no pisa la corrección. El tope
  de intentos (`MAX_INTENTOS = 5`) contaba **todos** los fallos, incluidos los de falta de señal —
  redefinido para que un fallo sin conectividad no cuente contra el tope (vuelve a `'pendiente'` sin
  consumir intento) y solo cuenten los fallos **con** señal presente.
- **Parte C — mensaje accionable**: la app ya no distingue "sin señal, todavía" de "esto no se va a
  resolver reintentando" con el mismo "error al enviar" de siempre. Agotado el tope de intentos con
  señal presente, la app muestra un estado distinto en vez de seguir reintentando en silencio para
  siempre.
- **Parte D — la unión de `fotos_incidencia`**: descrita en el #28 (mismo commit), porque el bug
  vivía en la implementación de esa spec, no en esta.
- **Parte E — `DetalleJornadaScreen` no se refrescaba**: `HistorialScreen` se había suscrito a la
  señal de corrección en el #28; esta pantalla no, y es la que el chofer mira antes de cerrar la
  jornada. Se agregó la misma suscripción.

Verificado en dispositivo real: una jornada creada sin señal, con la red cortada a propósito después
de subir una sola foto (modo avión durante la subida) y reconectada después, terminó de subir sola,
completa; la jornada que ya estaba trabada (`c0b181b9…`) subió; cortar después de la foto 1, la 2, y
después de las 3 pero antes de la fila se resolvió reintentando en los tres casos; reintentar una
jornada que ya había subido no duplicó fotos ni creó una fila nueva; una corrección de administrador
sobrevivió a un reintento; las fotos de incidencia del administrador y del chofer quedaron todas, sin
duplicados; el mensaje de "sin señal, se va a enviar cuando haya" se mostró correctamente. **El único
ítem que quedó sin fabricar deliberadamente es el mensaje del tope agotado con señal presente** — es
difícil de forzar a propósito ahora que un reintento con señal casi siempre tiene éxito, y queda
verificado por revisión de código, no por prueba en el dispositivo.

⚠️ **Corrección a una deuda que el #23 dejó anotada**: `npm run types:supabase` regenera tipos de
columnas, pero no compara policies de Storage, triggers ni índices contra la base real — la policy de
`UPDATE` que faltaba es exactamente el tipo de deriva que ese comando nunca iba a atrapar. Ningún
proceso automático cubre hoy ese hueco; queda como punto abierto.

**Regresiones confirmadas en la misma ronda**: #9 (cierre desde el Dashboard con la app abierta), #27
(desinstalar/reinstalar, con la jornada abierta reapareciendo rápido), y un check-in normal con señal
subiendo como siempre. **Hallazgo #29 cerrado.**

### 30. Bug de navegación por doble tap, encontrado como subproducto de esta ronda (2026-09-25, resuelto y confirmado en dispositivo real)

Anterior al #28 y al #29, y sin relación con ninguno de los dos — apareció mientras se instrumentaba
la app para diagnosticar el #29. Un doble tap sobre una jornada apilaba dos instancias de
`DetalleJornadaScreen` una encima de la otra, visualmente indistinguibles salvo por un detalle: con
la app sin señal, se veían **dos** franjas de "sin conexión" en vez de una, superpuestas. Diagnosticado
con la prueba metódica de "¿volver atrás una vez le saca una franja?" — sí, confirmando el apilado.

Fix: guardas de debounce en la navegación desde `CheckInScreen.tsx` y `HistorialScreen.tsx` (commit
`dc28032`). Verificado en dispositivo real: doble tap ya no apila pantallas. **Hallazgo #30 cerrado.**

### 31. La incidencia del check-in pasa a ser estructurada, igual que la del check-out (2026-09-26, implementado; pendiente de verificación en dispositivo real)

Cierra la pregunta que había quedado abierta en el punto "`horaIncidencia`, ¿una sola está
garantizada o es lo que pasa hoy?" de hallazgos anteriores. Confirmado leyendo el código (no
supuesto): el modelo de datos garantiza, en las tres capas (tipos, esquema de Supabase, UI), que hoy
una jornada tiene como máximo una incidencia estructurada — la del check-out. El check-in solo tenía
un campo de texto libre (`incidencias: string`), sin tipo, sin fotos. Spec:
`spec_incidencia_en_checkin.md` (guardada en este proyecto), aprobada explícitamente por el usuario
("crear igual que check-out").

Qué quedó, siguiendo el mismo patrón de nomenclatura que ya usa el proyecto para todo lo que existe
en dos momentos de la jornada (`kmInicial`/`kmFinal`, sufijo `Checkin`/`_checkin`, **sin tocar ni
renombrar** ninguno de los campos ya desplegados del check-out):

- **App móvil**: `CheckInForm.tsx` reemplaza el campo de texto libre por el mismo componente
  `IncidenciasForm.tsx` que ya usa `CheckOutForm.tsx` — mismo tipo (4 opciones fijas), detalle
  obligatorio solo con "Otro", fotos de respaldo. `DetalleJornadaScreen.tsx` muestra la incidencia de
  check-in en su propia sección, igual que la de check-out. SQLite local (`database.ts`,
  `jornadasRepo.ts`) y `syncService.ts` (subida de fotos e incidencia) siguen el mismo patrón exacto
  que ya usan las columnas de check-out.
- **Esquema**: `schema_v12_incidencia_checkin.sql` agrega `tuvo_incidencia_checkin`,
  `tipo_incidencia_checkin` (mismo `check` de 4 valores que el de check-out), `detalle_incidencia_checkin`,
  `fotos_incidencia_checkin` — aplicado contra la base real y plegado en `schema.sql` (regla del
  #23). El campo viejo `incidencias` (texto libre) **no se borra ni deja de leerse** — queda de solo
  lectura para el histórico, sin migración automática: no hay forma de partir un texto libre en
  tipo/detalle sin inventar datos.
- **Dashboard**: `jornada-detalle-dialog.tsx` y `tabla-jornadas.tsx` distinguen la incidencia de
  check-in de la de check-out, cada una con su propia galería de fotos sin límite. Una jornada vieja
  sin datos `_checkin` sigue mostrando su `incidencias` de texto libre tal cual, sin badge.
- **Excel (`server/mock/reportes.js`)**: la única sección de incidencia (¿tiene?/tipo/descripción/
  hora/3 fotos) se reemplazó por **dos paralelas**, una por etapa (de 4+3 a 8+6 columnas) — sin
  reusar el join por salto de línea que ya estaba escrito "para el día que una jornada admita más de
  una incidencia", porque ese día llegó de una forma distinta a la anticipada (dos etapas
  independientes, no varias incidencias de la misma etapa) y la celda de hora, como ya advertía el
  comentario original de `obtenerIncidencias()`, no admite dos valores en una sola celda numérica.
  Para el histórico sin datos estructurados, se muestra `incidencias` en la columna de descripción
  del check-in con el tipo en blanco/"N/A", sin marcar "¿Incidencia Check-In?" como "SÍ" — mismo
  criterio que el badge del Dashboard, que solo se activa con datos estructurados.

**Fuera de alcance, a propósito** (§6 de la spec): el Dashboard no gana forma de editar/completar la
incidencia de check-in de forma remota — no hay hoy un flujo de "cerrar jornada" equivalente para el
check-in, a diferencia del check-out (Hallazgo #6); las columnas `_checkin` no entran en la
protección de correcciones del administrador del #28 (esa lista sigue siendo solo los campos de
check-out, que es lo único que el Dashboard puede tocar).

⚠️ **Verificación pendiente — sin `device_bash` disponible en este entorno para correr
`tsc`/`lint`/`format:check` contra el proyecto real ni generar un `.apk` nuevo.** Se hizo una
revisión manual de consistencia entre las tres capas (tipos móviles, columnas de Supabase/
`database.types.ts`, y el contrato `route.ts` ↔ `reportes.js` que decide qué campos le llegan al
generador de Excel) y una verificación de sintaxis de `reportes.js`, pero falta correr los tres
comandos de la Fase 3 en los tres sub-proyectos tocados (raíz, `dashboard/`, `server/mock/`) y la
prueba end-to-end en dispositivo real que pide el §7 de la spec (check-in con incidencia "Otro" + 2
fotos, check-out con otra incidencia distinta, confirmar Dashboard y Excel para esa jornada, y una
jornada vieja con solo `incidencias` de texto libre). Queda anotado como pendiente hasta que el
usuario los corra.

## Cierre de la serie #11-#28 y qué queda abierto

Dieciocho hallazgos y veintidós commits en siete frentes: adaptar el Dashboard a un teléfono
(#11-#16), volver confiables las fechas y horas en las tres etapas donde aparecen —filtrado,
presentación y reporte— (#17-#20), garantizar que el reporte contenga exactamente las jornadas que
corresponde (#21), encender la verificación de columnas que nunca había existido (#23), darle
entidad propia a los camiones antes de que la matrícula suelta se convierta en un problema (#24),
mover el alta de choferes al Dashboard sin que el administrador quede con las credenciales de nadie
(#25-#26), y devolverle a la app la capacidad de recuperar una jornada que solo existe en el
servidor (#27). El alto útil del mapa en horizontal recorrió **207px → ~290px → ~390px**, la trampa
de scroll desapareció, y los reportes pasaron de tener el rango corrido, las horas en UTC y filas
faltantes a ser un archivo completo con el que se puede calcular. Ocho lecciones que valen más que
el código:

1. **Medir, no deducir.** Las tres correcciones fallidas del mapa (#11) fallaron todas por lo mismo:
   diagnosticar leyendo código sin poder ver la página rota. Se resolvió en una sola pasada apenas
   hubo una medición real. Y una sola pregunta —*"¿falla también en escritorio o solo en el
   teléfono?"*— partió el problema al medio en un paso. El mismo criterio cerró del #17 al #27:
   forzar `TZ=UTC`, generar un `.xlsx` de verdad y releerlo, rastrear tres caminos hasta el render en
   vez de fiarse de un `"use client"`, leer los `.d.ts` instalados en vez de suponer qué verifica una
   librería, forzar una violación de `CHECK` para ver si el rollback de verdad limpia, desinstalar la
   app en serio en vez de simular que la base local está vacía. ⚠️ Y su corolario, que el #23 dejó a
   la vista: **una prueba que no puede fallar no es una prueba.** Ahí una implementación compiló
   limpia, sin casts, y no verificaba nada; lo único que lo delató fue introducir un error a
   propósito y comprobar que el compilador lo rechazaba. El #26 tiene su versión: la pantalla decía
   "listo" y el chofer seguía usando la app, pero eso se habría visto igual con un cambio que falló
   en silencio — la prueba era cerrar sesión y comprobar que **la contraseña vieja deja de entrar**.
2. **Un presupuesto medible convierte una discusión de gusto en aritmética.** En el #14, fijar
   "las barras no superan 100px" hizo que la decisión de fusionar saliera sola (3 filas × 44px =
   132px, imposible), en vez de ser una preferencia discutible. En el #16 el mismo criterio descartó
   la barra delgada por su costo en píxeles, no por opinión. En el #24 ese presupuesto ya escrito
   permitió **anticipar** el costo de una función nueva antes de construirla. Y en el #25 avisó que
   se había agotado — un presupuesto sirve tanto para autorizar como para frenar.
3. **Declarar, no heredar.** Del #17 al #21 es el mismo error seis veces: `toISOString()` heredaba la
   zona UTC, `toLocaleTimeString` sin `timeZone` heredaba la del proceso, `es-MX` heredaba su
   convención de 12 horas, entregarle un `Date` a `exceljs` habría heredado la suya, el formulario de
   cierre heredaba la del navegador, y el diálogo de exportar heredaba un rango por defecto que nadie
   había pedido. Cada vez que el código deja que otro decida —el entorno, una librería, un valor por
   defecto que tapa un dato ausente— el resultado cambia según dónde corra, y falla en silencio.
   **Zona, locale, formato y criterio de filtrado se declaran siempre explícitamente.**
4. **El síntoma tiene forma, y la forma descarta causas.** En el #20, un desfase de dos horas exactas
   no podía venir de la regresión que se estaba buscando, porque esa regresión trunca segundos: no
   corre horas. En el #22, un `429` no podía venir de un servidor cuyo código solo emite 400/200/500.
   Antes de investigar una hipótesis conviene preguntarse si el síntoma observado es siquiera *de la
   forma* que esa hipótesis produciría. Es el filtro más barato que existe.
5. **Mostrar el número antes de actuar convierte un fallo silencioso en uno visible.** El contador
   del #21 no arregla nada por sí mismo: lo que hace es poner en pantalla, antes del paso
   irreversible, la cifra que el usuario puede contrastar con lo que está viendo. El #25 aplicó lo
   mismo a otro campo: mostrar el identificador exacto con el que el chofer va a entrar, para que un
   cero a la izquierda se vea antes y no después. Cuando una operación produce algo que después nadie
   va a auditar, anunciar de antemano qué va a contener vale más que cualquier prueba automática.
6. **Hay una ventana en la que un arreglo estructural es barato, y se cierra sola.** El #19 cambió el
   tipo de las celdas del Excel porque **todavía no las usaba nadie**; el #24 le dio entidad a los
   camiones **antes** de que la matrícula suelta produjera un solo problema; el #26 y el #27 entraron
   en un `.apk` mientras actualizar la app seguía siendo instalar un archivo en un teléfono propio y
   no coordinar con cada chofer. En los tres casos el costo no lo fija la dificultad técnica sino
   cuántos datos, cuántos dispositivos y cuánto trabajo ajeno ya dependen de lo que se va a cambiar,
   y eso solo crece. ⚠️ El corolario incómodo: a veces hay que actuar **sin** evidencia de que el
   problema ya ocurrió — y entonces corresponde decir que no la hay, en vez de fabricar una urgencia
   para justificar la decisión.
7. **Un control se mide por lo que impide, no por lo que registra.** El rastro de auditoría de los
   #6 y #7 estaba bien escrito y funcionaba; lo que lo dejaba sin efecto era algo que no estaba en
   ese código: que el administrador conservara la contraseña del chofer y pudiera actuar en su
   nombre (#25). Al evaluar un control conviene preguntarse no solo "¿registra lo que tiene que
   registrar?" sino **"¿qué camino queda abierto para hacer lo mismo sin pasar por acá?"**. La
   respuesta casi nunca está en el archivo que uno está mirando.
8. **Un registro puede sobrevivir al hecho que registra.** El #28 dejó, mientras estuvo abierto, una
   jornada con el badge "Editado", el nombre del administrador y el motivo, al lado del valor sin
   corregir: la corrección se perdía, el rastro de la corrección no. Es el reverso de la lección 7 —
   **un registro correcto puede volverse falso sin que nadie lo toque**, porque describe un hecho que
   otro camino deshizo después. Al diseñar una auditoría no alcanza con preguntarse si anota lo que
   pasó: hay que preguntarse **qué puede pasar después que la vuelva mentira**.

### Extensión de la serie: #28-#30, cerrando el punto más importante que quedaba abierto

Con el #28 resuelto, el #29 encontrado y resuelto en la misma ronda, y el #30 como subproducto menor,
queda una novena lección, de la clase más cara de todo el proyecto porque el dato perdido no era una
fila incompleta sino un turno de trabajo entero:

9. **Un permiso que falta no es el defecto; es el síntoma de que una operación de varios pasos no es
   segura de reintentar.** El #29 se pudo haber cerrado como "faltaba una policy de `UPDATE`" y habría
   quedado exactamente igual de roto la próxima vez que el corte pasara en un punto distinto de la
   secuencia. La pregunta que hay que hacerse ante cualquier operación de varios pasos que se puede
   interrumpir es **"¿cada paso es seguro de repetir si el anterior ya se completó?"**, paso por paso
   y no en general — es la misma disciplina que exige un `upsert` bien pensado, aplicada a una
   secuencia completa de subida de archivos y fila.

⚠️ **Lo que queda abierto, nada bloqueante para el piloto**:

- **Nada señala que un chofer tenga dos jornadas abiertas a la vez** (#27), que es el estado que
  produce horas solapadas — el mismo rato de reloj pagado o cobrado dos veces. La secuencia que lo
  genera es la del #5. Lo natural es que `/jornadas` lo marque.
- **¿La app filtra las jornadas locales por el chofer logueado?** (#27). El logout no limpia SQLite,
  así que un teléfono que cambie de manos puede conservar jornadas del chofer anterior. Se responde
  leyendo código; si no filtra, es un hallazgo propio.
- **La navegación no tiene más margen** (#25). La cuarta entrada ya excede el presupuesto de la
  columna lateral en horizontal y los controles del pie quedan fuera de vista sin scrollear.
  **Disparador: la próxima entrada obliga a repensar la columna** —agrupar entradas, un menú, lo que
  corresponda— y no a estirar otra vez el `overflow-y-auto`.
- **Segunda etapa de la flota**: que la jornada apunte al vehículo en vez de guardar texto. Lo
  primero que tiene que resolver es la **doble normalización** de matrícula entre la app y la tabla.
- **`Input`/`Select` no cumplen los 44px de alto en móvil**, en todo el Dashboard. Ciclo corto, y
  conviene antes de que haya administradores cargando datos desde el teléfono. ⚠️ Con un detalle
  nuevo sin verificar en dispositivo: el pill de la columna lateral usa un breakpoint (`max-lg`)
  distinto del de `Input`/`Select` (`md`) para el mismo piso de 44px.
- **La columna `combustible` del Excel como texto** con el `%` pegado: es la que más toca los
  cálculos para los que el sistema existe.
- **`desfaseMinutos()` duplicado** en `rango-fechas-espana.ts` y `hora-espana.ts` (#20), con
  disparador, más el **correo sintético** copiado entre la app y el Dashboard (#25).
- ✅ **`horaIncidencia`, ¿una sola está garantizada o es lo que pasa hoy?** — cerrada por el Hallazgo
  #31: el check-in ahora tiene su propia incidencia estructurada, independiente de la de check-out,
  con su propia hora (`fechaCheckIn`) en el Excel. Pendiente solo la verificación en dispositivo real
  descrita en ese hallazgo.
- **Rastros de un origen mexicano en un sistema que opera en Barcelona.** El `es-MX` del #18 y el
  centro por defecto de `MapaFlota` en Ciudad de México aparecieron por caminos independientes.
  Conviene un barrido corto (`es-MX`, `MX`, "México", coordenadas por defecto) en `dashboard/` y
  `server/mock/`.
- La columna lateral en un teléfono más chico (#16), ya descrita en su hallazgo.
- **El mensaje de "fallo irrecuperable, avisar a la empresa" del #29** quedó verificado por revisión
  de código, no fabricado en el dispositivo — es difícil de forzar a propósito ahora que un reintento
  con señal casi siempre tiene éxito. No bloqueante; anotado para la próxima vez que aparezca una
  jornada realmente trabada.
- ⚠️ **Ningún proceso automático compara policies de Storage, triggers ni índices contra la base
  real** (#23, confirmado real por el #29): `npm run types:supabase` solo regenera tipos de columnas.
  Una policy que exista en producción y no esté en `schema.sql` (o viceversa) no la atrapa nada hoy.
- **Datos de prueba pendientes de limpiar en los dos sistemas**: el chofer `999` (fila de `choferes`
  y usuario de Supabase Auth, usado activamente durante toda la ronda del #28/#29) y la jornada
  sintética `2816f811-fa54-4a29-b262-f526726baf96`. Limpiar recién ahora que la ronda de pruebas
  terminó.
