// spec_app_registro_paso5.md, "Resultados de la Fase 1b", secciones 3 y 4 (tabla de errores,
// sustituye al criterio 9 del Bloque B): tres funciones puras que deciden SOLO por `status` y
// `code` -- NUNCA por el texto de `message` (la única excepción es extraer los segundos de un
// 429, que sí vienen en el texto). Ninguna hace red ni efectos: reciben lo que ya devolvió
// supabase-js y devuelven una clave de texto (las traducciones viven en es.json/en.json, nunca
// acá) y, si aplica, los segundos de espera.
//
// Cada clave corresponde a UN renglón literal de la tabla 4 de la spec:
//   - "sinConexion": `status` 0 -- y nada más. supabase-js entrega los fallos de red reales
//     como `AuthRetryableFetchError` con `status` 0; un error SIN `status` (ej. una excepción
//     cruda que no pasó por supabase-js) no es necesariamente de red, y cae en "generico" por la
//     regla normal en vez de asumirse como "sin conexión" a ciegas.
//   - "esperar" (+ segundos): `status` 429, en `signUp`, `resend` o `resetPasswordForEmail`
//     (`over_email_send_rate_limit`) -- los segundos del `message` si vienen, 60 si no.
//   - "generico": cualquier otro error no reconocido por ninguna regla de abajo.
//   - "correoYaRegistrado": `signUp` con éxito (sin error) e `identities` vacío.
//   - "pantallaCodigo": `signUp` con éxito e `identities` con al menos 1 elemento.
//   - "revisarInvitacion": `signUp`, `status` 500 -- supabase-js no entrega el motivo (medido en
//     la Fase 1b); el LLAMADOR tiene que volver a pedir `validar_invitacion` y, si el estado ya
//     no es "valida", usar el mensaje de ese estado; si sigue "valida", usar "generico" (la
//     "pista" de la capa 2) -- esta función no hace esa llamada, solo avisa que hace falta.
//   - "credencialesIncorrectas": `signInWithPassword`, `code` `invalid_credentials`.
//   - "correoSinConfirmar": `signInWithPassword`, `code` `email_not_confirmed`.
//   - "cuentaDadaDeBaja": `signInWithPassword`, `code` `user_banned`.
//   - "codigoIncorrectoOVencido": `verifyOtp`, `status` 403 y `code` `otp_expired` -- el mismo
//     error para código incorrecto, vencido o ya sustituido por un reenvío (medido en la Fase
//     1b: supabase-js no los distingue).
//   - "contrasenaDebil": `signUp`, `status` 422 y `code` `weak_password` -- agregada en el paso
//     2b (authCore.ts). ⚠️ No medido contra producción todavía (el registro real siempre usó
//     contraseñas que ya cumplían el mínimo del panel): código real de GoTrue, a confirmar en el
//     iPhone cuando haya una pantalla que pueda disparar este caso de verdad.
//
// Las claves de `validar_invitacion` (`no_existe`, `revocada`, `vencida`, `usada`) no están acá:
// esa función no devuelve un error de supabase-js con status/code, devuelve directo el `estado`
// de la fila -- el llamador usa ese valor como clave.
//
// `mapearErrorCambiarContrasena` (agregada en el paso 2b, para `updateUser()` en el flujo de
// recuperación de authCore.ts) es una CUARTA función, separada de las tres de arriba porque
// decide sobre un error de `updateUser()`, no de `signUp`/`signInWithPassword`/`verifyOtp`:
//   - "contrasenaDebil": `code` `weak_password`.
//   - "contrasenaIgual": `code` `same_password` (la contraseña nueva es igual a la actual).
//   ⚠️ Ninguna de las dos medida contra producción todavía -- mismo motivo que "contrasenaDebil"
//   arriba, códigos reales de GoTrue, a confirmar en el iPhone cuando haya pantalla (paso 2c).

export interface ErrorSupabase {
  status?: number;
  code?: string;
  message?: string;
}

export type ClaveMapaRegistro =
  | "sinConexion"
  | "esperar"
  | "generico"
  | "correoYaRegistrado"
  | "pantallaCodigo"
  | "revisarInvitacion"
  | "contrasenaDebil";

export type ClaveMapaLogin =
  "sinConexion" | "generico" | "credencialesIncorrectas" | "correoSinConfirmar" | "cuentaDadaDeBaja";

