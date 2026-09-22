import type { EstadoVehiculo, TipoPropiedadVehiculo } from "@/lib/types";

/** Misma normalización que el índice único de Postgres (mayúsculas, sin caracteres no
 * alfanuméricos) — ver `vehiculos_matricula_normalizada` en supabase/schema.sql. Se usa acá para
 * poder identificar un duplicado (y de qué vehículo se trata) ANTES de intentar el insert: la
 * tabla es chica (una flota, no miles de jornadas), así que comparar contra todas las filas ya
 * cargadas en el Route Handler es más simple que sumar una función RPC solo para esta búsqueda, y
 * mantiene el índice de expresión "sin columna extra" que pedía la spec. El índice de Postgres
 * sigue siendo la garantía real (defensa en profundidad) por si dos altas coinciden en la misma
 * fracción de segundo. */
export function normalizarMatricula(matricula: string): string {
  return matricula.toUpperCase().replace(/[^a-zA-Z0-9]/g, "");
}

export const TIPOS_PROPIEDAD_LEGIBLES: Record<TipoPropiedadVehiculo, string> = {
  propio: "Propio",
  alquilado: "Alquilado",
  autonomo: "Autónomo",
};

export const ESTADOS_VEHICULO_LEGIBLES: Record<EstadoVehiculo, string> = {
  activo: "Activo",
  baja: "De baja",
};
