// spec_app_registro_paso5.md, paso 2b, punto 4.2 (corrección C1): lógica PURA de si aplicar o
// descartar el resultado TARDÍO de construirUsuarioDesdeChofer() (la recarga en segundo plano
// que corre tras un mount con "valida") -- separada de AuthContext.tsx por el mismo motivo que
// restaurarSesion.ts/manejarEventoAuth.ts: probarla con `node`, sin React.
//
// El problema que esto evita: la recarga se dispara con el id del Usuario que había AL EMPEZAR
// la consulta. Si para cuando la consulta responde el chofer ya cerró sesión (botón de salir) o
// llegó un SIGNED_OUT real (ver manejarEventoAuth.ts), aplicar ese resultado tardío
// reestablecería un Usuario (y reescribiría SecureStore) DESPUÉS de que la app ya decidió
// desloguear -- un resultado "zombi" que revive una sesión que la propia app acaba de cerrar.
//
// Por eso esta función exige DOS condiciones para aplicar, no solo que la lectura haya salido
// bien:
//   1. `reconstruido.ok === true` (la lectura de choferes funcionó).
//   2. `usuarioActual` (el Usuario de verdad, al momento en que la consulta RESPONDE, no al
//      momento en que se lanzó) no es `null` Y tiene el MISMO `id` que `idEsperado` (el id con el
//      que se lanzó la consulta) -- si cambió a null (logout/SIGNED_OUT) o a otro id (otro chofer
//      entró mientras tanto), el resultado se descarta.
//
// AuthContext.tsx lee `usuarioActual` de una ref (no del estado de React directamente), porque el
// callback que llama a esta función corre dentro de un `.then()` de una promesa que puede resolver
// mucho después del render que la lanzó -- una ref sincronizada por un efecto siempre tiene el
// valor más reciente, un closure sobre el `usuario` del momento del render no.

import type { Usuario } from "../types";
import type { ResultadoConstruirUsuario } from "../services/authCore";

/**
 * `null` significa "descartar, no tocar nada" (ni `setUsuario` ni SecureStore). Si no es `null`,
 * es el `Usuario` que el llamador debe aplicar (estado + SecureStore).
 */
export function resultadoRecargaUsuario(
  usuarioActual: Usuario | null,
  idEsperado: string,
  reconstruido: ResultadoConstruirUsuario
): Usuario | null {
  if (!reconstruido.ok) return null;
  if (usuarioActual === null || usuarioActual.id !== idEsperado) return null;
  return reconstruido.usuario;
}