export type ClaveMapaCodigo = "sinConexion" | "esperar" | "generico" | "codigoIncorrectoOVencido";

export type ClaveMapaCambiarContrasena = "sinConexion" | "generico" | "contrasenaDebil" | "contrasenaIgual";

// Unión discriminada por la propia clave: "esperar" es la única que trae segundos. TypeScript
// angosta el tipo solo comprobando `resultado.clave === "esperar"`, sin necesitar un campo
// aparte de discriminación.
export type ResultadoMapeo<Clave extends string> =
  { clave: Exclude<Clave, "esperar"> } | { clave: "esperar" & Clave; segundos: number };

const SEGUNDOS_ESPERA_POR_DEFECTO = 60;

// El único punto de esta spec donde se lee el TEXTO de un error -- solo para extraer un número,
// nunca para decidir una clave a partir de ese texto. Si el formato del mensaje de Supabase
// cambiara y dejara de traer los segundos, se usa el valor por defecto en vez de romper.
function extraerSegundosDeEspera(message: string | undefined): number {
  const coincidencia = /(\d+)\s*seconds?/.exec(message ?? "");
  return coincidencia ? Number(coincidencia[1]) : SEGUNDOS_ESPERA_POR_DEFECTO;
}

function esSinConexion(error: ErrorSupabase): boolean {
  return error.status === 0;
}

/** `signUp`. `resultado.error` ausente/null = éxito; en ese caso `identities` decide (array
 * vacío = ya hay una cuenta confirmada con ese correo, sin enviar nada; con elementos = pantalla
 * de código). Con error, decide por `status` nada más -- supabase-js nunca entrega el motivo
 * real de un 500 (medido en la Fase 1b). */
export function mapearErrorRegistro(resultado: {
  error?: ErrorSupabase | null;
  identities?: unknown[];
}): ResultadoMapeo<ClaveMapaRegistro> {
  const { error, identities } = resultado;

  if (!error) {
    if (Array.isArray(identities) && identities.length === 0) {
      return { clave: "correoYaRegistrado" };
    }
    return { clave: "pantallaCodigo" };
  }

  if (esSinConexion(error)) return { clave: "sinConexion" };
  if (error.status === 429) return { clave: "esperar", segundos: extraerSegundosDeEspera(error.message) };
  if (error.status === 422 && error.code === "weak_password") return { clave: "contrasenaDebil" };
  if (error.status === 500) return { clave: "revisarInvitacion" };
  return { clave: "generico" };
}

/** `signInWithPassword`. Solo se llama cuando hubo error (un login exitoso no necesita mapeo). */
export function mapearErrorLogin(error: ErrorSupabase): ResultadoMapeo<ClaveMapaLogin> {
  if (esSinConexion(error)) return { clave: "sinConexion" };
  if (error.code === "invalid_credentials") return { clave: "credencialesIncorrectas" };
  if (error.code === "email_not_confirmed") return { clave: "correoSinConfirmar" };
  if (error.code === "user_banned") return { clave: "cuentaDadaDeBaja" };
  return { clave: "generico" };
}

/** `verifyOtp({type:'signup'|'recovery'})`, y también `resend`/`resetPasswordForEmail` para el
 * 429 (mismo límite de 60 s por usuario, misma pantalla de código). Solo se llama con error. */
export function mapearErrorCodigo(error: ErrorSupabase): ResultadoMapeo<ClaveMapaCodigo> {
  if (esSinConexion(error)) return { clave: "sinConexion" };
  if (error.status === 429) return { clave: "esperar", segundos: extraerSegundosDeEspera(error.message) };
  if (error.status === 403 && error.code === "otp_expired") {
    return { clave: "codigoIncorrectoOVencido" };
  }
  return { clave: "generico" };
}

/** `updateUser({ password })` -- distinto de los tres de arriba (no es signUp/
 * signInWithPassword/verifyOtp). Solo se llama con error. */
export function mapearErrorCambiarContrasena(
  error: ErrorSupabase
): ResultadoMapeo<ClaveMapaCambiarContrasena> {
  if (esSinConexion(error)) return { clave: "sinConexion" };
  if (error.code === "weak_password") return { clave: "contrasenaDebil" };
  if (error.code === "same_password") return { clave: "contrasenaIgual" };
  return { clave: "generico" };
}
