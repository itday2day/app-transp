import type { EstadoVehiculo, TipoPropiedadVehiculo } from "@/lib/types";

/** Misma normalización que el índice único de Postgres (mayúsculas, sin caracteres no
 * alfanuméricos) — ver `vehiculos_matricula_normalizada` en supabase/schema.sql. Se usa para
 * identificar un duplicado (y de qué vehículo se trata) ANTES de intentar el insert: la tabla es
 * chica (una flota, no miles de jornadas), así que comparar contra todas las filas ya cargadas en
 * el Route Handler es más simple que sumar una función RPC solo para esta búsqueda. El índice de
 * Postgres sigue siendo la garantía real (defensa en profundidad) por si dos altas coinciden en
 * la misma fracción de segundo.
 *
 * Desde spec_normalizacion_dni_matricula_telefono.md, además es el valor que se GUARDA (antes
 * solo se usaba para comparar, y la columna quedaba con el texto crudo que el usuario tipeó —
 * así pasó QPOI12: nunca se validó el largo en ningún punto de entrada). Se usa en todo input de
 * matrícula del sistema: /flota, corrección de jornada, y (vía SelectorMatricula.tsx) el check-in
 * de la app móvil. */
export function normalizarMatricula(matricula: string): string {
  return matricula.toUpperCase().replace(/[^a-zA-Z0-9]/g, "");
}

/** DNI/NIE español son 9; matrícula española (formato actual 0000ABC) son 7 — mismo criterio en
 * los dos lados de la spec. */
export const MATRICULA_LONGITUD = 7;

export const TIPOS_PROPIEDAD_LEGIBLES: Record<TipoPropiedadVehiculo, string> = {
  propio: "Propio",
  alquilado: "Alquilado",
  autonomo: "Autónomo",
};

export const ESTADOS_VEHICULO_LEGIBLES: Record<EstadoVehiculo, string> = {
  activo: "Activo",
  baja: "De baja",
};
