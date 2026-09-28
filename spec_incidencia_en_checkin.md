# Spec: incidencia estructurada en el Check-In

_app-transp · borrador 2026-09-26. Fase 1 (SDD) — pendiente de aprobación explícita antes de tocar
código. Reemplaza la nota abierta "`spec_incidencia_en_checkin.md` (aprobada en principio, no
implementada)" de `hallazgos_piloto.md`/`plan_despliegue_piloto.md`._

## 1. Contexto

Hoy la app móvil tiene dos mecanismos completamente distintos para lo mismo, según el momento de la
jornada:

- **Check-out** (`IncidenciasForm.tsx`, dentro de `CheckOutForm.tsx`): incidencia **estructurada** —
  Sí/No, `tipo` (uno de 4 valores fijos), `detalle` (obligatorio solo si `tipo === "Otro"`), y 0+
  fotos de respaldo (`GaleriaFotosIncidencia.tsx`).
- **Check-in** (`CheckInForm.tsx`): un campo de **texto libre**, `incidencias: string`, sin tipo y
  sin fotos — el chofer escribe lo que quiera o lo deja vacío.

Confirmado leyendo el código (no asumido): el modelo de datos garantiza, en las tres capas, que hoy
una jornada tiene **como máximo una** incidencia estructurada — la del check-out:

- `Jornada` (`src/types/index.ts`): `tipoIncidencia?: TipoIncidencia` y `detalleIncidencia?: string`
  son escalares, no arreglos. Solo `fotosIncidenciaUris`/`fotosIncidencia` son arreglos (fotos de
  _esa misma_ incidencia).
- `supabase/schema.sql`: `tipo_incidencia text check (... in (4 valores))`, `detalle_incidencia
text` — ambas columnas escalares.
- `server/mock/reportes.js`, función `obtenerIncidencias(jornada)`: devuelve un arreglo de 0 o 1
  elemento **a propósito**, con un comentario explícito dejando documentado que si algún día una
  jornada admite más de una incidencia, las columnas de tipo/descripción del Excel ya están armadas
  para concatenarse por salto de línea — **pero la columna `horaIncidencia` (fracción de día,
  numérica) no puede extenderse así, y queda anotado que necesita su propio rediseño**.

Ese "día" es este spec: agregar al check-in la misma incidencia estructurada que ya tiene el
check-out. Con esto, una jornada pasa a poder tener **0, 1 o 2** incidencias estructuradas (una de
check-in, otra de check-out, independientes entre sí).

## 2. Objetivo

Que el chofer registre en el check-in el mismo tipo de incidencia estructurada que ya registra en el
check-out (tipo + detalle + fotos), reemplazando el campo de texto libre actual. Mantener legible en
Dashboard y Excel cuál incidencia vino de cuál etapa, sin perder ningún dato de las jornadas ya
cargadas con el campo de texto libre.

## 3. Diseño propuesto

### 3.1 Nomenclatura — nuevas columnas, no renombrar las existentes

Se agregan columnas/campos nuevos con sufijo `Checkin` (camelCase) / `_checkin` (Supabase), y **no se
toca** ninguno de los campos de check-out ya desplegados (`tuvoIncidencia`, `tipoIncidencia`,
`detalleIncidencia`, `fotosIncidenciaUris`/`fotosIncidencia`). Mismo criterio que ya usa el proyecto
para todo lo que existe en dos momentos de la jornada (`kmInicial`/`kmFinal`,
`combustibleInicial`/`combustibleFinal`, `fotoTacometroInicialUri`/`fotoTacometroFinalUri`) — evita
una migración de renombrado sobre datos ya reales, y sobre todo el código (reportes, Dashboard,
sync) que ya lee los nombres actuales asumiendo que son "la incidencia del check-out".

### 3.2 Tipos (`src/types/index.ts`)

```ts
export interface Jornada {
  // ...existente sin cambios...

  // Check-in — nuevo, reemplaza el campo `incidencias` (texto libre) para jornadas nuevas.
  tuvoIncidenciaCheckin?: boolean;
  tipoIncidenciaCheckin?: TipoIncidencia;
  detalleIncidenciaCheckin?: string;
  fotosIncidenciaCheckinUris?: string[]; // local
  fotosIncidenciaCheckin?: string[]; // URLs públicas tras sincronizar

  // `incidencias?: string` se mantiene en el tipo — histórico, solo lectura para jornadas viejas.
}
```

`IncidenciaData` (el estado del formulario, hoy solo usado por `CheckOutForm`) se reutiliza sin
cambios — ya tiene la forma exacta que necesita el check-in (`tuvoIncidencia`, `tipo`, `detalle`,
`fotos`).

