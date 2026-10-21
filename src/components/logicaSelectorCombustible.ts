// Mismo alias que src/types/index.ts (NivelCombustible = number) -- no se importa desde ahí para
// que este archivo quede 100% autónomo (sin "@/..."), como catalogoSql.ts/erroresSync.ts, y se
// pueda compilar aislado con tsc --ignoreConfig para probarlo con node.
type NivelCombustible = number;

/** Decide el próximo valor de `SelectorCombustible` al tocar un chip (spec_ajustes_previos_apk.md,
 * A4) -- pura, sin imports de React, para poder probarse con `node` solo.
 *
 * - Tocar un chip DISTINTO del actual: siempre pasa a ese valor (incluido 0 -- nunca se confunde
 *   con "sin elegir").
 * - Tocar el MISMO chip que ya estaba elegido, con `permitirLimpiar`: vuelve a `null` ("sin
 *   elegir") -- es la única forma de vaciar el campo tras un toque equivocado.
 * - Tocar el MISMO chip sin `permitirLimpiar` (el check-out, que sigue exigiendo un valor):
 *   se queda en el mismo valor, igual que hoy.
 */
export function siguienteCombustible(
  actual: NivelCombustible | null,
  tocado: NivelCombustible,
  permitirLimpiar: boolean
): NivelCombustible | null {
  if (permitirLimpiar && actual === tocado) return null;
  return tocado;
}
