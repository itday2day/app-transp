/** Valida el combustible inicial que llega en el body de POST /api/jornadas/crear
 * (spec_ajustes_previos_apk.md, A6, ajuste 2026-10-21): ausente o `null` -> `NULL` (nunca 0 por
 * ausencia, a diferencia de un valor fuera de rango, que se rechaza); un número entero finito
 * entre 0 y 100 -> ese número; cualquier otra cosa (fuera de rango, no entero, no numérico,
 * `NaN`) -> rechazado.
 *
 * `valor: unknown`, no `number | undefined`: el body es JSON parseado sin validar su forma en
 * runtime -- un cliente puede mandar cualquier cosa en ese campo, no solo lo que el tipo
 * `CuerpoPeticion` declara en tiempo de compilación.
 */
export type ResultadoCombustibleInicial = { ok: true; valor: number | null } | { ok: false };

export function validarCombustibleInicial(valor: unknown): ResultadoCombustibleInicial {
  if (valor === undefined || valor === null) return { ok: true, valor: null };
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    !Number.isInteger(valor) ||
    valor < 0 ||
    valor > 100
  ) {
    return { ok: false };
  }
  return { ok: true, valor };
}
