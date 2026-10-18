// spec_app_registro_paso5.md, paso 2b (hueco de onAuthStateChange, decidido tras el 4.3): lógica
// PURA de qué hacer con un evento de `supabase.auth.onAuthStateChange()` -- separada de
// AuthContext.tsx (que sí importa expo-secure-store/React) por el mismo motivo que
// restaurarSesion.ts: para poder probarla con `node`, sin React y sin un cliente de Supabase real.
//
// Investigado antes de escribir esto (ver el resumen de este paso, sección I1-I2):
//   - `_removeSession()` (GoTrueClient.js:4403-4421) es la ÚNICA función que emite "SIGNED_OUT"
//     (línea 4420, `_notifyAllSubscribers('SIGNED_OUT', null)`).
//   - `_callRefreshToken()` solo llama a `_removeSession()` (GoTrueClient.js:4277-4300) cuando el
//     error NO es `AuthRetryableFetchError` (rechazo genuino, no red/infraestructura) Y el
//     access_token ya venció de verdad -- confirmado con un experimento real (fetch 400
//     invalid_grant -> SIGNED_OUT; fetch 503 y fetch que rechaza -> SOLO "INITIAL_SESSION", nunca
//     SIGNED_OUT, y el storage queda intacto en los dos).
//   - Cualquier `signOut()` propio (botón de salir, el `signOut({scope:"local"})` de "caducada" en
//     AuthContext.tsx, o `cancelarRecuperacionPendiente()` en authCore.ts) TAMBIÉN emite
//     SIGNED_OUT -- este manejador tiene que ser idempotente frente a eso, no asumir que
//     SIGNED_OUT significa siempre "se venció el refresh token".
//
// Esta función NO toca React ni SecureStore -- solo decide. AuthContext.tsx ejecuta la acción
// ("cerrar" -> borrar app_transp_usuario + setUsuario(null)) DIFERIDA con setTimeout(…, 0), nunca
// directo dentro del callback de onAuthStateChange (riesgo de bloqueo documentado: el callback
// corre dentro de la propia notificación interna de auth-js).

import type { Usuario } from "../types";

export type AccionEventoAuth = { accion: "cerrar" } | { accion: "ignorar" };

/**
 * Reacciona SOLO a `"SIGNED_OUT"` -- TOKEN_REFRESHED, INITIAL_SESSION, SIGNED_IN, USER_UPDATED y
 * PASSWORD_RECOVERY se ignoran siempre, sea cual sea el `usuarioActual`.
 *
 * Con `"SIGNED_OUT"`: si `usuarioActual` ya es `null` (el chofer está en pleno registro/
 * recuperación, sin Usuario establecido todavía, o un `signOut()` propio ya lo había limpiado un
 * instante antes), es un NO-OP -- nunca un doble borrado ni un bucle. Solo si HABÍA un Usuario
 * establecido, la acción es "cerrar" (AuthContext.tsx borra `app_transp_usuario` y vuelve al
 * login).
 */
export function manejarEventoAuth(event: string, usuarioActual: Usuario | null): AccionEventoAuth {
  if (event !== "SIGNED_OUT") return { accion: "ignorar" };
  if (usuarioActual === null) return { accion: "ignorar" };
  return { accion: "cerrar" };
}
