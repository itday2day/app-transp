import type { PosicionChofer } from "@/lib/types";

export type EstadoMarcador = "rojo" | "verde" | "ambar";

/**
 * Color del marcador de un chofer en el mapa:
 * - rojo: alguna de sus jornadas actuales tuvo/tiene incidencia (máxima prioridad,
 *   sin importar la velocidad).
 * - verde: en movimiento (velocidad > 5 km/h).
 * - ámbar: detenido (velocidad 0, nula, o <= 5 km/h).
 */
export function estadoMarcador(
  posicion: Pick<PosicionChofer, "velocidadKmh" | "tieneIncidencia">
): EstadoMarcador {
  if (posicion.tieneIncidencia) return "rojo";
  if (posicion.velocidadKmh != null && posicion.velocidadKmh > 5) return "verde";
  return "ambar";
}

export const COLOR_POR_ESTADO: Record<EstadoMarcador, string> = {
  rojo: "#dc2626",
  verde: "#16a34a",
  ambar: "#d97706",
};

export const ETIQUETA_POR_ESTADO: Record<EstadoMarcador, string> = {
  rojo: "Incidencia",
  verde: "En movimiento",
  ambar: "Detenido",
};
