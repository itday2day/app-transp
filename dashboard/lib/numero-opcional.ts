/** Convierte el texto de un input numerico opcional (spec_ajustes_previos_apk.md, A6) a un
 * numero o a `undefined` -- NUNCA a 0 por un campo vacio. Sin imports de React ni de Next, para
 * poder probarse con `node` solo.
 *
 * - Vacio o solo espacios -> `undefined` (no `Number("")`, que da 0).
 * - Texto numerico finito ("0", "50", "12.5", "1e2") -> ese numero (el "0" da 0, no undefined).
 * - Cualquier otro texto (no numerico, "NaN", "Infinity") -> `undefined`.
 */
export function numeroOpcional(texto: string): number | undefined {
  const limpio = texto.trim();
  if (limpio === "") return undefined;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : undefined;
}
