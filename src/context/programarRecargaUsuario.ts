// spec_app_registro_paso5.md, paso 2c-0, puntos P4/P6: ÚNICO mecanismo de "recarga en segundo
// plano" tras obtener un Usuario -- antes (paso 2b, punto 4.2) solo corría inline dentro del
// efecto de montaje de AuthContext.tsx, para la rama "valida". Esta corrección lo extrae a esta
// función, parametrizada (sin leer nada de React -- ni hooks ni refs), para que:
//
//   1. AuthContext.tsx la reuse en DOS puntos: el efecto de montaje (rama "valida") Y
//      establecerSesion() -- así login/verifyOtp(signup)/terminarRecuperacion() (los tres caminos
//      que llaman a establecerSesion()) quedan cubiertos por el MISMO reintento que antes solo
//      corría al reabrir la app, sin duplicar la orquestación en cada pantalla nueva.
//   2. Sea testable con `node` simulando la condición de carrera (un resultado que llega TARDE,
//      después de que el usuario ya cambió) -- ver test_programarRecargaUsuario.ts, que controla
//      a mano cuándo resuelve `construirUsuarioDesdeChofer` para forzar ese orden.
//
// La decisión de aplicar o descartar sigue siendo resultadoRecargaUsuario() (recargaUsuario.ts,
// ya probada) -- esta función es solo la orquestación alrededor de esa decisión: lanzar la
// consulta, y si hay que aplicar algo, aplicarlo y persistirlo. Nunca lanza (el `.catch` es a
// propósito un no-op, misma razón que el código que reemplaza: un fallo de esta lectura puntual no
// puede desloguear a nadie).

import type { Usuario } from "../types";
import { construirUsuarioDesdeChofer, type ClienteAuthCore } from "../services/authCore";
import { resultadoRecargaUsuario } from "./recargaUsuario";

export interface DependenciasRecargaUsuario {
  cliente: ClienteAuthCore;
  /** Leído en el momento en que la consulta RESPONDE, no al lanzarla -- debe ser una lectura
   * siempre-al-día (ej. una ref), nunca una variable capturada por closure al momento del llamado. */
  obtenerUsuarioActual: () => Usuario | null;
  aplicarUsuario: (usuario: Usuario) => void;
  persistirUsuario: (usuario: Usuario) => Promise<void>;
}

export function programarRecargaUsuario(idEsperado: string, deps: DependenciasRecargaUsuario): void {
  construirUsuarioDesdeChofer(idEsperado, deps.cliente)
    .then((reconstruido) => {
      const usuarioAAplicar = resultadoRecargaUsuario(deps.obtenerUsuarioActual(), idEsperado, reconstruido);
      if (usuarioAAplicar) {
        deps.aplicarUsuario(usuarioAAplicar);
        void deps.persistirUsuario(usuarioAAplicar);
      }
    })
    .catch(() => {});
}
