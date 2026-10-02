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

// spec_identidad_visual_day2day.md: mismos valores que --danger/--success/--warning de
// globals.css — hex literal porque esto alimenta el HTML crudo de un divIcon de Leaflet, fuera
// del árbol de React/Tailwind (no puede resolver clases de Tailwind ahí).
export const COLOR_POR_ESTADO: Record<EstadoMarcador, string> = {
  rojo: "#c7362c",
  verde: "#146b46",
  ambar: "#8f5a00",
};

export const ETIQUETA_POR_ESTADO: Record<EstadoMarcador, string> = {
  rojo: "Incidencia",
  verde: "En movimiento",
  ambar: "Detenido",
};
