import { NextResponse } from "next/server";
import { aplicarFiltrosJornadas, MAX_JORNADAS_POR_REPORTE } from "@/lib/jornadas-filtro";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EstadoJornada, ExportarReporteResponse, JornadaRow } from "@/lib/types";

// jornadas no guarda numero_empleado (solo chofer_id, uuid de Supabase Auth) —
// se trae vía el embed de PostgREST sobre la FK jornadas.chofer_id -> choferes.id.
type JornadaRowConChofer = JornadaRow & { choferes: { numero_empleado: string } | null };

interface CuerpoPeticion {
  correo?: unknown;
  rangoInicio?: unknown;
  rangoFin?: unknown;
  empresa?: unknown;
  chofer?: unknown;
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
// Body: { correo, rangoInicio?, rangoFin?, empresa?, chofer?, estado? }
//
// rangoInicio/rangoFin/empresa/chofer/estado son EXACTAMENTE los mismos
// filtros que GET /api/jornadas (la tabla) — mismo nombre de campo salvo
// rangoInicio/rangoFin, que acá equivalen a desde/hasta allá — y los dos
// pasan por aplicarFiltrosJornadas() (lib/jornadas-filtro.ts). Antes este
// endpoint EXIGÍA rangoInicio/rangoFin mientras la tabla los trataba como
// opcionales ("sin fecha filtrada" = todo el tiempo); ese desajuste de
// contrato era la causa real de que un reporte pudiera traer menos
// jornadas de las que mostraba la tabla, sin ningún aviso (Hallazgo #21,
// ver contexto_proyecto.md §4) — el diálogo de exportar sustituía en
// silencio un rango de "últimos 7 días" cuando la tabla no tenía fecha.
//
// Junta las jornadas con la service_role key (bypassa RLS, porque necesita
// jornadas de todos los choferes) y las reenvía al mock server existente,
// que arma el Excel y lo manda por correo. Ese endpoint del mock ya no
// exige token (ver server/mock/index.js).
export async function POST(request: Request) {
  let body: CuerpoPeticion;
  try {
    body = (await request.json()) as CuerpoPeticion;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const { correo, rangoInicio, rangoFin, empresa, chofer, estado } = body;

  if (typeof correo !== "string" || !correo.includes("@")) {
    return NextResponse.json({ mensaje: "Falta un correo de destino válido." }, { status: 400 });
  }
  if (rangoInicio !== undefined) {
    if (typeof rangoInicio !== "string" || !FECHA_ISO_REGEX.test(rangoInicio)) {
      return NextResponse.json(
        { mensaje: "rangoInicio debe tener formato YYYY-MM-DD." },
        { status: 400 }
      );
    }
  }
  if (rangoFin !== undefined) {
    if (typeof rangoFin !== "string" || !FECHA_ISO_REGEX.test(rangoFin)) {
      return NextResponse.json(
        { mensaje: "rangoFin debe tener formato YYYY-MM-DD." },
        { status: 400 }
      );
    }
  }

  const estadoFiltro: EstadoJornada | undefined =
    estado === "abierta" || estado === "cerrada" ? estado : undefined;
  const empresaFiltro = typeof empresa === "string" && empresa.trim() ? empresa.trim() : undefined;
  const choferFiltro = typeof chofer === "string" && chofer.trim() ? chofer.trim() : undefined;
  const rangoInicioFiltro = typeof rangoInicio === "string" ? rangoInicio : undefined;
  const rangoFinFiltro = typeof rangoFin === "string" ? rangoFin : undefined;

  const supabase = crearClienteSupabaseAdmin();

  // { count: "exact" } además de los datos: no es solo para mostrar un
  // número — es lo que permite detectar más abajo si la respuesta vino
  // truncada (ver el chequeo count > filas.length).
  const query = aplicarFiltrosJornadas(
    supabase.from("jornadas").select("*, choferes(numero_empleado)", { count: "exact" }),
    {
      empresa: empresaFiltro,
      chofer: choferFiltro,
      estado: estadoFiltro,
      desde: rangoInicioFiltro,
      hasta: rangoFinFiltro,
    }
  )
    .order("fecha_check_in", { ascending: false })
    .limit(MAX_JORNADAS_POR_REPORTE);

  const { data, count, error } = await query.returns<JornadaRowConChofer[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las jornadas para el reporte.", detalle: error.message },
      { status: 500 }
    );
  }

  const filas = data ?? [];

  // PostgREST tiene su propio tope de filas por respuesta (`db-max-rows`,
  // configurado del lado de Supabase) — independiente de nuestro propio
  // `.limit(MAX_JORNADAS_POR_REPORTE)` de arriba. Si CUALQUIERA de los dos
  // trunca la respuesta (o cualquier otra causa que hoy no existe pero
  // podría existir mañana), `count` — el total real que matchea el
  // filtro — va a ser mayor que `filas.length` — lo que efectivamente
  // llegó. Comparar los dos detecta la truncación sin necesitar saber cuál
  // fue la causa: nunca se manda un reporte más corto de lo que dice ser.
  if (count != null && count > filas.length) {
    return NextResponse.json(
      {
        mensaje: `Hay ${count} jornadas que coinciden con estos filtros, pero solo se pudieron traer ${filas.length} en una sola consulta — el reporte quedaría incompleto. Acortá el rango de fechas o los filtros.`,
      },
      { status: 400 }
    );
  }

  const jornadas = filas.map(filaAJornadaReporte);

  // Un Excel con encabezados y cero filas parece un reporte legítimo de un
  // período sin actividad — mejor decirlo y no generar/enviar nada.
  if (jornadas.length === 0) {
    return NextResponse.json(
      { mensaje: "No hay jornadas que coincidan con estos filtros — no se generó ningún reporte." },
      { status: 400 }
    );
  }

  const mockServerUrl = process.env.MOCK_SERVER_URL ?? "http://localhost:4000";

  // empresa/chofer/estado/rangoInicio/rangoFin (ya validados/normalizados
  // arriba, undefined = sin ese filtro) se reenvían para que el mock server
  // los declare en la hoja de filtros del Excel (Hallazgo #21) — antes solo
  // se mandaban correo/rangoInicio/rangoFin/jornadas, así que el archivo
  // nunca decía con qué chofer/empresa/estado se había generado.
  let respuestaMock: Response;
  try {
    respuestaMock = await fetch(`${mockServerUrl}/reports/export-excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correo,
        rangoInicio: rangoInicioFiltro,
        rangoFin: rangoFinFiltro,
        empresa: empresaFiltro,
        chofer: choferFiltro,
        estado: estadoFiltro,
        jornadas,
      }),
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { mensaje: `No se pudo contactar al servidor de reportes (${mockServerUrl}).`, detalle },
      { status: 502 }
    );
  }

  // Se lee como texto primero (nunca falla) y solo después se intenta
  // parsear como JSON: si el mock server rechaza la petición antes de llegar
  // al handler (ej. 413 de express.json() por payload grande, ver
  // server/mock/index.js), el body es HTML/texto plano o está vacío, y
  // response.json() directo tira su propia excepción sin dejar rastro de qué
  // devolvió realmente el servidor.
  const textoMock = await respuestaMock.text();
  let cuerpoMock: unknown = null;
  try {
    cuerpoMock = textoMock ? JSON.parse(textoMock) : null;
  } catch {
    cuerpoMock = null;
  }

  if (!respuestaMock.ok) {
    console.error(
      `[reportes/exportar] El mock server respondió ${respuestaMock.status} ${respuestaMock.statusText} en ${mockServerUrl}/reports/export-excel. Body:`,
      textoMock || "(vacío)"
    );

    const mensaje =
      cuerpoMock && typeof cuerpoMock === "object" && "mensaje" in cuerpoMock
        ? String((cuerpoMock as { mensaje: unknown }).mensaje)
        : respuestaMock.status === 413
          ? "El reporte es demasiado grande para enviarse (rango de fechas con demasiadas jornadas). Probá acortar el rango."
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
