"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { PanelChoferes } from "@/components/mapa/panel-choferes";
import { Button } from "@/components/ui/button";
import { useUltimasPosiciones } from "@/lib/hooks/use-ultimas-posiciones";
import { cn } from "@/lib/utils";

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
  // Por debajo de `lg`, mapa y panel de choferes no entran juntos en una
  // pantalla de teléfono (Hallazgo #12) — se muestra uno u otro, nunca los
  // dos repartidos. Por defecto "mapa": la pantalla se llama "Mapa en vivo"
  // en la navegación. Sin persistencia ni parámetro de URL — estado local,
  // se resetea a "mapa" cada vez que se entra a la pantalla. Desde `lg` este
  // estado no se usa: mapa y panel van lado a lado, como siempre.
  const [vistaMobile, setVistaMobile] = useState<"mapa" | "lista">("mapa");

  const listaPosiciones = posiciones ?? [];

  function seleccionarChofer(choferId: string) {
    setChoferSeleccionado(choferId);
    // Seleccionar un chofer dispara un flyTo en el mapa (ControladorVista,
    // mapa-flota.tsx) — un efecto que solo se ve si la vista activa es el
    // mapa, así que cambia a esa vista.
    setVistaMobile("mapa");
  }

  function alternarRutaHistorica(jornadaId: string) {
    const activando = jornadaRutaActiva !== jornadaId;
    setJornadaRutaActiva(activando ? jornadaId : null);
    // "Ver ruta" dibuja el trazado histórico en el mapa (RutaHistorica) —
    // cambia a la vista de mapa para que se vea. "Ocultar ruta" no agrega
    // nada nuevo que mostrar ahí, así que no cambia de vista.
    if (activando) setVistaMobile("mapa");
  }

  return (
    // `lg:min-h-[600px]` (no un piso incondicional): por debajo de `lg` este
    // piso, pensado para que el mapa no quede aplastado en una ventana de
    // escritorio alta, sumado al header + selector, superaba el alto real
    // del teléfono (medido: 722px de contenido contra 549px de viewport en
    // vertical, y peor en horizontal) — la página quedaba scrolleable y el
    // mapa, al capturar el gesto de arrastre, no dejaba forma de volver
    // arriba. Ver contexto_proyecto.md §4.
    <div className="flex min-h-0 flex-1 flex-col lg:min-h-[600px]">
      <div className="flex gap-2 border-b border-border bg-card p-2 lg:hidden">
        <Button
          type="button"
          variant={vistaMobile === "mapa" ? "default" : "outline"}
          aria-pressed={vistaMobile === "mapa"}
          className="flex-1"
          onClick={() => setVistaMobile("mapa")}
        >
          Mapa
        </Button>
        <Button
          type="button"
          variant={vistaMobile === "lista" ? "default" : "outline"}
          aria-pressed={vistaMobile === "lista"}
          className="flex-1"
          onClick={() => setVistaMobile("lista")}
        >
          Lista
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={cn(
            "relative min-h-0 flex-1 lg:order-1",
            vistaMobile === "mapa" ? "" : "hidden lg:block"
          )}
        >
          {isError && (
            <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-md border border-danger/30 bg-card px-3 py-2 text-sm text-danger shadow">
              No se pudieron cargar las posiciones. Reintentando…
            </div>
          )}
          {/* vistaActiva: el mapa queda MONTADO todo el tiempo (nunca se
              desmonta al cambiar a "Lista" — perdería zoom/centro y volvería a
              pedir tiles) — invalidateSize() explícito al volver a mostrarse,
              porque su contenedor mide 0 mientras está oculto (ver
              contexto_proyecto.md §4). */}
          <MapaFlota
            posiciones={listaPosiciones}
            choferSeleccionado={choferSeleccionado}
            jornadaRutaActiva={jornadaRutaActiva}
            vistaActiva={vistaMobile === "mapa"}
          />
        </div>

        {/* relative + hijo max-lg:absolute max-lg:inset-0 (no depender de que
            PanelChoferes resuelva su propio h-full contra el alto que este
            aside saca de max-lg:flex-1 — flex-grow no cuenta como "alto
            definido" en CSS para que un `%` de un hijo resuelva contra él,
            exactamente el bug medido del Hallazgo #11/#12 en el mapa; con
            inset-0 se apoya en el alto YA renderizado, no en resolución por
            porcentaje). Desde `lg`, aside sigue siendo un bloque normal —
            ese h-full ya se confirmó definido ahí (align-items: stretch en
            la fila). */}
        <aside
          className={cn(
            "relative w-full border-b border-border bg-card lg:order-2 lg:h-full lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-l",
            vistaMobile === "lista" ? "min-h-0 max-lg:flex-1" : "hidden lg:block"
          )}
        >
          <div className="max-lg:absolute max-lg:inset-0">
            <PanelChoferes
              posiciones={listaPosiciones}
              cargando={isLoading}
              choferSeleccionado={choferSeleccionado}
              onSeleccionar={seleccionarChofer}
              jornadaRutaActiva={jornadaRutaActiva}
              onToggleRuta={alternarRutaHistorica}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
