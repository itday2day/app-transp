"use client";

import { Loader2, MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import { Dialog } from "@/components/ui/dialog";
import { useRutaJornada } from "@/lib/hooks/use-ruta-jornada";

// Leaflet necesita `window`, así que el mapa solo se carga en el cliente —
// mismo patrón que MapaFlota en app/(dashboard)/mapa/page.tsx.
const MapaRutaJornada = dynamic(() => import("@/components/mapa/mapa-ruta-jornada"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Cargando mapa…
    </div>
  ),
});

interface RutaJornadaDialogProps {
  /** null = diálogo cerrado. */
  jornadaId: string | null;
  titulo: string;
  onClose: () => void;
}

/**
 * Modal grande y propio (distinto del modal de detalle de jornada, que ya
 * muestra fotos/ubicaciones) para ver el trazado histórico de UNA jornada
 * puntual desde /jornadas — activa/cerrada, de cualquier fecha. A diferencia
 * del mapa en vivo de /mapa, esta vista es estática: los pings de una
 * jornada ya no cambian, así que `useRutaJornada` los trae una sola vez (sin
 * `refetchInterval`, no hereda el polling de 8s del mapa en vivo).
 */
export function RutaJornadaDialog({ jornadaId, titulo, onClose }: RutaJornadaDialogProps) {
  const { data, isLoading, isError } = useRutaJornada(jornadaId);

  return (
    <Dialog open={jornadaId != null} onClose={onClose} title={titulo} className="max-w-4xl">
      {/* dvh, no vh (Hallazgo #11): en un navegador móvil, vh salta de tamaño
          al mostrarse/ocultarse la barra de direcciones. No se convirtió a
          flex-1/min-h-0 (la alternativa que prefiere la spec si desbordara):
          el panel del modal en mobile es h-full (ocupa el viewport real,
          inmune al salto de vh) con un header sticky (~50px) + p-4 (32px)
          alrededor de este mapa — 70dvh + ~82px de contenido contra un
          modal de 100% del viewport solo desborda por debajo de ~273px de
          alto, muy por debajo de cualquier teléfono real incluso en
          horizontal (~390px, ~30% de margen) — no es el mismo caso del
          Hallazgo #11 (ese padre nunca tuvo un alto genuinamente definido;
          este sí). Ver contexto_proyecto.md §4. */}
      <div className="h-[70dvh] w-full overflow-hidden rounded-md border border-border">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando ruta…
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center text-sm text-danger">
            No se pudo cargar la ruta de esta jornada.
          </div>
        ) : !data || data.puntos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MapPinOff className="h-6 w-6 opacity-60" />
            No hay datos de ubicación registrados para esta jornada.
          </div>
        ) : (
          jornadaId && (
            <MapaRutaJornada jornadaId={jornadaId} trazado={data.trazado} puntos={data.puntos} />
          )
        )}
      </div>
    </Dialog>
  );
}
