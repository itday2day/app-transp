"use client";

import { useQuery } from "@tanstack/react-query";
import { obtenerTrazadoAjustado } from "@/lib/ruta-matching";
import type { PuntoRuta, RutaJornadaResponse } from "@/lib/types";

export interface RutaJornada {
  /** Trazado a dibujar en el mapa — ajustado a calles reales si fue posible. */
  trazado: [number, number][];
  /** Pings crudos de GPS, en orden — para los marcadores de inicio/fin. */
  puntos: PuntoRuta[];
  /** false si el ajuste a calles no pudo completarse (ver ruta-matching.ts /
   * el Route Handler de ruta-jornada-match para el detalle del fallback). */
  ajustadoACalles: boolean;
}

async function obtenerPuntosRuta(jornadaId: string): Promise<PuntoRuta[]> {
  const respuesta = await fetch(
    `/api/tracking/ruta-jornada?jornadaId=${encodeURIComponent(jornadaId)}`
  );
  if (!respuesta.ok) {
    throw new Error("No se pudo obtener la ruta de la jornada.");
  }
  const cuerpo = (await respuesta.json()) as RutaJornadaResponse;
  return cuerpo.puntos;
}

/**
 * Trae los pings de GPS de una jornada y arma el trazado a mostrar en el
 * mapa. Si hay 2+ puntos, pide el ajuste a calles a
 * `/api/tracking/ruta-jornada-match` (Geoapify Map Matching, del lado del
 * servidor — ver ese Route Handler); si esa llamada falla del todo (el
 * servidor del Dashboard no responde), cae a una línea recta entre los pings
 * crudos en vez de no mostrar nada. El estado de carga de este hook
 * (`isLoading`) cubre toda la espera de esa llamada de punta a punta.
 */
export function useRutaJornada(jornadaId: string | null) {
  return useQuery({
    queryKey: ["ruta-jornada", jornadaId],
    queryFn: async (): Promise<RutaJornada> => {
      const puntos = await obtenerPuntosRuta(jornadaId as string);
      const lineaRecta: [number, number][] = puntos.map((p) => [p.lat, p.lng]);

      if (puntos.length < 2) {
        return { trazado: lineaRecta, puntos, ajustadoACalles: false };
      }

      try {
        const { trazado, matcheoCompleto } = await obtenerTrazadoAjustado(jornadaId as string);
        return { trazado, puntos, ajustadoACalles: matcheoCompleto };
      } catch (err) {
        console.error("No se pudo ajustar la ruta a las calles, se muestra línea recta:", err);
        return { trazado: lineaRecta, puntos, ajustadoACalles: false };
      }
    },
    enabled: jornadaId != null,
    staleTime: 60_000,
  });
}
