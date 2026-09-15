import { NextResponse } from "next/server";
import type { BuscarDireccionResponse } from "@/lib/types";

// GET /api/geocodificar/buscar?q=<texto de búsqueda>
//
// Geocodificación directa (texto -> coordenadas) vía la API pública de
// Nominatim, para el buscador de direcciones del selector de ubicación en
// mapa (ver components/jornadas/mapa-ubicacion-picker.tsx). Mismo motivo que
// /api/geocodificar (inversa) para correr del lado del servidor: la política
// de uso de Nominatim exige identificar la app con un `User-Agent` válido
// (https://operations.osmfoundation.org/policies/nominatim/), y los
// navegadores ignoran silenciosamente cualquier `User-Agent` custom que
// JavaScript intente fijar en un `fetch()` del lado del cliente.
//
// Sin caché en memoria (a diferencia de la inversa): acá la clave sería el
// texto libre que escribe el admin, mucho menos probable que se repita
// exacto entre búsquedas distintas — no vale la pena la complejidad.
//
// Sobre el límite de ~1 solicitud/segundo de la política de Nominatim: este
// endpoint solo se llama cuando el admin busca explícitamente (submit del
// formulario de búsqueda, no en cada tecla que escribe) — el ritmo de uso
// humano normal ya queda muy por debajo de ese límite sin necesidad de
// throttling artificial acá.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "app-transp-dashboard (it@day2day.es)";
const TIMEOUT_MS = 8000;
const MAX_RESULTADOS = 5;

interface ResultadoNominatim {
  display_name: string;
  lat: string;
  lon: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const consulta = searchParams.get("q")?.trim();

  if (!consulta) {
    return NextResponse.json({ mensaje: "Falta el texto de búsqueda (q)." }, { status: 400 });
  }

  try {
    const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(consulta)}&limit=${MAX_RESULTADOS}`;
    const respuesta = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      return NextResponse.json({ resultados: [] } satisfies BuscarDireccionResponse);
    }

    const cuerpo = (await respuesta.json()) as ResultadoNominatim[];
    const resultados = cuerpo
      .map((item) => ({
        displayName: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

    return NextResponse.json({ resultados } satisfies BuscarDireccionResponse);
  } catch {
    // Timeout, red caída, JSON inválido: nunca rompe la pantalla, el
    // buscador simplemente no devuelve resultados esta vez.
    return NextResponse.json({ resultados: [] } satisfies BuscarDireccionResponse);
  }
}
