import { NextResponse } from "next/server";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EstadoJornada, ExportarReporteResponse, JornadaRow } from "@/lib/types";

// jornadas no guarda numero_empleado (solo chofer_id, uuid de Supabase Auth) —
// se trae vía el embed de PostgREST sobre la FK jornadas.chofer_id -> choferes.id.
type JornadaRowConChofer = JornadaRow & { choferes: { numero_empleado: string } | null };

const MAX_JORNADAS_POR_REPORTE = 5000;

interface CuerpoPeticion {
  correo?: unknown;
  rangoInicio?: unknown;
  rangoFin?: unknown;
  empresa?: unknown;
  estado?: unknown;
}

// JornadaReporte, tal como lo espera server/mock/index.js
// (POST /reports/export-excel) y server/mock/reportes.js. Mismo contrato que
// usa la app móvil (ver src/types/index.ts -> JornadaReporte).
interface JornadaReporte {
  choferId: string;
  choferNumeroEmpleado: string;
  choferNombre: string;
  empresa: string;
  fechaCheckIn: string;
  fechaCheckOut: string | null;
  ruta: string;
  matricula: string;
  kmInicial: number;
  kmFinal: number | null;
  combustibleInicial: number;
  combustibleFinal: number | null;
  tuvoIncidencia: boolean | null;
  tipoIncidencia: string | null;
  detalleIncidencia: string | null;
  fotosIncidencia: string[];
  fotoCheckInUrl: string | null;
  fotoRutaUrl: string | null;
  fotoCheckOutUrl: string | null;
  latInicial: number | null;
  lngInicial: number | null;
  latFinal: number | null;
  lngFinal: number | null;
}

function filaAJornadaReporte(fila: JornadaRowConChofer): JornadaReporte {
  return {
    choferId: fila.chofer_id,
    choferNumeroEmpleado: fila.choferes?.numero_empleado ?? fila.chofer_id,
    choferNombre: fila.chofer_nombre,
    empresa: fila.empresa,
    fechaCheckIn: fila.fecha_check_in,
    fechaCheckOut: fila.fecha_check_out,
    ruta: fila.ruta,
    matricula: fila.matricula,
    kmInicial: fila.km_inicial,
    kmFinal: fila.km_final,
    combustibleInicial: fila.combustible_inicial,
    combustibleFinal: fila.combustible_final,
    tuvoIncidencia: fila.tuvo_incidencia,
    tipoIncidencia: fila.tipo_incidencia,
    detalleIncidencia: fila.detalle_incidencia,
    fotosIncidencia: fila.fotos_incidencia ?? [],
    fotoCheckInUrl: fila.foto_tacometro_inicial_url,
    fotoRutaUrl: fila.foto_ruta_url,
    fotoCheckOutUrl: fila.foto_tacometro_final_url,
    latInicial: fila.lat_inicial,
    lngInicial: fila.lng_inicial,
    latFinal: fila.lat_final,
    lngFinal: fila.lng_final,
  };
}

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/reportes/exportar
// Body: { correo, rangoInicio, rangoFin, empresa?, estado? }
//
// Junta las jornadas del rango pedido con la service_role key (bypassa RLS,
// porque necesita jornadas de todos los choferes) y las reenvía al mock
// server existente, que arma el Excel y lo manda por correo. Ese endpoint del
// mock ya no exige token (ver server/mock/index.js).
export async function POST(request: Request) {
  let body: CuerpoPeticion;
  try {
    body = (await request.json()) as CuerpoPeticion;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const { correo, rangoInicio, rangoFin, empresa, estado } = body;

  if (typeof correo !== "string" || !correo.includes("@")) {
    return NextResponse.json({ mensaje: "Falta un correo de destino válido." }, { status: 400 });
  }
  if (typeof rangoInicio !== "string" || !FECHA_ISO_REGEX.test(rangoInicio)) {
    return NextResponse.json(
      { mensaje: "rangoInicio debe tener formato YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (typeof rangoFin !== "string" || !FECHA_ISO_REGEX.test(rangoFin)) {
    return NextResponse.json(
      { mensaje: "rangoFin debe tener formato YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const estadoFiltro: EstadoJornada | undefined =
    estado === "abierta" || estado === "cerrada" ? estado : undefined;
  const empresaFiltro = typeof empresa === "string" && empresa.trim() ? empresa.trim() : undefined;

  const supabase = crearClienteSupabaseAdmin();

  let query = supabase
    .from("jornadas")
    .select("*, choferes(numero_empleado)")
    .gte("fecha_check_in", `${rangoInicio}T00:00:00`)
    .lte("fecha_check_in", `${rangoFin}T23:59:59.999`)
    .order("fecha_check_in", { ascending: false })
    .limit(MAX_JORNADAS_POR_REPORTE);

  if (empresaFiltro) query = query.ilike("empresa", `%${empresaFiltro}%`);
  if (estadoFiltro) query = query.eq("estado", estadoFiltro);

  const { data, error } = await query.returns<JornadaRowConChofer[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las jornadas para el reporte.", detalle: error.message },
      { status: 500 }
    );
  }

  const jornadas = (data ?? []).map(filaAJornadaReporte);

  const mockServerUrl = process.env.MOCK_SERVER_URL ?? "http://localhost:4000";

  let respuestaMock: Response;
  try {
    respuestaMock = await fetch(`${mockServerUrl}/reports/export-excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo, rangoInicio, rangoFin, jornadas }),
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { mensaje: `No se pudo contactar al servidor de reportes (${mockServerUrl}).`, detalle },
      { status: 502 }
    );
  }

  const cuerpoMock: unknown = await respuestaMock.json().catch(() => null);

  if (!respuestaMock.ok) {
    const mensaje =
      cuerpoMock && typeof cuerpoMock === "object" && "mensaje" in cuerpoMock
        ? String((cuerpoMock as { mensaje: unknown }).mensaje)
        : "El servidor de reportes rechazó la solicitud.";
    return NextResponse.json({ mensaje }, { status: respuestaMock.status });
  }

  const resultado: ExportarReporteResponse = {
    mensaje:
      cuerpoMock && typeof cuerpoMock === "object" && "mensaje" in cuerpoMock
        ? String((cuerpoMock as { mensaje: unknown }).mensaje)
        : `Reporte generado con ${jornadas.length} jornada(s).`,
    previewUrl:
      cuerpoMock && typeof cuerpoMock === "object" && "previewUrl" in cuerpoMock
        ? String((cuerpoMock as { previewUrl: unknown }).previewUrl)
        : undefined,
  };

  return NextResponse.json(resultado);
}
