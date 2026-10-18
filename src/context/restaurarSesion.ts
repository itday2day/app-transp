// spec_app_registro_paso5.md, paso 2b, punto 4: función PURA que decide qué hacer con el
// `app_transp_usuario` guardado en SecureStore al arrancar la app, según lo que devuelve
// `supabase.auth.getSession()` -- separada de AuthContext.tsx (que sí importa expo-secure-store)
// por el mismo motivo que authCore.ts: para poder compilarla con `tsc` puro y probarla con `node`,
// sin React Native, sin SecureStore de verdad y sin un cliente de Supabase de verdad.
//
// Diseñada según lo MEDIDO, no lo supuesto -- antes de escribir esto se leyó
// node_modules/@supabase/auth-js/dist/main/GoTrueClient.js (getSession/__loadSession/
// _callRefreshToken, versión 2.112.4 instalada) y se corrieron dos experimentos en Node sin red
// real: un `fetch` que RECHAZA (simula sin conexión) y un `fetch` que responde 400
// `{"error":"invalid_grant", "error_description":"Invalid Refresh Token: Refresh Token Not
// Found"}` (simula un refresh token revocado/rotado), los dos contra una sesión con el
// access_token vencido DE VERDAD (no solo dentro del margen proactivo de ~90s) para forzar la
// única rama donde red vs. rechazo genuino se distinguen de verdad. Resultado real (pegado en el
// resumen de este paso, sección B):
//   - fetch que rechaza -> `data.session: null`, `error.name: "AuthRetryableFetchError"`,
//     `error.status: 0`, storage de supabase-js SIN tocar.
//   - fetch 400 invalid_grant -> `data.session: null`, `error.name: "AuthApiError"`,
//     `error.status: 400`, storage de supabase-js YA LIMPIADO por auth-js mismo (removeSession()
//     interno).
// Esa es la única señal real y estable para distinguir las dos: `error.status === 0` (MISMO
// criterio que esSinConexion() en mapearError.ts -- no es casualidad, es la misma firma real de
// un fallo de red en supabase-js).
//
// IMPORTANTE (leído en GoTrueClient.js:2561-2583 y :4277-4316): si el access_token todavía no
// venció DE VERDAD (solo entró en el margen proactivo de refresco), tanto un fallo de red como un
// rechazo genuino del refresh token hacen que auth-js devuelva la sesión VIEJA con `error: null`
// -- en ese caso getSession() ya se ve exactamente como "valida" sin que este archivo tenga que
// hacer nada especial; los tres resultados de abajo solo importan cuando el access_token expiró
// de verdad y auth-js no pudo (o no quiso) renovarlo.

import type { Usuario } from "../types";

/** Shape mínimo y estructural de lo que devuelve `supabase.auth.getSession()` -- no se importa el
 * tipo `Session`/`AuthError` completo de @supabase/supabase-js porque esta función solo necesita
 * saber si HAY sesión y, si no, si el error es de red (`status === 0`) o no. */
export interface ResultadoGetSession {
  data: { session: unknown | null };
  error: { status?: number } | null;
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
 * Los TRES resultados posibles, medidos (ver el comentario de arriba del archivo):
 *   - "valida": hay Usuario guardado y getSession() devuelve una sesión (sea una sesión fresca,
 *     sea la "preservada" que auth-js ya entrega sola cuando el access_token todavía no venció de
 *     verdad) -> se entra con ese Usuario.
 *   - "caducada": no hay Usuario guardado, o el guardado no es válido, o getSession() devuelve
 *     `session: null` con un error que NO es de red (`status !== 0`: rechazo genuino del refresh
 *     token, o ningún error -- nunca hubo sesión) -> se trata como sesión caducada (Decisión 2,
 *     Fase 1c): el llamador borra `app_transp_usuario` y vuelve al login, sin error visible.
 *   - "indeterminada": hay Usuario guardado pero getSession() devuelve `session: null` con
 *     `error.status === 0` (fallo de RED, no un rechazo real) -> se CONSERVA el Usuario guardado
 *     -- el chofer debe poder seguir trabajando offline con el token vencido; cuando vuelva la
 *     red, un getSession()/refresh posterior decide de verdad.
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
  if (data.session) return { resultado: "valida", usuario };
  if (error && error.status === 0) return { resultado: "indeterminada", usuario };
  return { resultado: "caducada" };
}
