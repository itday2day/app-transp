# Plan de despliegue — piloto de prueba con choferes reales

_app-transp · armado 2026-09-12, vigente al 2026-09-26. Alcance: checklist técnico + piloto de 1-2
choferes durante 1-2 semanas, antes de sumar al resto de la flota._

_El historial técnico completo —30 hallazgos, sus causas y cómo se verificó cada arreglo— vive
aparte, en **`hallazgos_piloto.md`**. Este documento es el que se usa **durante** el piloto; ahí está
el porqué de cada decisión que aparece acá._

## Parte A — Checklist técnico (antes de invitar a nadie)

Verificar esto en orden. Todo corre contra el Supabase y Render **reales** — no hay ambiente de
staging separado, así que cualquier dato que se cargue acá es dato real desde el día uno.

1. **Servicios de Render arriba y respondiendo**
   - Abrir `https://app-transp-dashboard.onrender.com` y `https://app-transp-mock-server.onrender.com`
     una vez cada uno para "despertarlos" (plan free, se duermen a los 15 min sin tráfico).
   - Confirmar que las env vars sensibles estén cargadas en ambos servicios de Render:
     `SUPABASE_SERVICE_ROLE_KEY`, `DASHBOARD_SESSION_SECRET`, `RESEND_API_KEY`, `MOCK_SERVER_URL`,
     `GEOAPIFY_API_KEY` (ver Hallazgo #1) — sobre todo después de haber retirado
     `DASHBOARD_ADMIN_PASSWORD`, confirmar que no quedó ninguna referencia rota.
   - ⚠️ **Cuidado al cargar env vars: `app-transp-dashboard` (`srv-...bo0`) y `app-transp-mock-server`
     (`srv-...bn0`) tienen IDs casi idénticos** — confirmar siempre en qué servicio se está cargando
     cada variable antes de guardar (Hallazgo #3, donde esto causó que `RESEND_FROM_EMAIL` no
     surtiera efecto por quedar en el servicio equivocado).
   - **Dos errores transitorios conocidos al exportar un reporte, los dos se resuelven reintentando
     y ninguno es un bug del sistema**:
     - `502` — el servidor de reportes estaba dormido (cold start del plan free). Se ve en los logs
       del servicio en Render. La **primera** exportación del día es la candidata.
     - `429` — un bloqueo transitorio de la capa que Render pone delante (Cloudflare). ⚠️ **No
       aparece en ningún log de Render**, porque el pedido nunca llega al servicio: buscarlo ahí es
       perder el tiempo (Hallazgo #22).

2. **Login de administrador**
   - Confirmar que el admin cargado en la tabla `admins` puede loguearse, ver el mapa (`/mapa`), la
     tabla de jornadas (`/jornadas`), la flota (`/flota`) y los choferes (`/choferes`).
   - Si va a haber más de un administrador mirando el piloto, cargar sus cuentas ahora (alta manual
     en el SQL Editor de Supabase, con el hash de contraseña generado — ver la spec de roles de
     administrador guardada en este proyecto).
   - ⚠️ **Si se crea un admin de prueba, borrarlo al terminar.** Es una credencial con acceso total a
     datos que sustentan pagos, y "no la uso más" no es lo mismo que "no existe".
   - **El Dashboard ya es usable desde el navegador de un teléfono**, en vertical y en horizontal
     (Hallazgos #11 a #16, #24 y #25, todos confirmados en dispositivo real). Un administrador puede
     seguir el piloto desde el celular sin necesidad de abrir la laptop — útil para revisar jornadas
     al final del día o mirar el mapa en vivo desde la calle.

3. **Cargar la flota real** — nuevo (Hallazgo #24)
   - La pantalla `/flota` del Dashboard permite dar de alta cada camión con su matrícula, tipo de
     propiedad (propio / alquilado / autónomo), capacidad de tanque (opcional), marca, modelo y año.
   - **Cargar los camiones reales antes de que empiecen a cargarse jornadas reales.** Las 9
     matrículas que aparecen hoy en las jornadas son datos de prueba y no sirven como flota.
   - Los camiones de autónomos también se cargan: el tipo de propiedad es lo que después permite no
     mezclar su consumo de combustible con el costo de la empresa.
   - Un camión que se vende o se devuelve **se da de baja, nunca se borra** — si no, las jornadas
     viejas de ese camión quedan sin forma de interpretarse.

4. **Dar de alta a los choferes piloto** — cambió por completo (2026-09-23, Hallazgos #25 y #26)
   - **Ya no se crea nada a mano en Supabase.** El alta se hace desde la pantalla `/choferes` del
     Dashboard, y esa es **la única vía**: el registro desde la app quedó deshabilitado.
   - ⚠️ **Juntar la documentación del chofer antes de sentarse a cargarlo.** El formulario tiene
     campos obligatorios que antes cargaba el propio chofer al registrarse (entre ellos país y fecha
     de nacimiento, con edad mínima 18). Si falta alguno, el alta se interrumpe a mitad.
   - ⚠️ **El número de empleado es texto, y los ceros a la izquierda cuentan: `04` y `4` son dos
     choferes distintos** y generan dos usuarios distintos. La pantalla muestra el usuario exacto
     antes de confirmar — **leerlo ahí**, no descubrirlo cuando alguien no pueda entrar.
   - **La contraseña temporal la genera el sistema y se muestra una sola vez.** No se guarda en
     ningún lado ni se puede volver a ver: si se pierde, se resetea (lo que genera otra nueva y
     vuelve a exigir el cambio). Dictársela al chofer en el momento, no mandarla por escrito.
   - El chofer **está obligado a cambiarla en su primer ingreso** y no puede hacer nada más hasta
     que lo haga. A partir de ahí, su contraseña no la conoce nadie más — y **puede cambiarla él
     mismo cuando quiera** desde la app, sin pasar por un administrador (#26).
   - ⚠️ **Si el chofer olvida su contraseña, no hay forma de recuperarla.** El correo es sintético,
     no existe, no hay a dónde mandar un enlace. La única salida es un reseteo desde el Dashboard.
   - **Dar de baja corta el acceso**, no solo saca al chofer de la lista. ⚠️ Pero la app es
     offline-first: un chofer con la sesión ya abierta puede seguir cargando jornadas en el teléfono
     hasta que intente sincronizar. La baja es inmediata para entrar, no para lo que ya esté cargado.
   - **Un chofer nunca se borra, se da de baja** — sus jornadas viejas tienen que seguir teniendo
     sentido, igual que con los camiones.
   - ⚠️ **Si se crea un chofer de prueba, borrarlo en los dos lados**: la fila de `choferes` **y** el
     usuario de Supabase Auth. Que no aparezca en la lista del Dashboard no significa que la
     credencial haya dejado de existir.

5. **Instalación en el celular del chofer** — ⚠️ ver Hallazgo #5 antes de actualizar el `.apk`
   - Como no hay build de iOS todavía, el piloto debe arrancar con choferes que tengan **Android**.
   - Instalar el `.apk` de la build `preview` (`eas build --platform android --profile preview`)
     directo en el celular — no hace falta Play Store. El `.apk` vigente incluye pull-to-refresh
     (#8), reconciliación de cierres remotos (#9), la UX del #10, el cambio de contraseña obligatorio
     del #25, el cambio voluntario del #26, la recuperación de jornadas abiertas del #27, la
     corrección del administrador ganando y llegando al teléfono (#28), y la sincronización
     reintentable de punta a punta (#29) — todo confirmado funcionando en dispositivo real. ⚠️ **Con
     el Hallazgo #31 (incidencia estructurada de check-in) implementado pero sin `.apk` nuevo
     generado todavía**, esta build sigue siendo la vigente hasta que se genere una que lo incluya y
     se corra la verificación de dispositivo que ese hallazgo deja pendiente.
   - **Al actualizar el `.apk` en un celular que ya lo tiene instalado: instalar el nuevo directo
     encima del anterior, nunca desinstalar primero** (Hallazgo #5 — desinstalar borra la base local
     y la sesión del chofer).
   - **Si aun así se pierde la base local** (teléfono nuevo, reset de fábrica, borrado de datos), la
     app ya **recupera sola** al entrar cualquier jornada abierta que el chofer tenga en el servidor,
     con sus datos y sus fotos, y avisa en pantalla (#27). ⚠️ El único caso irrecuperable es un
     check-in hecho sin señal que **nunca llegó a sincronizar**: eso no está en ningún lado.
   - **Una jornada creada sin señal ya se puede reintentar con seguridad desde cualquier punto en el
     que se corte la conexión** (#29) — incluido el caso que antes quedaba trabado para siempre
     (interrupción a mitad de la subida de una foto). El chofer ve un mensaje distinto según el
     caso: que se va a enviar cuando haya señal, o que necesita avisar a la empresa si el reintento
     se agotó con señal presente.

6. **Prueba de humo end-to-end, vos solo, antes de invitar a nadie**
   - Un check-in + check-out completo con fotos, un chofer de prueba, verificando que la foto llega
     al bucket `evidencias`, la jornada aparece en `/jornadas` del Dashboard, y se puede exportar un
     reporte sin error 413/500.

7. **Resend / envío de reportes** — resuelto (2026-09-15)
   - Dominio `day2day.es` verificado en Resend y `RESEND_FROM_EMAIL=reportes@day2day.es` cargado en
     el servicio correcto (`app-transp-mock-server`, ver Hallazgo #3). La exportación de reportes ya
     entrega a cualquier destinatario, confirmado con un envío real. Detalle completo en
     `resend_dominio_day2day.md`.

8. **Fechas y horas** — resuelto (2026-09-18/21, Hallazgos #17 a #20)
   - Las tres etapas quedaron alineadas: **filtrado** (qué jornadas entran en un rango),
     **presentación** (lo que muestra la pantalla) y **reporte** (lo que sale en el Excel) usan
     siempre días y horas de calendario de España (`Europe/Madrid`), con locale `es-ES` y formato de
     24 horas declarados explícitamente. No depende de la zona del dispositivo del administrador ni
     de la del servidor.
   - Esto estaba mal hasta el 18/09: una jornada iniciada entre medianoche y las 2 de la mañana
     quedaba fuera de su propio día, y el Excel mostraba las horas en UTC. **Cualquier reporte
     exportado antes de esa fecha puede tener el rango o las horas corridos** — si se guardó alguno
     como referencia, volver a generarlo.
   - Las celdas de fecha, hora y duración del Excel son **valores numéricos reales con formato**, no
     texto: se pueden sumar, ordenar y usar en tablas dinámicas sin convertirlas antes (#19).
     ⚠️ **Una duración en Excel es una fracción de día: para pagar una tarifa por hora, la fórmula es
     `horas * 24 * tarifa`.** Es el dato que le va a hacer falta a quien arme la planilla de pagos.
   - ⚠️ **Al mirar una hora directamente en Supabase va a parecer corrida, y es correcto.** La
     columna es `timestamptz` y el editor la muestra en **UTC**; España está en `+02:00` en verano y
     `+01:00` en invierno, así que una jornada de las 19:15 de Madrid se guarda como `17:15+00`. Que
     el Dashboard y el Excel coincidan entre sí y los dos estén una o dos horas por encima de
     Supabase es la señal de que todo está bien. Para verlo en hora española:
     `select fecha_check_out at time zone 'Europe/Madrid' from jornadas ...`.

9. **El reporte contiene exactamente lo que la tabla muestra** — resuelto (2026-09-22, Hallazgo #21)
   - Lo que se exporta es **siempre** el conjunto que `/jornadas` está mostrando. El diálogo de
     exportar es de solo lectura salvo el correo de destino: muestra los filtros aplicados y
     **anuncia cuántas jornadas va a exportar** antes de exportarlas.
   - **Mirar ese número siempre.** Si alguna vez no coincide con lo que muestra la tabla, no exportar
     y avisar: es la señal de que algo se desalineó, y está puesta ahí justamente para que un
     problema se vea antes de que exista el archivo.
   - ⚠️ **Cualquier reporte exportado antes del 22/09 en el que no se hubieran puesto las fechas a
     mano cubría solo los últimos 7 días**, sin decirlo. Ninguno de esos sirve para calcular un pago
     — hay que regenerarlos.

10. **Al tocar el esquema de la base** — regla (2026-09-22, Hallazgo #23)
    - Cualquier cambio en `supabase/schema.sql` obliga a **regenerar los tipos**
      (`npm run types:supabase`) y commitear el archivo generado. Un `Database` desactualizado es
      peor que no tenerlo: el compilador aprueba con confianza una columna que ya no existe.
    - ⚠️ **Este comando no alcanza para todo.** Solo regenera tipos de columnas — no compara
      policies de Storage, triggers ni índices contra la base real. La deriva que encontró el #29
      (una policy de `UPDATE` que existía en producción y nunca se plegó de vuelta en `schema.sql`)
      es exactamente la clase de cambio que este comando no atrapa. Cualquier cambio a mano en el
      SQL Editor de Supabase (una policy, un trigger, un índice) tiene que plegarse a `schema.sql`
      **a mano**, aparte de correr este comando.

11. **Corregir una jornada desde el Dashboard, en cualquier estado** — resuelto (2026-09-26,
    Hallazgo #28)
    - **Ya no hace falta esperar a que la jornada esté cerrada.** Antes del 26/09, corregir una
      jornada abierta hacía que la corrección se perdiera en silencio al cerrarla — la regla
      operativa que estuvo vigente hasta ahora era "corregir solo jornadas cerradas". Con el #28
      resuelto y confirmado en dispositivo real (incluido el caso con el teléfono en modo avión
      entre la corrección y el cierre), **esa regla ya no aplica**: se puede corregir en cualquier
      momento y la corrección se mantiene sí o sí, la vea el teléfono antes de sincronizar o no.
    - El chofer se entera de la corrección: si la jornada sigue abierta, ve el valor nuevo y un
      aviso antes de cerrarla; si ya estaba cerrada, el historial se actualiza con el valor
      corregido.
    - ⚠️ **Y sigue valiendo lo de siempre: nunca corregir una jornada por SQL**, ni abierta ni
      cerrada. Un `UPDATE` manual no deja rastro de auditoría — la jornada queda modificada sin que
      nadie sepa quién ni por qué. Para eso está "Corregir" en el Dashboard.

12. **La incidencia del check-in ahora es estructurada** — implementado, verificación en dispositivo
    pendiente (2026-09-26, Hallazgo #31)
    - El check-in del chofer ya no pide "incidencias" como texto libre: pide lo mismo que el
      check-out (tipo de incidencia, detalle si es "Otro", fotos de respaldo). Se ve así en el
      Dashboard (secciones separadas para check-in y check-out) y en el Excel exportado (columnas
      separadas para cada etapa).
    - ⚠️ **Todavía no se generó el `.apk` con este cambio ni se probó en un teléfono real.** No usar
      esto con choferes piloto hasta confirmar la Semana 2 del checklist de verificación de este
      hallazgo (`hallazgos_piloto.md` #31): check-in con incidencia "Otro" + 2 fotos, check-out con
      otra incidencia distinta, y que las dos lleguen íntegras al Dashboard y al Excel.
    - Las jornadas viejas con el campo de texto libre `incidencias` no se pierden ni se migran: se
      siguen mostrando tal cual, tanto en la app como en el Dashboard y el Excel.

## Parte B — Piloto (1-2 choferes, 1-2 semanas)

### Objetivo

Validar el flujo completo con uso real — no simulado — antes de sumar al resto de la flota:
check-in/check-out, fotos, GPS, sincronización offline, edición y auditoría desde el Dashboard, y
exportación de reportes.

### Semana 1 — uso supervisado de cerca

- Capacitación de 15-20 minutos por chofer: instalar la app, **entrar con el usuario y la contraseña
  temporal y cambiarla en el momento** (es el primer paso y no se puede saltear), hacer un check-in
  guiado (las 3 fotos, kilometraje, combustible), mostrarle dónde ve su jornada abierta, y cómo hacer
  el check-out. Dejarle claro dos cosas: que **su contraseña nueva no la sabe nadie** y que si la
  pierde hay que pedir un reseteo, no hay recuperación; y que **puede cambiarla él mismo cuando
  quiera** desde la app si alguna vez sospecha que se filtró.
- Capacitación de 15-20 minutos al/los administrador(es): ver el mapa en vivo, abrir el detalle de
  una jornada, corregir un dato de prueba (para ver el badge "Editado" con su propia identidad, en
  una jornada abierta y en una cerrada — las dos funcionan igual ahora, #28), exportar un reporte,
  dar de alta un camión y dar de alta un chofer. Dos cosas que hay que enseñar explícitamente porque
  no se deducen:
  - **Mirar el número que anuncia el diálogo de exportar y compararlo con lo que ve la tabla** — es
    la comprobación que evita un reporte incompleto, y cuesta un segundo.
  - **Leer el usuario que muestra la pantalla antes de confirmar un alta**, por los ceros a la
    izquierda.
- Revisar **todas** las jornadas cargadas al final de cada día (comparando lo que el chofer dice que
  hizo contra lo que quedó en el Dashboard) — es la forma más rápida de detectar un problema de
  sincronización antes de que se acumule. Dos cosas para mirar de paso:
  - ⚠️ **Las matrículas.** Mientras la jornada guarde texto suelto, un mismo camión puede aparecer
    escrito de dos formas si alguien usa guiones (#24). Detectarlo temprano es barato; con meses de
    datos, no.
  - ⚠️ **Que ningún chofer tenga dos jornadas abiertas a la vez** (#27). Hoy nada lo señala, y ese
    estado produce **horas solapadas**: el mismo rato de reloj pagado o cobrado dos veces.

### Semana 2 — casos límite

Con la base ya funcionando, buscar deliberadamente los casos que sabemos que son más frágiles según
el propio historial del proyecto:

- Hacer un check-out **sin señal GPS** (dentro de un edificio, o con el GPS apagado) — confirmar que
  guarda igual y avisa con el mensaje correcto, en vez de bloquearse.
- Poner el celular en modo avión a mitad de una jornada, cargar el check-in offline, y volver a
  conectar — confirmar que sincroniza solo. **Ya probado en profundidad durante el desarrollo del
  #29** (interrupción fabricada a mitad de la subida de una foto, en varios puntos distintos), pero
  vale repetirlo con un chofer real para confirmarlo en condiciones de uso normal.
- Cargar una incidencia con 2-3 fotos de respaldo, **tanto en el check-in como en el check-out de la
  misma jornada** (Hallazgo #31) — confirmar que las dos se ven completas y por separado en el
  Dashboard y en el Excel.
- En Android, confirmar que el banner "Sincronizando…" no queda parpadeando sin motivo (el caso
  equivalente de iOS no aplica todavía: no hay build).
- Un segundo administrador corrige la misma jornada que el primero ya había corregido — confirmar
  que el tooltip muestra la corrección más reciente con la identidad correcta.
- **Una jornada que arranque de madrugada** (antes de las 2 AM hora española): confirmar que aparece
  en su propio día, tanto en la tabla como en un reporte exportado. Es el caso que estaba roto hasta
  el #17 y el que más fácil vuelve a romperse si alguien toca el filtrado de fechas.
- **Un reporte con jornadas que sumen más de 24 horas**: seleccionar la columna de duración en Excel
  y confirmar que el total no da la vuelta (#19). Es gratis de comprobar y es el error más silencioso
  que puede tener un reporte de pagos.
- **Un reseteo de contraseña real**, con el chofer piloto: confirmar que vuelve a pedirle el cambio
  al entrar y que la temporal vieja ya no sirve. Es el caso que va a pasar de verdad el día que
  alguien se olvide su clave, y conviene que la primera vez no sea con la flota entera mirando.
- ⚠️ **El mensaje de "esto no se va a resolver reintentando" del #29 no se llegó a probar fabricando
  el caso** (con la sincronización ya arreglada, es difícil forzar a propósito que un reintento con
  señal siga fallando). Si en dos semanas de piloto real nunca aparece, no hace falta perseguirlo;
  si aparece, es la primera vez que se ve en la práctica y conviene mirar bien qué mensaje mostró.
- ⚠️ **Después del 25 de octubre**, cuando España vuelva a `+01:00`: repetir una comprobación
  cualquiera de hora (una jornada en la tabla contra el mismo reporte exportado) para confirmar que
  el cambio de horario no corrió nada. Es el único momento del año en que una zona horaria mal
  declarada se manifiesta, y el proyecto tiene el mismo cálculo escrito en dos archivos (#20).

### Canal de feedback

Durante el piloto, los choferes no tienen ningún canal dentro de la app para reportar problemas —
definir ahora un canal directo (WhatsApp o llamada al administrador a cargo) y pedirles que avisen
apenas algo se vea raro, en vez de esperar a fin de semana.

### Criterios para pasar del piloto al resto de la flota

- Cero jornadas perdidas (todo lo que el chofer cargó terminó reflejado en el Dashboard).
- Sin bloqueos críticos: ningún caso donde el chofer no pudo terminar su check-in/check-out.
- Sincronización exitosa sin intervención manual en la gran mayoría de los casos (el margen exacto
  lo termina de definir la empresa según lo que vea en estas dos semanas).
- El chofer piloto puede hacer un check-in completo en menos de 2 minutos sin ayuda, para el final
  de la primera semana.

### Si algo falla gravemente

No hay una forma de "volver atrás" en el sistema en sí — si aparece un problema serio a mitad del
piloto, la salida es volver momentáneamente al método anterior (hoja de ruta en papel) solo para
ese/esos chofer(es) puntuales mientras se corrige, sin frenar al resto ni perder el resto de los
datos ya cargados.

### Después del piloto

Los hallazgos del piloto (bugs, ajustes de UX, pedidos de los choferes) se documentan como specs
puntuales siguiendo la misma metodología SDD que ya usa el proyecto (spec → aprobación → implementar
→ verificar) antes de sumar al resto de la flota — no se despliegan cambios directo a partir de lo
que se vea en estas dos semanas sin pasar por ese proceso.

## Índice de hallazgos

Detalle completo de cada uno en **`hallazgos_piloto.md`**.

| # | Qué fue | Estado |
| --- | --- | --- |
| 1 | La ruta histórica no seguía el camino real (4 causas encadenadas; migración de OSRM a Geoapify) | Cerrado |
| 2 | "Ver ruta" desde el detalle de cualquier jornada en `/jornadas` | Implementado |
| 3 | Reporte fallaba: `RESEND_FROM_EMAIL` cargada en el servicio de Render equivocado | Cerrado |
| 4 | Servicio de Render duplicado `day2day-reportes`, eliminado | Cerrado |
| 5 | Jornada abierta "desaparece" al reinstalar el `.apk` — Android borra el almacenamiento local | Cerrado; deuda cerrada por el #27 |
| 6 | El Dashboard no podía cerrar una jornada abierta | Cerrado |
| 7 | Tres ajustes al cierre manual: mapa de ubicación, foto no reemplazable, 24 horas | Cerrado |
| 8 | Pull-to-refresh en la pantalla de Check-In | Cerrado |
| 9 | Una jornada cerrada desde el Dashboard seguía "en curso" en la app | Cerrado |
| 10 | Buscador en selectores largos + encuadre con la barra de gestos de Android | Cerrado |
| 11 | El Dashboard usable desde un navegador móvil (y el mapa en blanco, en 3 intentos) | Cerrado |
| 12 | Selector "Mapa / Lista" en el teléfono | Cerrado |
| 13 | En horizontal, el mapa te dejaba atrapado: la página scrolleaba | Cerrado |
| 14 | Las tres barras superiores se comían media pantalla en horizontal | Cerrado |
| 15 | Los controles pasan a una columna a la derecha en horizontal | Cerrado |
| 16 | Reordenar la columna: las utilidades al pie | Cerrado, con nota sobre teléfonos chicos |
| 17 | Los rangos de fecha se interpretaban en UTC, no en hora de España | Cerrado |
| 18 | El Excel salía en formato 12 horas (`es-MX`) | Cerrado |
| 19 | Las celdas del Excel eran texto: ahora son valores con los que se puede calcular | Cerrado |
| 20 | La presentación heredaba la zona del entorno — y el formulario de cierre con ella | Cerrado, con deuda anotada |
| 21 | El reporte exportado traía menos jornadas de las que la tabla mostraba | Cerrado |
| 22 | Un `429` que no venía del servidor de reportes, sino de Cloudflare | Se resolvió solo |
| 23 | El `Database` de Supabase generado, y un `schema.sql` que mentía | Cerrado, con deuda confirmada real por el #29 |
| 24 | Los camiones pasan a tener entidad propia: tabla y pantalla de flota | Cerrado, con segunda etapa pendiente |
| 25 | El alta de choferes pasa al Dashboard, con contraseña temporal y cambio obligatorio | Cerrado, con deuda anotada |
| 26 | El chofer puede cambiar su contraseña por sí mismo, sin pasar por un administrador | Cerrado |
| 27 | La app recupera una jornada abierta que está en el servidor y no en el teléfono | Cerrado, con dos límites anotados |
| 28 | Una corrección sobre una jornada abierta se pierde cuando el chofer la cierra | Cerrado |
| 29 | La sincronización no era idempotente: una subida interrumpida podía quedar trabada para siempre | Cerrado |
| 30 | Bug de navegación por doble tap, encontrado como subproducto | Cerrado |
| 31 | La incidencia del check-in pasa a ser estructurada, igual que la de check-out | Implementado, verificación en dispositivo real pendiente |

⚠️ **Lo que sigue abierto** (detalle en `hallazgos_piloto.md`):

- **Nada señala que un chofer tenga dos jornadas abiertas a la vez** (#27) — el estado que produce
  horas solapadas. Mientras tanto, entra en la revisión diaria del piloto.
- **¿La app filtra las jornadas locales por el chofer logueado?** (#27). El logout no limpia la base
  local, así que un teléfono que cambie de manos puede conservar jornadas del chofer anterior. Se
  responde leyendo código.
- **La navegación se quedó sin margen** (#25). Con la cuarta entrada, la columna lateral en
  horizontal pasa el alto disponible de un teléfono de ~390px y hay que scrollear para llegar a las
  utilidades del pie. **La quinta entrada obliga a rediseñar la navegación**, no a seguir agregando
  pills.
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
  #31: el check-in ya tiene su propia incidencia estructurada, independiente de la de check-out.
  Pendiente la verificación en dispositivo real (Semana 2, más arriba, y punto 12 del checklist).
- **Rastros de `es-MX` / CDMX** en un sistema que opera en Barcelona.
- La columna lateral en teléfonos más chicos (#16).
- ⚠️ **Ningún proceso automático compara policies de Storage, triggers ni índices contra la base
  real** (#23/#29). `npm run types:supabase` solo regenera tipos de columnas.
- **El mensaje de "fallo irrecuperable" del #29** quedó verificado por código, no fabricado en el
  dispositivo — no bloqueante, anotado para la primera vez que ocurra en uso real.
- **Datos de prueba pendientes de limpiar en los dos sistemas**: el chofer `999` (fila de `choferes`
  y usuario de Supabase Auth) y la jornada sintética `2816f811-fa54-4a29-b262-f526726baf96`.
