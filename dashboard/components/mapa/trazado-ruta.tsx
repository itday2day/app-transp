"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";
import { formatFechaHora } from "@/lib/utils";
import type { PuntoRuta } from "@/lib/types";

// Dibujo del trazado histórico de una ruta — extraído de RutaHistorica
// (usado en el mapa en vivo, /mapa) para poder reutilizarlo también dentro de
// un <MapContainer> propio y aislado (ver MapaRutaJornada, usado desde
// /jornadas). Debe montarse como hijo de un <MapContainer /> — useMap() solo
// funciona dentro de su contexto.

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

interface TrazadoRutaProps {
  trazado: [number, number][];
  puntos: PuntoRuta[];
  /** Identifica la jornada actual — el encuadre (fitBounds) solo se repite
   * cuando cambia, para no pelearle al usuario si después hace zoom/paneo a
   * mano sobre el mismo trazado. */
  encuadreKey: string;
}

export function TrazadoRuta({ trazado, puntos, encuadreKey }: TrazadoRutaProps) {
  const map = useMap();
  const encuadrada = useRef<string | null>(null);

  useEffect(() => {
    if (trazado.length === 0 || encuadrada.current === encuadreKey) return;
    map.fitBounds(L.latLngBounds(trazado), { padding: [48, 48], maxZoom: 16 });
    encuadrada.current = encuadreKey;
  }, [trazado, encuadreKey, map]);

  if (trazado.length === 0) return null;

  const primerPunto = puntos[0];
  const ultimoPunto = puntos[puntos.length - 1];

  return (
    <>
      <Polyline positions={trazado} pathOptions={ESTILO_TRAZADO} />

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
