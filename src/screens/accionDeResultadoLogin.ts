// spec_app_registro_paso5.md, paso 2c-1: decisión PURA de qué hace LoginScreen con el
// ResultadoLogin que devuelve iniciarSesion() (AuthContext.tsx) -- sin React, sin i18n (devuelve
// una CLAVE de texto, nunca el texto traducido; la pantalla hace t(textoClave)). Mismo criterio
// que restaurarSesion.ts/manejarEventoAuth.ts: se compila con `tsc` puro y se prueba con `node`.
//
// El switch sobre `resultado.clave` es exhaustivo a propósito -- la asignación a `_nunca: never`
// en el `default` hace que TypeScript rompa la compilación si alguna vez se agrega una clave nueva
// a ClaveMapaLogin sin agregar también su rama acá. Ninguna clave de fallo puede "caer" a
// "entrar": la única forma de llegar a {tipo:"entrar"} es `resultado.ok === true`.

import type { ResultadoLogin } from "@/services/authCore";

export type AccionResultadoLogin =
  { tipo: "entrar" } | { tipo: "error"; textoClave: string } | { tipo: "irACodigo"; correo: string };

export function accionDeResultadoLogin(resultado: ResultadoLogin): AccionResultadoLogin {
  if (resultado.ok) return { tipo: "entrar" };

  switch (resultado.clave) {
    case "correoSinConfirmar":
      // El correo RESUELTO por authCore.ts (identificadorACorreo() ya corrió adentro de
      // iniciarSesionCore) -- nunca el texto tal cual lo tecleó el chofer, que podría ser un
      // número de empleado sin "@".
      return { tipo: "irACodigo", correo: resultado.correo };
    case "credencialesIncorrectas":
      return { tipo: "error", textoClave: "login.errorCredenciales" };
    case "sinConexion":
      return { tipo: "error", textoClave: "login.errorConexion" };
    case "cuentaDadaDeBaja":
      return { tipo: "error", textoClave: "login.errorCuentaBaja" };
    case "generico":
      return { tipo: "error", textoClave: "login.errorGenerico" };
    default: {
      const _nunca: never = resultado;
      return _nunca;
    }
  }
}
