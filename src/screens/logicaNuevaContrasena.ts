// spec_app_registro_paso5.md, paso 2c-2: decisión PURA de qué hace NuevaContrasenaScreen con el
// ResultadoTerminarRecuperacion que devuelve terminarRecuperacion() (authCore.ts). Mismo criterio
// que accionDeResultadoLogin.ts/logicaCodigoVerificacion.ts: sin React, sin i18n, se compila con
// `tsc` puro y se prueba con `node`.

import type { Usuario } from "@/types";
import type { ResultadoTerminarRecuperacion } from "@/services/authCore";
import type { ClaveTraduccion } from "@/i18n";

export type AccionTerminarRecuperacion =
  { tipo: "confirmado"; usuario: Usuario } | { tipo: "error"; textoClave: ClaveTraduccion };

/** Las 4 claves de error de ResultadoTerminarRecuperacion ya tienen su texto genérico en
 * `comun.*` (contrasenaDebil/contrasenaIgual/sinConexion/errorGenerico) -- sin usar hasta esta
 * ronda, confirmado por grep antes de escribir esto, ninguna clave nueva. */
export function accionDeResultadoTerminarRecuperacion(
  resultado: ResultadoTerminarRecuperacion
): AccionTerminarRecuperacion {
  if (resultado.ok) return { tipo: "confirmado", usuario: resultado.usuario };

  switch (resultado.clave) {
    case "contrasenaDebil":
      return { tipo: "error", textoClave: "comun.contrasenaDebil" };
    case "contrasenaIgual":
      return { tipo: "error", textoClave: "comun.contrasenaIgual" };
    case "sinConexion":
      return { tipo: "error", textoClave: "comun.sinConexion" };
    case "generico":
      return { tipo: "error", textoClave: "comun.errorGenerico" };
    default: {
      // A diferencia de ResultadoLogin/ResultadoVerificarCodigo/ResultadoEnvioCodigo (uniones de
      // VARIOS objetos distintos por clave), el `ok:false` de ResultadoTerminarRecuperacion es UN
      // solo objeto con `clave` de tipo unión -- el never exhaustivo narrowea `resultado.clave`
      // (la unión plana de 4 literales), no `resultado` (el objeto entero, que acá no se angosta
      // a `never` por un switch sobre una de sus propiedades).
      const _nunca: never = resultado.clave;
      return _nunca;
    }
  }
}
