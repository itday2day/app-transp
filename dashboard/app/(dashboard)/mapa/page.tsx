"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { PanelChoferes } from "@/components/mapa/panel-choferes";
import { useUltimasPosiciones } from "@/lib/hooks/use-ultimas-posiciones";

// Leaflet necesita `window`, así que el mapa solo se carga en el cliente.
const MapaFlota = dynamic(() => import("@/components/mapa/mapa-flota"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Cargando mapa…
    </div>
  ),
});

export default function MapaPage() {
  const { data: posiciones, isLoading, isError } = useUltimasPosiciones();
  const [choferSeleccionado, setChoferSeleccionado] = useState<string | null>(null);
  // jornada_id cuyo trazado histórico está visible en el mapa — null = ninguna.
  const [jornadaRutaActiva, setJornadaRutaActiva] = useState<string | null>(null);

  const listaPosiciones = posiciones ?? [];

  return (
    <div className="flex h-full min-h-[600px] flex-col md:flex-row">
      <div className="relative order-2 min-h-[50vh] flex-1 md:order-1 md:min-h-0">
        {isError && (
          <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-md border border-danger/30 bg-card px-3 py-2 text-sm text-danger shadow">
            No se pudieron cargar las posiciones. Reintentando…
          </div>
        )}
        <MapaFlota
          posiciones={listaPosiciones}
          choferSeleccionado={choferSeleccionado}
          jornadaRutaActiva={jornadaRutaActiva}
        />
      </div>
      <aside className="order-1 h-64 w-full shrink-0 border-b border-border bg-card md:order-2 md:h-full md:w-80 md:border-b-0 md:border-l">
        <PanelChoferes
          posiciones={listaPosiciones}
          cargando={isLoading}
          choferSeleccionado={choferSeleccionado}
          onSeleccionar={setChoferSeleccionado}
          jornadaRutaActiva={jornadaRutaActiva}
          onToggleRuta={(jornadaId) =>
            setJornadaRutaActiva((actual) => (actual === jornadaId ? null : jornadaId))
          }
        />
      </aside>
    </div>
  );
}
