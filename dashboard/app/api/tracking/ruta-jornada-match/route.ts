import { NextResponse } from "next/server";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { PuntoRuta, UbicacionTrackingPlanaRow } from "@/lib/types";

// GET /api/tracking/ruta-jornada-match?jornadaId=<uuid>
//
// Ajusta los pings de GPS de una jornada a las calles reales vía Geoapify Map
// Matching (https://apidocs.geoapify.com/docs/map-matching/). Corre del lado
// del servidor a propósito, no directo desde el navegador: Geoapify exige una
// API key que no debe quedar expuesta en el cliente (mismo motivo por el que
// /api/geocodificar llama a Nominatim desde acá y no desde el navegador,
// aunque ahí la razón sea otra — el User-Agent).
//
// ⚠️ **Reemplaza la integración anterior con OSRM** (`dashboard/lib/osrm.ts`,
// ya eliminado): el servidor demo público de OSRM (`router.project-osrm.org`)
// imponía un límite de 10 puntos por llamada, no documentado, que obligó a
// partir el trayecto en tramos (`OSRM_MAX_TRAMOS`, `partirEnTramos`,
// `matchearTramo`) para no perder detalle en jornadas largas. Geoapify acepta
// hasta 1000 waypoints por llamada — alcanza con una sola llamada para
// prácticamente cualquier jornada real, así que todo ese sistema de tramos
// dejó de hacer falta y se quitó por completo.
//
// Reutiliza la misma consulta que `/api/tracking/ruta-jornada` (pings
// ordenados ascendente por timestamp) — es una consulta independiente, no un
// llamado interno a ese otro Route Handler: éste necesita procesarlos
// (deduplicar, muestrear, mandarlos a Geoapify) antes de responder, así que
// tiene sentido que traiga sus propios datos en vez de encadenar un fetch a
// otra ruta del mismo servidor.

const MAX_PUNTOS_GEOAPIFY = 1000; // límite real documentado por Geoapify, por llamada
const TIMEOUT_MS = 8000; // mismo criterio que ya usaba lib/osrm.ts

interface ResultadoTrazado {
  trazado: [number, number][];
  /** false si Geoapify no pudo ajustar el trazado (falló, sin API key, o muy pocos puntos únicos). */
  matcheoCompleto: boolean;
}

// Ver la corrección homónima que existía en lib/osrm.ts: `ubicaciones_tracking`
// puede tener pings duplicados exactos (mismo lat/lng/timestamp repetido
// varias veces — origen no confirmado, deuda técnica del lado de la app
// móvil, ver contexto_proyecto.md). Son ruido puro para cualquier proveedor
// de map matching, no solo para OSRM, así que el filtro se mantiene igual acá.
function quitarPingsDuplicados(pings: PuntoRuta[]): PuntoRuta[] {
  return pings.filter((ping, indice) => {
    if (indice === 0) return true;
    const anterior = pings[indice - 1];
    return !(
      ping.lat === anterior.lat &&
      ping.lng === anterior.lng &&
      ping.timestamp === anterior.timestamp
    );
  });
}

// Red de seguridad para el caso extremo de una jornada con más de 1000 pings
// únicos (varias horas de tracking continuo) — Geoapify rechazaría la
// petición directamente. Muestrea parejo conservando siempre el primer y el
// último punto, mismo criterio que ya usaba lib/osrm.ts.
function muestrear<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;

  const paso = (items.length - 1) / (max - 1);
  const muestreados: T[] = [];
  for (let i = 0; i < max; i++) {
    muestreados.push(items[Math.round(i * paso)]);
  }
  return muestreados;
}

interface GeoapifyFeature {
  geometry: { type: string; coordinates: [number, number][][] };
}

interface RespuestaGeoapify {
  type: string;
  features?: GeoapifyFeature[];
}

/**
 * Llama a Geoapify Map Matching y devuelve la geometría ajustada a calles
 * como `[lat, lng]`. Tira un error si Geoapify no responde o no devuelve
 * ninguna geometría — quien llama decide el fallback a línea recta.
 */
async function matchearConGeoapify(
  pings: PuntoRuta[],
  apiKey: string
): Promise<[number, number][]> {
  const cuerpoPeticion = {
    mode: "drive",
    waypoints: pings.map((p) => ({
      location: [p.lng, p.lat],
      timestamp: new Date(p.timestamp).toISOString(),
    })),
  };

  const respuesta = await fetch(`https://api.geoapify.com/v1/mapmatching?apiKey=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoPeticion),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!respuesta.ok) {
    const cuerpoError = await respuesta.text().catch(() => "");
    throw new Error(`Geoapify respondió ${respuesta.status}: ${cuerpoError || "(sin cuerpo)"}`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaGeoapify;
  const feature = cuerpo.features?.[0];
  if (!feature) {
    throw new Error("Geoapify no devolvió ninguna geometría matcheada.");
  }

  // La geometría es un MultiLineString: un array de LineStrings (cada uno un
  // array de [lng, lat]), no un LineString único como devolvía OSRM — se
  // concatenan en orden, mismo criterio que ya se usaba con los `matchings`
  // de OSRM cuando el trayecto quedaba partido en varios tramos.
  return feature.geometry.coordinates.flatMap((linea) =>
    linea.map(([lng, lat]): [number, number] => [lat, lng])
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jornadaId = searchParams.get("jornadaId")?.trim();

  if (!jornadaId) {
    return NextResponse.json({ mensaje: "Falta jornadaId." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("ubicaciones_tracking_planas")
    .select("lat, lng, timestamp")
    .contains("jornada_ids", [jornadaId])
    .order("timestamp", { ascending: true })
    .returns<Pick<UbicacionTrackingPlanaRow, "lat" | "lng" | "timestamp">[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo obtener la ruta de la jornada.", detalle: error.message },
      { status: 500 }
    );
  }

  const pings: PuntoRuta[] = (data ?? []).map((fila) => ({
    lat: fila.lat,
    lng: fila.lng,
    velocidadKmh: null,
    timestamp: fila.timestamp,
  }));

  const pingsUnicos = quitarPingsDuplicados(pings);
  const lineaRecta: [number, number][] = pingsUnicos.map((p) => [p.lat, p.lng]);
  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    console.error(
      "GEOAPIFY_API_KEY no está configurada — se usa línea recta entre los pings de la jornada",
      jornadaId
    );
    return NextResponse.json({
      trazado: lineaRecta,
      matcheoCompleto: false,
    } satisfies ResultadoTrazado);
  }

  if (pingsUnicos.length < 2) {
    return NextResponse.json({
      trazado: lineaRecta,
      matcheoCompleto: false,
    } satisfies ResultadoTrazado);
  }

  const pingsMuestreados = muestrear(pingsUnicos, MAX_PUNTOS_GEOAPIFY);

  try {
    const trazado = await matchearConGeoapify(pingsMuestreados, apiKey);
    return NextResponse.json({ trazado, matcheoCompleto: true } satisfies ResultadoTrazado);
  } catch (err) {
    console.error(
      `Geoapify no pudo ajustar la ruta de la jornada ${jornadaId}, se usa línea recta:`,
      err
    );
    return NextResponse.json({
      trazado: lineaRecta,
      matcheoCompleto: false,
    } satisfies ResultadoTrazado);
  }
}
