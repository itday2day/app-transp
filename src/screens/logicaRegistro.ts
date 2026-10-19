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
  | { tipo: "error"; textoClave: ClaveTraduccion }
  | { tipo: "esperar"; segundos: number; textoClave: ClaveTraduccion };

/** Todas las claves de error ya existen en es.json/en.json (namespace `registro` + `comun.*`),
 * confirmado por grep antes de escribir esto -- ninguna clave nueva. */
export function accionDeResultadoRegistro(resultado: ResultadoRegistro): AccionResultadoRegistro {
  switch (resultado.clave) {
    case "pantallaCodigo":
      return { tipo: "pantallaCodigo" };
    case "correoYaRegistrado":
      return { tipo: "error", textoClave: "registro.correoYaRegistrado" };
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
