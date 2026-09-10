"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";
import { formatFechaHora } from "@/lib/utils";
import { useRutaJornada } from "@/lib/hooks/use-ruta-jornada";

// Sin `dynamic(..., { ssr: false })` propio: este componente solo se importa
// desde MapaFlota, que ya vive detrás de ese límite ssr:false a nivel de
// página (ver app/(dashboard)/mapa/page.tsx) — envolverlo de nuevo acá sería
// un segundo límite redundante sin efecto real, MapaFlota nunca se renderiza
// en el servidor.

const ESTILO_TRAZADO = { color: "#2563eb", weight: 4, opacity: 0.8 };

function icono(letra: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="marcador-ruta" style="background:${color}">${letra}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });
}

const ICONO_INICIO = icono("I", "#16a34a");
const ICONO_FIN = icono("F", "#dc2626");

interface RutaHistoricaProps {
  jornadaId: string;
}

export function RutaHistorica({ jornadaId }: RutaHistoricaProps) {
  const { data, isLoading, isError } = useRutaJornada(jornadaId);
  const map = useMap();
  const encuadrada = useRef<string | null>(null);

  useEffect(() => {
    if (!data || data.trazado.length === 0 || encuadrada.current === jornadaId) return;
    map.fitBounds(L.latLngBounds(data.trazado), { padding: [48, 48], maxZoom: 16 });
    encuadrada.current = jornadaId;
  }, [data, jornadaId, map]);

  if (isLoading || isError || !data || data.trazado.length === 0) return null;

  const primerPunto = data.puntos[0];
  const ultimoPunto = data.puntos[data.puntos.length - 1];

  return (
    <>
      <Polyline positions={data.trazado} pathOptions={ESTILO_TRAZADO} />

      {primerPunto && (
        <Marker position={[primerPunto.lat, primerPunto.lng]} icon={ICONO_INICIO}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">Inicio</p>
              <p>{formatFechaHora(primerPunto.timestamp)}</p>
            </div>
          </Popup>
        </Marker>
      )}

      {ultimoPunto && ultimoPunto !== primerPunto && (
        <Marker position={[ultimoPunto.lat, ultimoPunto.lng]} icon={ICONO_FIN}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">Fin</p>
              <p>{formatFechaHora(ultimoPunto.timestamp)}</p>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}
