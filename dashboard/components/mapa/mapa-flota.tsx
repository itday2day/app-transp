"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { formatHaceTiempo } from "@/lib/utils";
import { COLOR_POR_ESTADO, estadoMarcador, ETIQUETA_POR_ESTADO } from "@/lib/mapa-utils";
import type { PosicionChofer } from "@/lib/types";

// Centrado por defecto (Ciudad de México) cuando todavía no hay ningún ping
// de posición que mostrar; en cuanto haya al menos uno, la vista se ajusta
// automáticamente a los marcadores.
const CENTRO_DEFECTO: [number, number] = [19.4326, -99.1332];
const ZOOM_DEFECTO = 5;

const cacheIconos = new Map<string, L.DivIcon>();

function obtenerIcono(color: string): L.DivIcon {
  let icono = cacheIconos.get(color);
  if (!icono) {
    icono = L.divIcon({
      className: "",
      html: `<div class="marcador-chofer" style="background:${color}"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -12],
    });
    cacheIconos.set(color, icono);
  }
  return icono;
}

/** Ajusta la vista del mapa: encuadra todos los marcadores la primera vez que
 * llegan datos, y hace flyTo cuando el usuario selecciona un chofer desde el
 * panel lateral. Va como hijo de <MapContainer /> porque useMap() solo
 * funciona dentro de su contexto. */
function ControladorVista({
  posiciones,
  choferSeleccionado,
}: {
  posiciones: PosicionChofer[];
  choferSeleccionado: string | null;
}) {
  const map = useMap();
  const encuadreInicialHecho = useRef(false);

  useEffect(() => {
    if (posiciones.length === 0 || encuadreInicialHecho.current) return;
    const bounds = L.latLngBounds(posiciones.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    encuadreInicialHecho.current = true;
  }, [posiciones, map]);

  useEffect(() => {
    if (!choferSeleccionado) return;
    const objetivo = posiciones.find((p) => p.choferId === choferSeleccionado);
    if (!objetivo) return;
    map.flyTo([objetivo.lat, objetivo.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [choferSeleccionado, posiciones, map]);

  return null;
}

interface MapaFlotaProps {
  posiciones: PosicionChofer[];
  choferSeleccionado?: string | null;
}

export default function MapaFlota({ posiciones, choferSeleccionado = null }: MapaFlotaProps) {
  const marcadores = useMemo(
    () =>
      posiciones.map((posicion) => ({
        posicion,
        estado: estadoMarcador(posicion),
      })),
    [posiciones]
  );

  return (
    <MapContainer
      center={CENTRO_DEFECTO}
      zoom={ZOOM_DEFECTO}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ControladorVista posiciones={posiciones} choferSeleccionado={choferSeleccionado} />
      {marcadores.map(({ posicion, estado }) => (
        <Marker
          key={posicion.choferId}
          position={[posicion.lat, posicion.lng]}
          icon={obtenerIcono(COLOR_POR_ESTADO[estado])}
        >
          <Popup>
            <div className="min-w-40 text-sm">
              <p className="font-semibold">{posicion.choferNombre ?? "Chofer sin identificar"}</p>
              {posicion.matricula && <p>Matrícula: {posicion.matricula}</p>}
              {posicion.empresa && <p>Empresa: {posicion.empresa}</p>}
              <p>
                {ETIQUETA_POR_ESTADO[estado]}
                {" · "}
                {posicion.velocidadKmh != null
                  ? `${posicion.velocidadKmh.toFixed(0)} km/h`
                  : "sin velocidad"}
              </p>
              <p className="text-xs opacity-70">
                Última señal: {formatHaceTiempo(posicion.timestamp)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
