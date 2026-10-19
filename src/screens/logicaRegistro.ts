// spec_app_registro_paso5.md, paso 2c-3: lógica PURA de RegistroScreen -- qué hacer con
// validarInvitacion()/registrarChofer() (authCore.ts). Mismo criterio que el resto de la familia
// accionDeResultado*: sin React, sin i18n, se compila con `tsc` puro, se prueba con `node`.

import type { ResultadoValidarInvitacion, ResultadoRegistro, EstadoInvitacion } from "@/services/authCore";
import type { ClaveErrorRegistro } from "@/utils/validarDatosRegistro";
import type { ClaveTraduccion } from "@/i18n";

/** Las 4 claves de "invitación inválida" comparten el mismo nombre en authCore.ts
 * (ClaveInvitacionInvalida) y en es.json/en.json (namespace `registro`, ya existentes) -- este
 * Record es la única traducción entre los dos. */
const CLAVE_INVITACION_INVALIDA: Record<Exclude<EstadoInvitacion, "valida">, ClaveTraduccion> = {
  no_existe: "registro.invitacionNoExiste",
  revocada: "registro.invitacionRevocada",
  vencida: "registro.invitacionVencida",
  usada: "registro.invitacionUsada",
};

// criterio 1: "Un token que no sean 32 hexadecimales se ignora (la pantalla pide el código a
// mano)" -- el deep link (apptransp://invitacion/:token, RootNavigator.tsx) entrega CUALQUIER
// string como param, sin validar formato; el filtro es esta función, llamada antes de pedir nada
// al servidor.
const TOKEN_VALIDO_REGEX = /^[0-9a-f]{32}$/i;

export function tokenValido(token: string | undefined): string | undefined {
  return token && TOKEN_VALIDO_REGEX.test(token) ? token : undefined;
}

export type AccionValidarInvitacion = { tipo: "valida" } | { tipo: "error"; textoClave: ClaveTraduccion };

/** R3: un fallo de red/servidor (`motivo: "sinConexion"|"error"`) NUNCA se traduce como "la
 * invitación no existe" -- siempre comun.sinConexion/comun.errorGenerico, reintentables. Solo un
 * `estado` real (la invitación SÍ se pudo leer) puede dar una de las 4 claves de
 * CLAVE_INVITACION_INVALIDA. */
export function accionDeResultadoValidarInvitacion(
  resultado: ResultadoValidarInvitacion
): AccionValidarInvitacion {
  if (!resultado.ok) {
    return {
      tipo: "error",
      textoClave: resultado.motivo === "sinConexion" ? "comun.sinConexion" : "comun.errorGenerico",
    };
  }
  if (resultado.fila.estado === "valida") return { tipo: "valida" };
  return { tipo: "error", textoClave: CLAVE_INVITACION_INVALIDA[resultado.fila.estado] };
}

export type AccionResultadoRegistro =
  | { tipo: "pantallaCodigo" }
  // criterio 5: identities:[] -- ya existe una cuenta CONFIRMADA con ese correo. Tipo propio (no
  // "error" genérico) porque la spec pide DOS botones acá ("Iniciar sesión" y "Recuperar
  // contraseña"), no solo un texto -- la pantalla decide qué pintar según el tipo.
  | { tipo: "correoYaRegistrado" }
  | { tipo: "error"; textoClave: ClaveTraduccion }
  | { tipo: "esperar"; segundos: number; textoClave: ClaveTraduccion };

/** Todas las claves de error ya existen en es.json/en.json (namespace `registro` + `comun.*`),
 * confirmado por grep antes de escribir esto -- ninguna clave nueva. */
export function accionDeResultadoRegistro(resultado: ResultadoRegistro): AccionResultadoRegistro {
  switch (resultado.clave) {
    case "pantallaCodigo":
      return { tipo: "pantallaCodigo" };
    case "correoYaRegistrado":
      return { tipo: "correoYaRegistrado" };
    case "esperar":
      return { tipo: "esperar", segundos: resultado.segundos, textoClave: "comun.esperarCodigo" };
    case "sinConexion":
      return { tipo: "error", textoClave: "comun.sinConexion" };
    case "contrasenaDebil":
      return { tipo: "error", textoClave: "comun.contrasenaDebil" };
    case "invitacionNoExiste":
      return { tipo: "error", textoClave: "registro.invitacionNoExiste" };
    case "invitacionRevocada":
      return { tipo: "error", textoClave: "registro.invitacionRevocada" };
    case "invitacionVencida":
      return { tipo: "error", textoClave: "registro.invitacionVencida" };
    case "invitacionUsada":
      return { tipo: "error", textoClave: "registro.invitacionUsada" };
    case "genericoConPista":
      return { tipo: "error", textoClave: "registro.genericoConPista" };
    case "generico":
      return { tipo: "error", textoClave: "comun.errorGenerico" };
    default: {
      const _nunca: never = resultado;
      return _nunca;
    }
  }
}

/** Traduce una clave de ErroresRegistro (validarDatosRegistro(), ya existente) a su clave de
 * i18n -- mismo namespace `registro`, mismo nombre, ya existentes. */
const CLAVE_ERROR_CAMPO: Record<ClaveErrorRegistro, ClaveTraduccion> = {
  dniInvalido: "registro.dniInvalido",
  nombreVacio: "registro.nombreVacio",
  apellidosVacio: "registro.apellidosVacio",
  fechaInvalida: "registro.fechaInvalida",
  edadMinima: "registro.edadMinima",
  telefonoInvalido: "registro.telefonoInvalido",
};

export function claveErrorCampo(clave: ClaveErrorRegistro): ClaveTraduccion {
  return CLAVE_ERROR_CAMPO[clave];
}
