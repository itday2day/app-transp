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
