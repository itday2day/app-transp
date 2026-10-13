import { NextResponse } from "next/server";
import { nombreApellidosChofer } from "@/lib/choferes";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { PosicionChofer, UltimaPosicionRow } from "@/lib/types";

// GET /api/tracking/ultimas-posiciones
//
// Se consulta con la service_role key (bypassa RLS) porque el Dashboard
// necesita ver la posición de TODOS los choferes, no solo la de un usuario
// autenticado como en la app móvil. Pensado para polling (TanStack Query,
// refetchInterval ~8s) desde el cliente — ver decisión de arquitectura en el
// README: no se usa Supabase Realtime aquí.
//
// La vista `ultimas_posiciones` no trae si la jornada tuvo incidencia ni la
// matrícula legible, así que se resuelve en una segunda consulta a
// `jornadas` por los jornada_ids involucrados y se fusiona en memoria — más
// simple que un join en SQL para un volumen de flota pequeño/mediano.
//
// El NOMBRE del chofer (Hallazgo #51, paso 3b, criterio 9) ya NO sale de
// `jornadas.chofer_nombre` (el snapshot congelado, solo nombre sin apellidos) sino de una
// tercera consulta EN VIVO a `choferes` por `chofer_id` -- la vista `ultimas_posiciones` no se
// toca (ni su SQL ni sus permisos), esto es una consulta nueva en el handler, nada más. El mapa
// muestra "Apellidos, Nombre" SIN DNI (decisión D2 de spec_bloque_b_paso_3b_identificador_chofer.md).
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data: posiciones, error: errorPosiciones } = await supabase
    .from("ultimas_posiciones")
    .select("chofer_id, jornada_ids, lat, lng, velocidad_kmh, timestamp")
    .returns<UltimaPosicionRow[]>();

  if (errorPosiciones) {
    return NextResponse.json(
      {
        mensaje: "No se pudieron obtener las últimas posiciones.",
        detalle: errorPosiciones.message,
      },
      { status: 500 }
    );
  }

  const filas = posiciones ?? [];
  const todosLosJornadaIds = Array.from(new Set(filas.flatMap((p) => p.jornada_ids ?? [])));

  const infoJornadaPorId = new Map<
    string,
    {
      empresa: string;
      matricula: string;
      tuvo_incidencia: boolean | null;
      estado: string;
    }
  >();

  if (todosLosJornadaIds.length > 0) {
    const { data: jornadas, error: errorJornadas } = await supabase
      .from("jornadas")
      .select("id, empresa, matricula, tuvo_incidencia, estado")
      .in("id", todosLosJornadaIds);

    if (errorJornadas) {
      return NextResponse.json(
        {
          mensaje: "No se pudieron resolver los datos de las jornadas activas.",
          detalle: errorJornadas.message,
        },
        { status: 500 }
      );
    }

    for (const jornada of jornadas ?? []) {
      infoJornadaPorId.set(jornada.id, jornada);
    }
  }

  // Nombre EN VIVO (Hallazgo #51, paso 3b, criterio 9): una consulta aparte a `choferes` por los
  // chofer_id de esta misma respuesta -- nunca por jornada_ids, un chofer tiene un solo nombre
  // sin importar cuántas jornadas tenga abiertas en paralelo.
  const choferIds = Array.from(new Set(filas.map((p) => p.chofer_id)));
  const nombrePorChoferId = new Map<string, string>();
  if (choferIds.length > 0) {
    const { data: choferesData, error: errorChoferes } = await supabase
      .from("choferes")
      .select("id, nombre, apellidos")
      .in("id", choferIds);

    if (errorChoferes) {
      return NextResponse.json(
        {
          mensaje: "No se pudieron resolver los datos de los choferes.",
          detalle: errorChoferes.message,
        },
        { status: 500 }
      );
    }

    for (const chofer of choferesData ?? []) {
      nombrePorChoferId.set(chofer.id, nombreApellidosChofer(chofer));
    }
  }

  const resultado: PosicionChofer[] = filas.map((posicion) => {
    const jornadasRelacionadas = (posicion.jornada_ids ?? [])
      .map((id) => infoJornadaPorId.get(id))
      .filter((j): j is NonNullable<typeof j> => j != null);

    // Prioriza los datos de una jornada aún abierta para mostrar en el panel;
    // si no hay ninguna abierta (caso raro: el chofer acaba de cerrar), usa
    // la primera que se haya encontrado.
    const jornadaParaMostrar =
      jornadasRelacionadas.find((j) => j.estado === "abierta") ?? jornadasRelacionadas[0] ?? null;

    return {
      choferId: posicion.chofer_id,
      jornadaIds: posicion.jornada_ids ?? [],
      lat: posicion.lat,
      lng: posicion.lng,
      velocidadKmh: posicion.velocidad_kmh,
      timestamp: posicion.timestamp,
      choferNombre: nombrePorChoferId.get(posicion.chofer_id) ?? null,
      empresa: jornadaParaMostrar?.empresa ?? null,
      matricula: jornadaParaMostrar?.matricula ?? null,
      tieneIncidencia: jornadasRelacionadas.some((j) => j.tuvo_incidencia === true),
    };
  });

  return NextResponse.json(resultado);
}
