// spec_app_registro_paso5.md, "Resultados de la Fase 1b", secciones 3 y 4 (tabla de errores,
// sustituye al criterio 9 del Bloque B): tres funciones puras que deciden SOLO por `status` y
// `code` -- NUNCA por el texto de `message` (la única excepción es extraer los segundos de un
// 429, que sí vienen en el texto). Ninguna hace red ni efectos: reciben lo que ya devolvió
// supabase-js y devuelven una clave de texto (las traducciones viven en es.json/en.json, nunca
// acá) y, si aplica, los segundos de espera.
//
// Cada clave corresponde a UN renglón literal de la tabla 4 de la spec:
//   - "sinConexion": `status` 0 o sin respuesta -- en cualquiera de las tres llamadas.
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
//
// Las claves de `validar_invitacion` (`no_existe`, `revocada`, `vencida`, `usada`) no están acá:
// esa función no devuelve un error de supabase-js con status/code, devuelve directo el `estado`
// de la fila -- el llamador usa ese valor como clave.

export interface ErrorSupabase {
  status?: number;
  code?: string;
  message?: string;
}

export type ClaveMapaRegistro =
  "sinConexion" | "esperar" | "generico" | "correoYaRegistrado" | "pantallaCodigo" | "revisarInvitacion";

export type ClaveMapaLogin =
  "sinConexion" | "generico" | "credencialesIncorrectas" | "correoSinConfirmar" | "cuentaDadaDeBaja";

export type ClaveMapaCodigo = "sinConexion" | "esperar" | "generico" | "codigoIncorrectoOVencido";

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
  return error.status === 0 || error.status === undefined;
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
