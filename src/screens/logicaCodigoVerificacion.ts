// spec_app_registro_paso5.md, paso 2c-1: lógica PURA de CodigoVerificacionScreen -- normalización
// del campo de código y decisión de qué hacer con lo que devuelven verificarCodigo()/
// reenviarCodigo() (authCore.ts). Sin React, sin i18n (devuelve claves de texto, nunca el texto
// traducido). Mismo criterio que accionDeResultadoLogin.ts: se compila con `tsc` puro, se prueba
// con `node`.

import type { Usuario } from "@/types";
import type { ResultadoVerificarCodigo, ResultadoEnvioCodigo } from "@/services/authCore";
import type { ClaveTraduccion } from "@/i18n";

/** Solo dígitos, máximo 6 -- tolera que el chofer pegue el código con espacios, guiones o letras
 * de por medio (ej. un copia/pega desde el correo con el texto "Tu código: 123 456"). */
export function normalizarCodigo(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, 6);
}

/** Idempotente: normaliza primero, así que da igual si `texto` ya venía normalizado o no. */
export function codigoCompleto(texto: string): boolean {
  return normalizarCodigo(texto).length === 6;
}

export type AccionResultadoCodigo =
  | { tipo: "confirmado"; usuario: Usuario }
  | { tipo: "error"; textoClave: ClaveTraduccion }
  | { tipo: "esperar"; segundos: number; textoClave: ClaveTraduccion };

/** 2c-1 solo llama a verificarCodigo() con tipo:'signup' -- la clave "ok" (éxito de tipo
 * 'recovery', sin Usuario) nunca debería llegar por este camino en esta ronda; se mapea a
 * "generico" en vez de a un `never` (a diferencia de accionDeResultadoLogin.ts) porque el propio
 * tipo `ResultadoVerificarCodigo` es compartido con 'recovery' y SÍ es real para 2c-2 -- esta
 * función no puede exigir que nunca ocurra, solo que hoy (2c-1) no la ejerce ninguna pantalla.
 *
 * Las claves de texto reusan lo que YA existe (todo sin usar hasta esta ronda, confirmado por
 * grep antes de escribir esto): codigo.codigoIncorrectoOVencido, comun.sinConexion,
 * comun.errorGenerico, comun.esperarCodigo (con {{segundos}} ya incluido en su texto) -- ninguna
 * clave nueva de error, solo las de interfaz (codigo.titulo/instruccion/etiquetaCodigo/
 * confirmar/reenviar/reenviarEn/reenviado) son nuevas. */
export function accionDeResultadoCodigo(resultado: ResultadoVerificarCodigo): AccionResultadoCodigo {
  switch (resultado.clave) {
    case "confirmado":
      return { tipo: "confirmado", usuario: resultado.usuario };
    case "ok":
      return { tipo: "error", textoClave: "comun.errorGenerico" };
    case "codigoIncorrectoOVencido":
      return { tipo: "error", textoClave: "codigo.codigoIncorrectoOVencido" };
    case "esperar":
      return { tipo: "esperar", segundos: resultado.segundos, textoClave: "comun.esperarCodigo" };
    case "sinConexion":
      return { tipo: "error", textoClave: "comun.sinConexion" };
    case "generico":
      return { tipo: "error", textoClave: "comun.errorGenerico" };
    default: {
      const _nunca: never = resultado;
      return _nunca;
    }
  }
}

export type ResultadoConfirmarConSesion = { tipo: "confirmado" } | { tipo: "confirmadoSinSesion" };

/**
 * E1 (ronda post-2c-1): tras un verifyOtp(signup) exitoso, el código YA se consumió -- no hay
 * vuelta atrás, pedir otro no tiene sentido. Si `establecerSesion()` (guardarValor()/SecureStore,
 * ver AuthContext.tsx y el hallazgo de la observación 0.3) rechaza en ESTE punto puntual, NO se
 * reintenta el código: se avisa con `codigo.confirmadoSinSesion` y el chofer entra a mano desde
 * Login con el correo que ya confirmó.
 *
 * `establecerSesion` llega INYECTADO (no importa AuthContext.tsx acá) para poder probar las dos
 * ramas con un fake que resuelve y uno que rechaza, sin React ni SecureStore reales -- mismo
 * criterio que toda la familia restaurarSesion.ts/programarRecargaUsuario.ts. El error real NUNCA
 * se captura en una variable ni se loguea (R7): el `catch {}` lo descarta por completo.
 */
export async function confirmarConSesion(
  usuario: Usuario,
  establecerSesion: (usuario: Usuario) => Promise<void>
): Promise<ResultadoConfirmarConSesion> {
  try {
    await establecerSesion(usuario);
    return { tipo: "confirmado" };
  } catch {
    return { tipo: "confirmadoSinSesion" };
  }
}

export type AccionResultadoReenvio =
  | { tipo: "reenviado"; textoClave: ClaveTraduccion; segundosReinicio: number }
  | { tipo: "error"; textoClave: ClaveTraduccion }
  | { tipo: "esperar"; segundos: number; textoClave: ClaveTraduccion };

const SEGUNDOS_POR_DEFECTO = 60;

export function accionDeResultadoReenvio(resultado: ResultadoEnvioCodigo): AccionResultadoReenvio {
  switch (resultado.clave) {
    case "ok":
      return {
        tipo: "reenviado",
        textoClave: "codigo.reenviado",
        segundosReinicio: SEGUNDOS_POR_DEFECTO,
      };
    case "esperar":
      return { tipo: "esperar", segundos: resultado.segundos, textoClave: "comun.esperarCodigo" };
    case "sinConexion":
      return { tipo: "error", textoClave: "comun.sinConexion" };
    case "generico":
      return { tipo: "error", textoClave: "comun.errorGenerico" };
    default: {
      const _nunca: never = resultado;
      return _nunca;
    }
  }
}
