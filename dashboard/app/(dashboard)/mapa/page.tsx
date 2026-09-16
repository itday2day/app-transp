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
    <div className="flex h-full min-h-[600px] flex-col lg:flex-row">
      <div className="relative order-2 min-h-[50dvh] flex-1 lg:order-1 lg:min-h-0">
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
      {/* Sin altura fija: el panel crece con su contenido (2-3 choferes no
          deja hueco vacío) hasta max-h-[40dvh] — a partir de ahí, PanelChoferes
          ya scrollea internamente su lista (mantiene el header "Choferes
          activos" fijo) porque a esa altura clampeada el h-full interno pasa a
          resolver contra un valor definido. El mapa mantiene su propio piso de
          altura (min-h-[50dvh] arriba) sin cambios. */}
      <aside className="order-1 max-h-[40dvh] w-full shrink-0 border-b border-border bg-card lg:order-2 lg:h-full lg:max-h-none lg:w-80 lg:border-b-0 lg:border-l">
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
