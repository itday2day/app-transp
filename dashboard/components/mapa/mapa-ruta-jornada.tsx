"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import { TrazadoRuta } from "@/components/mapa/trazado-ruta";
import type { PuntoRuta } from "@/lib/types";

// MapContainer propio y aislado para ver la ruta de UNA jornada puntual desde
// /jornadas (RutaJornadaDialog) — a propósito no reutiliza el MapContainer de
// MapaFlota, que trae marcadores de otros choferes y el polling del mapa en
// vivo, ninguno de los dos relevante acá (jornada ya cerrada hace tiempo,
// trazado estático). Se carga vía dynamic(..., { ssr: false }) desde quien lo
// usa, igual que MapaFlota — Leaflet necesita `window`.

const ZOOM_INICIAL = 14;

interface MapaRutaJornadaProps {
  /** Identifica la jornada actual, para que TrazadoRuta sepa cuándo re-encuadrar. */
  jornadaId: string;
  trazado: [number, number][];
  puntos: PuntoRuta[];
}

export default function MapaRutaJornada({ jornadaId, trazado, puntos }: MapaRutaJornadaProps) {
  // TrazadoRuta hace fitBounds apenas monta (ver su propio useEffect), así
  // que el center/zoom iniciales acá solo importan como primer frame antes
  // de ese ajuste — siempre hay al menos 1 punto cuando este componente se
  // monta (RutaJornadaDialog no lo renderiza si la jornada no tiene pings).
  const centroInicial = trazado[0];

  return (
    <MapContainer
      center={centroInicial}
      zoom={ZOOM_INICIAL}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <TrazadoRuta trazado={trazado} puntos={puntos} encuadreKey={jornadaId} />
    </MapContainer>
  );
}
