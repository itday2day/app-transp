import { NextResponse } from "next/server";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { PuntoRuta, RutaJornadaResponse, UbicacionTrackingPlanaRow } from "@/lib/types";

// GET /api/tracking/ruta-jornada?jornadaId=<uuid>
//
// Trae todos los pings de GPS de una jornada, ordenados por tiempo ascendente
// — es el insumo crudo para trazar la ruta histórica en el mapa (ver
// components/mapa/ruta-historica.tsx, que le pasa estos puntos a OSRM del
// lado del cliente para ajustarlos a las calles).
//
// `jornada_ids` es un arreglo (un ping puede pertenecer a varias jornadas
// concurrentes del mismo chofer — ver §3 de contexto_proyecto.md), así que el
// filtro es "contains", no una igualdad simple.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jornadaId = searchParams.get("jornadaId")?.trim();

  if (!jornadaId) {
    return NextResponse.json({ mensaje: "Falta jornadaId." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("ubicaciones_tracking_planas")
    .select("lat, lng, velocidad_kmh, timestamp")
    .contains("jornada_ids", [jornadaId])
    .order("timestamp", { ascending: true })
    .returns<UbicacionTrackingPlanaRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo obtener la ruta de la jornada.", detalle: error.message },
      { status: 500 }
    );
  }

  const puntos: PuntoRuta[] = (data ?? []).map((fila) => ({
    lat: fila.lat,
    lng: fila.lng,
    velocidadKmh: fila.velocidad_kmh,
    timestamp: fila.timestamp,
  }));

  return NextResponse.json({ puntos } satisfies RutaJornadaResponse);
}
