import { NextResponse } from "next/server";
import type { GeocodificarResponse } from "@/lib/types";

// GET /api/geocodificar?lat=&lng=
//
// Geocodificación inversa (coordenadas -> dirección legible) vía la API
// pública de Nominatim (OpenStreetMap). Corre del lado del servidor a
// propósito, no directo desde el navegador como OSRM (ver lib/osrm.ts): la
// política de uso de Nominatim exige identificar la app con un User-Agent
// válido (https://operations.osmfoundation.org/policies/nominatim/), y los
// navegadores ignoran silenciosamente cualquier User-Agent custom que
// intente fijar fetch() del lado del cliente — solo un Route Handler puede
// cumplir ese requisito.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "app-transp-dashboard (it@day2day.es)";
const TIMEOUT_MS = 8000;

// Cache en memoria del propio proceso: una dirección no cambia, así que no
// hace falta invalidarla nunca. Clave = coordenadas redondeadas a 4
// decimales (~11m de resolución, de sobra para agrupar el mismo punto) —
// evita volver a pegarle a Nominatim cada vez que se reabre el mismo detalle
// de jornada. Se pierde al reiniciar el proceso; aceptable para una
// herramienta interna de bajo tráfico, sin sumar Redis ni nada externo.
const cache = new Map<string, string | null>();

function claveCache(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

interface RespuestaNominatim {
  display_name?: string;
  error?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { mensaje: "lat y lng son obligatorios y deben ser numéricos." },
      { status: 400 }
    );
  }

  const clave = claveCache(lat, lng);
  if (cache.has(clave)) {
    return NextResponse.json({
      direccion: cache.get(clave) ?? null,
    } satisfies GeocodificarResponse);
  }

  try {
    const url = `${NOMINATIM_URL}?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const respuesta = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      cache.set(clave, null);
      return NextResponse.json({ direccion: null } satisfies GeocodificarResponse);
    }

    const cuerpo = (await respuesta.json()) as RespuestaNominatim;
    const direccion = cuerpo.display_name ?? null;
    cache.set(clave, direccion);

    return NextResponse.json({ direccion } satisfies GeocodificarResponse);
  } catch {
    // Timeout, red caída, JSON inválido, lo que sea: nunca bloquea al
    // Dashboard, solo se muestra sin dirección (ver jornada-detalle-dialog.tsx).
    // No se cachea el fallo — sí vale la pena reintentar en la próxima visita.
    return NextResponse.json({ direccion: null } satisfies GeocodificarResponse);
  }
}
