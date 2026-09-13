"use client";

import { TrazadoRuta } from "@/components/mapa/trazado-ruta";
import { useRutaJornada } from "@/lib/hooks/use-ruta-jornada";

// Sin `dynamic(..., { ssr: false })` propio: este componente solo se importa
// desde MapaFlota, que ya vive detrás de ese límite ssr:false a nivel de
// página (ver app/(dashboard)/mapa/page.tsx) — envolverlo de nuevo acá sería
// un segundo límite redundante sin efecto real, MapaFlota nunca se renderiza
// en el servidor.

interface RutaHistoricaProps {
  jornadaId: string;
}

export function RutaHistorica({ jornadaId }: RutaHistoricaProps) {
  const { data, isLoading, isError } = useRutaJornada(jornadaId);

  if (isLoading || isError || !data || data.trazado.length === 0) return null;

  return <TrazadoRuta trazado={data.trazado} puntos={data.puntos} encuadreKey={jornadaId} />;
}
