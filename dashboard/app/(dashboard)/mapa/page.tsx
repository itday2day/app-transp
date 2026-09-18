"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PanelChoferes } from "@/components/mapa/panel-choferes";
import { Button } from "@/components/ui/button";
import { useUltimasPosiciones } from "@/lib/hooks/use-ultimas-posiciones";
import { cn } from "@/lib/utils";

const suscribirSinCambios = () => () => {};

// El slot es markup estático de layout.tsx (siempre presente, nunca
// desmontado), así que su existencia no "cambia" — mismo motivo por el que
// ThemeToggle usa useSyncExternalStore (no useState+useEffect) para leer un
// valor que solo se conoce en el cliente, sin disparar un setState síncrono
// dentro de un efecto (ver components/theme-toggle.tsx).
function useSlotSelectorHorizontal(): HTMLElement | null {
  return useSyncExternalStore(
    suscribirSinCambios,
    () => document.getElementById("selector-movil-horizontal"),
    () => null
  );
}

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

  // En teléfono horizontal, header + nav + este selector no entran cómodos
  // en los ~390px de alto disponibles (Hallazgo #14) — se fusiona con la fila
  // de navegación de app/(dashboard)/layout.tsx (que vive en otra rama del
  // árbol) vía un portal a un slot con `id` fijo, en vez de levantar estado o
  // duplicar la navegación: layout.tsx no necesita saber que está en /mapa,
  // y en cualquier otra ruta (ej. /jornadas) el slot simplemente no recibe
  // nada.
  const slotSelectorHorizontal = useSlotSelectorHorizontal();

  const listaPosiciones = posiciones ?? [];

  // landscape:max-lg:flex-none landscape:max-lg:w-full — en la fila
  // horizontal de siempre (portrait) se reparten 50/50 con flex-1; en la
  // columna vertical del Hallazgo #15 (mismo elemento, otro contenedor vía
  // portal) flex-1 los estiraría para ocupar todo el alto libre de la
  // columna, deformados frente al resto de los controles — se cancela ahí y
  // pasan a ancho completo, alto natural, como el resto de la columna.
  const botonesSelectorVista = (
    <>
      <Button
        type="button"
        variant={vistaMobile === "mapa" ? "default" : "outline"}
        aria-pressed={vistaMobile === "mapa"}
        className="flex-1 landscape:max-lg:w-full landscape:max-lg:flex-none"
        onClick={() => setVistaMobile("mapa")}
      >
        Mapa
      </Button>
      <Button
        type="button"
        variant={vistaMobile === "lista" ? "default" : "outline"}
        aria-pressed={vistaMobile === "lista"}
        className="flex-1 landscape:max-lg:w-full landscape:max-lg:flex-none"
        onClick={() => setVistaMobile("lista")}
      >
        Lista
      </Button>
    </>
  );

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
      {/* landscape:max-lg:hidden — en teléfono horizontal este selector se
          fusiona con la nav de layout.tsx vía el portal de abajo, para no
          sumar una tercera barra (Hallazgo #14); en vertical y en escritorio
          (donde `lg:hidden` ya lo ocultaba) no cambia nada. */}
      <div className="flex gap-2 border-b border-border bg-card p-2 landscape:max-lg:hidden lg:hidden">
        {botonesSelectorVista}
      </div>

      {slotSelectorHorizontal &&
        createPortal(
          // La columna (layout.tsx, Hallazgo #15) es flex-col — este wrapper
          // se apila igual, no en fila como antes de esa spec.
          <div className="hidden w-full shrink-0 flex-col gap-1 landscape:max-lg:flex">
            {botonesSelectorVista}
          </div>,
          slotSelectorHorizontal
        )}

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
