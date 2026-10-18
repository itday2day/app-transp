// spec_app_registro_paso5.md, paso 2b, punto 4: función PURA que decide qué hacer con el
// `app_transp_usuario` guardado en SecureStore al arrancar la app, según lo que devuelve
// `supabase.auth.getSession()` -- separada de AuthContext.tsx (que sí importa expo-secure-store)
// por el mismo motivo que authCore.ts: para poder compilarla con `tsc` puro y probarla con `node`,
// sin React Native, sin SecureStore de verdad y sin un cliente de Supabase de verdad.
//
// TABLA MEDIDA (node_modules/@supabase/auth-js, versión 2.112.4 instalada -- al actualizar
// @supabase/supabase-js, REPETIR estos experimentos; auth-js puede cambiar esta clasificación
// entre versiones) -- seis corridas de getSession() en Node, sin red real, con un `fetch` falso
// y una sesión cuyo access_token venció DE VERDAD (no solo dentro del margen proactivo de ~90s):
//
//   entrada del fetch falso         | data.session | error.name              | error.status | storage tras la llamada
//   ---------------------------------+--------------+-------------------------+--------------+--------------------------
//   rechaza (sin red real)          | null         | AuthRetryableFetchError | 0            | intacto
//   responde 502 (vacío)            | null         | AuthRetryableFetchError | 502          | intacto
//   responde 503 (vacío)            | null         | AuthRetryableFetchError | 503          | intacto
//   responde 500 con cuerpo JSON    | null         | AuthRetryableFetchError | 500          | intacto
//   responde 500 con cuerpo HTML    | null         | AuthRetryableFetchError | 500          | intacto
//   responde 400 {"error":          | null         | AuthApiError            | 400          | BORRADO (auth-js llamó
//     "invalid_grant", ...}         |              |                         |              | _removeSession() solo)
//
// 504 y el rango 520-530 NO se corrieron por separado -- no medidos con un experimento propio,
// pero por lectura de fetch.js:32-34 están en la MISMA lista NETWORK_ERROR_CODES que 500/501/502/
// 503, así que siguen el mismo camino de código que los sí medidos arriba (fetch.js:45 o :51,
// según el cuerpo sea o no JSON parseable) -- se asume el mismo resultado por eso, no por fe.
//
// Lectura del código (GoTrueClient.js:4277-4316, fetch.js:29-89, ambos leídos antes de escribir
// esto): auth-js clasifica TODO el rango 500-504 y 520-530 (su propia lista NETWORK_ERROR_CODES,
// fetch.js:32-34, comentario propio: "These are infrastructure errors and should not cause
// session invalidation") como `AuthRetryableFetchError`, CON el status HTTP real preservado (no
// 0 -- el 0 es solo para un fetch que lanza de verdad, fetch.js:130, o una "respuesta" que ni
// parece un Response, fetch.js:38). El único bloque que borra la sesión
// (`_callRefreshToken`, GoTrueClient.js:4281-4299) corre SOLO `if (!isAuthRetryableFetchError(error))`
// -- nunca para un error retryable, sea el status que sea.
//
// DECISIÓN (medida, no supuesta): "indeterminada" se decide por `error.name ===
// "AuthRetryableFetchError"`, CUALQUIER status -- no por `status === 0` a solas (eso dejaría
// afuera 500/501/502/503/504/520-530, que también son infraestructura, no un rechazo real). Se
// compara por NOMBRE, no con `instanceof AuthRetryableFetchError`: `instanceof` falla si llegan a
// convivir dos copias del paquete (hoisting de npm, etc.), el nombre de la clase no.
// `esSinConexion()` de mapearError.ts NO usa este mismo criterio -- ahí "sin conexión" sigue
// siendo literalmente `status === 0` (ver ese archivo); un 502/503/504 en login/registro/código
// cae en "generico", nunca en "sinConexion" -- es una decisión de UX distinta (qué mensaje mostrar
// durante un intento activo) de esta (si conservar una sesión ya guardada al arrancar).
//
// IMPORTANTE (ya leído en GoTrueClient.js:2561-2583 y :4277-4316): si el access_token todavía no
// venció DE VERDAD (solo entró en el margen proactivo de refresco), tanto un fallo de red/
// infraestructura como un rechazo genuino del refresh token hacen que auth-js devuelva la sesión
// VIEJA con `error: null` -- en ese caso getSession() ya se ve exactamente como "valida" sin que
// este archivo tenga que hacer nada especial; los tres resultados de abajo solo importan cuando
// el access_token expiró de verdad y auth-js no pudo (o no quiso) renovarlo.

import type { Usuario } from "../types";

