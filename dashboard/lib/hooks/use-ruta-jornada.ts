"use client";

import { useQuery } from "@tanstack/react-query";
import { getOSRMRoute } from "@/lib/osrm";
import type { PuntoRuta, RutaJornadaResponse } from "@/lib/types";

export interface RutaJornada {
  /** Trazado a dibujar en el mapa — ajustado a calles vía OSRM si fue posible. */
  trazado: [number, number][];
  /** Pings crudos de GPS, en orden — para los marcadores de inicio/fin. */
  puntos: PuntoRuta[];
  /** false si OSRM no pudo ajustar todo el trazado a calles (falló del todo,
   * o al menos uno de sus tramos cayó a línea recta — ver osrm.ts). */
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
 * mapa. Si hay 2+ puntos, intenta ajustarlos a las calles vía OSRM
 * (`getOSRMRoute`, que internamente puede hacer varias llamadas secuenciales
 * si el trayecto es largo — ver "tramos" en lib/osrm.ts); si eso falla del
 * todo (servidor demo público de OSRM caído o con rate-limit — ver
 * advertencia en lib/osrm.ts), cae a una línea recta entre los pings crudos
 * en vez de no mostrar nada. El estado de carga de este hook (`isLoading`)
 * cubre toda esa secuencia de llamadas, no solo la primera — es un único
 * `await` de punta a punta desde acá, sin importar cuántas llamadas internas
 * haga `getOSRMRoute`.
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
        const { trazado, matcheoCompleto } = await getOSRMRoute(puntos);
        return { trazado, puntos, ajustadoACalles: matcheoCompleto };
      } catch (err) {
        console.error("OSRM falló por completo, se muestra línea recta entre los pings:", err);
        return { trazado: lineaRecta, puntos, ajustadoACalles: false };
      }
    },
    enabled: jornadaId != null,
    staleTime: 60_000,
  });
}
