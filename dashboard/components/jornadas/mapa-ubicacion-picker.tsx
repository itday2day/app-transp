"use client";

import L from "leaflet";
import { Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { InvalidarAlRedimensionar } from "@/components/mapa/invalidar-al-redimensionar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BuscarDireccionResponse, ResultadoBusquedaDireccion } from "@/lib/types";

// MapContainer propio y aislado (no reutiliza MapaFlota ni MapaRutaJornada,
// ninguno de los dos aplica acá) para marcar `lat_final`/`lng_final` de una
// jornada a mano desde "Corregir" — reemplaza los dos inputs numéricos que
// tenía antes. Se carga vía dynamic(..., { ssr: false }) desde quien lo usa,
// igual que el resto de mapas de este Dashboard — Leaflet necesita `window`.

const ZOOM_CON_PIN = 16;

const ICONO_PIN = L.divIcon({
  className: "",
  html: `<div class="marcador-ubicacion"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function ClickParaMover({ onCambiar }: { onCambiar: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onCambiar(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** `center`/`zoom` de <MapContainer> solo se leen en el primer render —
 * react-leaflet no los vuelve a aplicar si cambian después. Elegir un
 * resultado de búsqueda sí necesita recentrar el mapa ya montado, así que
 * ese caso pasa por acá (`map.setView`) en vez de por la prop `center`. */
function Recentrador({ posicion }: { posicion: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(posicion, ZOOM_CON_PIN);
  }, [posicion, map]);
  return null;
}

function BuscadorDireccion({
  onSeleccionar,
}: {
  onSeleccionar: (resultado: ResultadoBusquedaDireccion) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusquedaDireccion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;

    setBuscando(true);
    setError(null);
    setResultados([]);
    try {
      const respuesta = await fetch(
        `/api/geocodificar/buscar?q=${encodeURIComponent(texto.trim())}`
      );
      const cuerpo = (await respuesta.json().catch(() => null)) as BuscarDireccionResponse | null;
      const encontrados = cuerpo?.resultados ?? [];
      setResultados(encontrados);
      if (encontrados.length === 0) setError("No se encontraron resultados.");
    } catch {
      setError("No se pudo buscar la dirección.");
    } finally {
      setBuscando(false);
    }
  }

  function elegir(resultado: ResultadoBusquedaDireccion) {
    onSeleccionar(resultado);
    setResultados([]);
    setTexto(resultado.displayName);
  }

  return (
    <div>
      <form onSubmit={buscar} className="flex gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar una dirección…"
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="sm" loading={buscando}>
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {resultados.length > 0 && (
        <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border">
          {resultados.map((resultado, indice) => (
            <li key={indice}>
              <button
                type="button"
                onClick={() => elegir(resultado)}
                className="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                {resultado.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface MapaUbicacionPickerProps {
  /** Centrado/zoom iniciales del mapa — ver la lógica de prioridad
   * (lat/lng final > lat/lng de check-in > ciudad por defecto) en
   * editar-jornada-dialog.tsx. Solo importan en el primer render. */
  centroInicial: [number, number];
  zoomInicial: number;
  posicionInicial: [number, number] | null;
  onCambiar: (lat: number, lng: number) => void;
}

export default function MapaUbicacionPicker({
  centroInicial,
  zoomInicial,
  posicionInicial,
  onCambiar,
}: MapaUbicacionPickerProps) {
  const [posicion, setPosicion] = useState<[number, number] | null>(posicionInicial);
  const [recentrarA, setRecentrarA] = useState<[number, number] | null>(null);

  function manejarCambio(lat: number, lng: number) {
    setPosicion([lat, lng]);
    onCambiar(lat, lng);
  }

  return (
    <div className="flex flex-col gap-2">
      <BuscadorDireccion
        onSeleccionar={(resultado) => {
          manejarCambio(resultado.lat, resultado.lng);
          setRecentrarA([resultado.lat, resultado.lng]);
        }}
      />
      <div className="h-56 w-full overflow-hidden rounded-md border border-border">
        <MapContainer
          center={centroInicial}
          zoom={zoomInicial}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InvalidarAlRedimensionar />
          <ClickParaMover onCambiar={manejarCambio} />
          {recentrarA && <Recentrador posicion={recentrarA} />}
          {posicion && (
            <Marker
              position={posicion}
              icon={ICONO_PIN}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  manejarCambio(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        {posicion
          ? `${posicion[0].toFixed(6)}, ${posicion[1].toFixed(6)} — arrastrá el pin o hacé clic en otro punto para moverlo.`
          : "Opcional: buscá una dirección o hacé clic en el mapa para marcar la ubicación final."}
      </p>
    </div>
  );
}