/** Shape mínimo y estructural de la sesión real de supabase-js -- solo el campo que necesita la
 * comprobación de coherencia usuario/sesión (punto 2.3): el `id` del usuario de la sesión tiene
 * que ser el MISMO que el `id` del Usuario guardado en SecureStore. Si no lo es (sesión de OTRA
 * cuenta -- ej. alguien cerró sesión y entró con otra, o un bug dejó cruzados los dos storages),
 * no se puede confiar en el Usuario guardado aunque haya una sesión "válida": es válida para OTRO
 * id. */
export interface SesionGetSession {
  user?: { id?: string };
}

/** Shape mínimo y estructural de lo que devuelve `supabase.auth.getSession()` -- no se importa el
 * tipo `Session`/`AuthError` completo de @supabase/supabase-js. `error.name` es la señal real
 * (ver la tabla medida arriba); `error.status` queda solo para los tests/diagnóstico, esta
 * función ya no decide por él. */
export interface ResultadoGetSession {
  data: { session: SesionGetSession | null };
  error: { name?: string; status?: number } | null;
}

export type ResultadoRestaurarSesion =
  | { resultado: "valida"; usuario: Usuario }
  | { resultado: "caducada" }
  | { resultado: "indeterminada"; usuario: Usuario };

/** Lee el JSON guardado bajo `app_transp_usuario` sin asumir que tiene la forma actual de
 * `Usuario` -- un guardado VIEJO (de antes del paso 2b punto 1) tenía `numeroEmpleado` y no tenía
 * `empresaDefecto`/`rutaDefecto`. Lo que falte queda en `null`; `numeroEmpleado`, si estaba, se
 * descarta (el objeto se reconstruye campo por campo, nunca con un spread del original) -- así el
 * llamador puede re-persistir el resultado y dejar SecureStore con la forma nueva (punto 4c).
 * Devuelve `null` si el JSON es inválido o le faltan los campos mínimos (`id`, `nombre`) para ser
 * un Usuario de verdad. */
function normalizarUsuarioGuardado(valor: unknown): Usuario | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.nombre !== "string") return null;
  return {
    id: v.id,
    nombre: v.nombre,
    empresaDefecto: typeof v.empresaDefecto === "string" ? v.empresaDefecto : null,
    rutaDefecto: typeof v.rutaDefecto === "string" ? v.rutaDefecto : null,
    debeCambiarContrasena: v.debeCambiarContrasena === true,
  };
}

/**
 * Los TRES resultados posibles, medidos (ver la tabla de arriba):
 *   - "valida": hay Usuario guardado, getSession() devuelve una sesión (fresca o "preservada" por
 *     auth-js), Y el `id` de esa sesión coincide con el `id` del Usuario guardado (punto 2.3) ->
 *     se entra con ese Usuario.
 *   - "caducada": no hay Usuario guardado, el guardado no es válido, hay sesión pero de OTRO id,
 *     o getSession() devuelve `session: null` con un error QUE NO ES `AuthRetryableFetchError`
 *     (rechazo genuino -- `AuthApiError` 400 invalid_grant, `AuthUnknownError`, o directamente sin
 *     error -- nunca hubo sesión real) -> sesión caducada (Decisión 2, Fase 1c): el llamador
 *     borra `app_transp_usuario` y vuelve al login, sin error visible.
 *   - "indeterminada": hay Usuario guardado pero getSession() devuelve `session: null` con
 *     `error.name === "AuthRetryableFetchError"` (red O infraestructura: status 0, o
 *     500/501/502/503/504/520-530 -- CUALQUIER status, ver la tabla) -> se CONSERVA el Usuario
 *     guardado -- el chofer debe poder seguir trabajando offline/durante una caída del servidor
 *     con el token vencido; cuando vuelva a responder, un getSession()/refresh posterior decide
 *     de verdad. Con `session: null` no hay cómo comparar el id (punto 2.3) -- se acepta el
 *     guardado tal cual, no hay otra fuente para contrastarlo.
 */
export function restaurarSesion(
  guardadoJson: string | null,
  resultadoGetSession: ResultadoGetSession
): ResultadoRestaurarSesion {
  if (!guardadoJson) return { resultado: "caducada" };

  let usuario: Usuario | null;
  try {
    usuario = normalizarUsuarioGuardado(JSON.parse(guardadoJson));
  } catch {
    usuario = null;
  }
  if (!usuario) return { resultado: "caducada" };

  const { data, error } = resultadoGetSession;

  if (data.session) {
    // Punto 2.3: coincidencia de id, no solo "hay sesión". `session.user?.id` en una sesión real
    // de supabase-js SIEMPRE es un string -- el `?` es solo defensivo por el tipo estructural de
    // arriba; si llegara undefined (shape inesperado), también cuenta como "no coincide" ->
    // caducada, nunca se asume una coincidencia que no se pudo confirmar.
    if (data.session.user?.id !== usuario.id) return { resultado: "caducada" };
    return { resultado: "valida", usuario };
  }

  if (error && error.name === "AuthRetryableFetchError") {
    return { resultado: "indeterminada", usuario };
  }

  return { resultado: "caducada" };
}