`NuevoCheckIn` (el `Pick<Jornada, ...>` que usa `CheckInForm`) cambia: se quita `incidencias` de la
lista y se agregan los 4 campos nuevos de arriba (`fotosIncidenciaCheckinUris`, no la variante de
URLs remotas — mismo patrón que `fotoTacometroInicialUri` vs. `fotoCheckInUrl`).

### 3.3 Esquema Supabase — `schema_v12_incidencia_checkin.sql`

```sql
alter table jornadas
  add column tuvo_incidencia_checkin boolean,
  add column tipo_incidencia_checkin text
    check (tipo_incidencia_checkin in ('Avería vehículo', 'Tráfico/Retraso', 'Cliente ausente', 'Otro')),
  add column detalle_incidencia_checkin text,
  add column fotos_incidencia_checkin text[];
```

La columna `incidencias text` **no se borra ni se deja de leer** — jornadas viejas la conservan (ver
§4). Solo deja de escribirse desde el check-in nuevo.

⚠️ **Regenerar tipos** (`npm run types:supabase`) y **replegar a mano** en `schema.sql` — mismo
recordatorio que ya deja anotado el propio `plan_despliegue_piloto.md` (regla del Hallazgo #23):
este `ALTER TABLE` sí lo captura `types:supabase`, pero conviene revisar en el mismo cambio si hace
falta tocar el trigger de `schema_v10_correccion_admin_gana.sql` (lista de columnas protegidas tras
una corrección de admin) — hoy esa lista incluye `tuvo_incidencia`/`tipo_incidencia`/
`detalle_incidencia` (del check-out, porque el Dashboard puede _cerrar_ una jornada abierta con
incidencia incluida, Hallazgo #6). El Dashboard no toca la incidencia de check-in en este spec (ver
§6, fuera de alcance), así que las columnas `_checkin` **no** entran en esa lista por ahora.

### 3.4 SQLite local (`src/db/database.ts`, `src/db/jornadasRepo.ts`)

Mismas 4 columnas nuevas en la tabla local (booleano como `0`/`1`, fotos como JSON stringificado —
mismo patrón exacto que ya usan las columnas de check-out). `filaAJornada()`/el mapeo inverso y
`registrarCheckIn()` se actualizan para incluirlas. El switch de `aplicarCambiosRemotos` (columnas
protegidas por admin) no necesita casos nuevos por lo dicho en §3.3.

### 3.5 UI móvil — `CheckInForm.tsx`

Se quita el `CampoTexto` de "Incidencias" (líneas 232-243 hoy) y se reemplaza por
`<IncidenciasForm valor={incidencia} onCambiar={setIncidencia} scrollViewRef={scrollViewRef} />` —
el **mismo componente** que usa `CheckOutForm`, sin duplicar lógica. `ValoresCheckInForm` cambia
`incidencias: string` por los 4 campos de incidencia estructurada, igual que `ValoresCheckOutForm`.

`CheckInScreen`/`NuevoCheckInScreen` no necesitan cambios propios — ya delegan la validación y el
armado del payload a `CheckInForm`.

### 3.6 `DetalleJornadaScreen.tsx`

La sección de check-in (líneas 172-196) reemplaza el bloque condicional de `jornada.incidencias`
(línea 180-182) por el mismo patrón que ya usa la sección de check-out para su incidencia (línea
218-232): `FilaTexto` con tipo + detalle, y la grilla de fotos si hay. Jornadas viejas sin datos
`_checkin` pero con `incidencias` (texto libre) siguen mostrando ese texto tal cual — no se pierde
nada visible del histórico (ver §4).

### 3.7 Dashboard (`dashboard/lib/types.ts`, `jornada-detalle-dialog.tsx`)

El tipo `Jornada` del Dashboard agrega los mismos 4 campos `_checkin`. El modal de detalle de
jornada muestra la incidencia de check-in en su propia sección (igual que ya distingue check-in de
check-out para el resto de los datos), con su propia galería de fotos sin límite — mismo criterio
que ya usa para las fotos de la incidencia de check-out.

### 3.8 Reporte Excel (`server/mock/reportes.js`)

Este es el cambio más grande del spec, porque es exactamente el caso que el propio código dejó
anotado como pendiente. Se reemplaza la única sección de incidencia por dos, una por etapa —no se
reutiliza el join por salto de línea que ya estaba escrito, porque unir tipo/detalle de dos
incidencias distintas en una sola celda sin poder alinear tampoco su hora es más confuso que dos
columnas paralelas, y el propio comentario del código ya advertía que la celda de hora no admite esa
solución:

| Columna actual            | Columnas nuevas                                                           |
| ------------------------- | ------------------------------------------------------------------------- |
| ¿Tiene Incidencias?       | ¿Incidencia Check-In? / ¿Incidencia Check-Out?                            |
| Tipo de Incidencia        | Tipo Incidencia Check-In / Tipo Incidencia Check-Out                      |
| Descripción de Incidencia | Descripción Incidencia Check-In / Descripción Incidencia Check-Out        |
| Hora Incidencia           | Hora Incidencia Check-In (= hora de check-in) / Hora Incidencia Check-Out |
| Foto Incidencia 1/2/3     | Foto Incidencia Check-In 1/2/3 / Foto Incidencia Check-Out 1/2/3          |

`obtenerIncidencias(jornada)` se reemplaza por dos llamadas a una función más simple (una por etapa,
ya no un arreglo — vuelve a ser el caso "0 o 1" real de cada una por separado), y el comentario que
anticipaba este día se actualiza para reflejar que ya se implementó, con el diseño elegido. La hora
de la incidencia de check-in es simplemente `jornada.fechaCheckIn` (no hay una hora propia distinta
a la del check-in en sí, igual que la de check-out usa `fechaCheckOut`).

⚠️ Esto duplica las columnas relacionadas a incidencia (de 5+3 a 8+6) — el reporte ya es ancho (ver
`contexto_proyecto.md` §4, exportación). Si en la práctica del piloto resulta demasiado, la
alternativa es una sola sección con una columna extra "Etapa" (Check-In/Check-Out) y una fila por
incidencia en vez de por jornada — pero eso rompe la relación 1 fila = 1 jornada que el resto del
reporte mantiene, así que no se propone como default.

## 4. Migración de datos existentes

Las jornadas ya cargadas con `incidencias` (texto libre) **no se migran automáticamente** a los
campos estructurados nuevos — no hay forma de partir un texto libre en tipo/detalle sin inventar
datos. `incidencias` se mantiene en el esquema y en el tipo, de solo lectura para el histórico:
`DetalleJornadaScreen` y el Dashboard siguen mostrando ese texto para jornadas viejas (§3.6); el
Excel, para no dejar dos criterios sueltos, muestra `incidencias` (si existe y no hay
`tuvo_incidencia_checkin`) en la columna "Descripción Incidencia Check-In" con "Tipo Incidencia
Check-In" en blanco/`N/A` — mismo criterio de no perder dato visible sin inventar uno.

## 5. Decisiones a confirmar antes de implementar

1. **Reemplazo, no convivencia**: el campo de texto libre desaparece de la pantalla de check-in para
   jornadas nuevas (confirmado por el pedido "crear igual que check-out"). Si en la práctica hiciera
   falta un texto libre _además_ de la incidencia estructurada (una observación que no es una
   incidencia), sería un pedido distinto, no cubierto acá.
2. **Diseño del Excel** (§3.8): dos secciones paralelas de columnas, no una unificada con join. Es
   más ancho pero sin ambigüedad; alternativa anotada arriba si el ancho molesta en el piloto.
3. **Fuera de alcance** (§6): el Dashboard no gana forma de editar/completar la incidencia de
   check-in de forma remota (no hay hoy un flujo equivalente al de "cerrar jornada" del Hallazgo #6
   para el check-in — el check-in siempre lo hace el chofer en el momento, nunca queda "a medias"
   esperando datos del administrador).

## 6. Fuera de alcance

- Cualquier cambio al flujo de "Corregir jornada" o "cerrar jornada" del Dashboard.
- Traducciones (`es.json`/`en.json`): se agregan las claves que falten siguiendo la paridad exacta
  que ya exige el proyecto, pero no es parte del diseño en sí.
- Cambiar el límite de 4 tipos fijos de incidencia (`TipoIncidencia`) — se reutiliza tal cual.

## 7. Plan de verificación

- `npx tsc --noEmit` (raíz) + `dashboard/` con `npx tsc --noEmit` desde ahí, `npm run lint`, `npm run
format:check` en los tres sub-proyectos tocados (raíz, `dashboard/`, `server/mock/`).
- Migración `schema_v12` corrida contra el Supabase real del proyecto, y `schema.sql` replegado a
  mano (§3.3).
- Prueba end-to-end en dispositivo real: un check-in con incidencia estructurada (tipo "Otro" con
  detalle obligatorio, 2 fotos), un check-out con su propia incidencia distinta — confirmar que
  ambas llegan íntegras al Dashboard y que el Excel exportado muestra las 8 columnas nuevas
  correctas para esa jornada (y "N/A"/vacío correcto para una jornada vieja con solo `incidencias`
  texto libre, y para una jornada sin ninguna incidencia).
- Confirmar que una jornada vieja (con `incidencias` texto libre, sin los campos `_checkin`) sigue
  mostrando ese texto sin cambios en `DetalleJornadaScreen` y el Dashboard.
