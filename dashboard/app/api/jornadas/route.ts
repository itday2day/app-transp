import { NextResponse } from "next/server";
import { aplicarFiltrosJornadas } from "@/lib/jornadas-filtro";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EstadoJornada, JornadaRow, JornadasResponse } from "@/lib/types";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

// GET /api/jornadas?empresa=&chofer=&estado=&desde=&hasta=&page=&pageSize=
//
// `desde`/`hasta` son días de calendario de ESPAÑA (YYYY-MM-DD, inclusive
// en los dos extremos) filtrados sobre fecha_check_in — se convierten a los
// instantes UTC equivalentes acá (ver lib/rango-fechas-espana.ts, Hallazgo
// #17); antes se comparaban como cadena sin zona horaria, que Postgres
// interpretaba en la zona de la sesión (UTC), no en la de España. `chofer`
// hace un ILIKE sobre chofer_nombre (no tenemos búsqueda por
// numero_empleado desde esta tabla sin un join a `choferes`, y para la
// lista de jornadas el nombre alcanza).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const empresa = searchParams.get("empresa")?.trim();
  const chofer = searchParams.get("chofer")?.trim();
  const estadoParam = searchParams.get("estado")?.trim();
  const desde = searchParams.get("desde")?.trim();
  const hasta = searchParams.get("hasta")?.trim();

  const estado: EstadoJornada | null =
    estadoParam === "abierta" || estadoParam === "cerrada" ? estadoParam : null;

  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(
      1,
      Number.parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFAULT), 10) ||
        PAGE_SIZE_DEFAULT
    )
  );

  const supabase = crearClienteSupabaseAdmin();

  // choferes(nombre, apellidos, dni): embed IZQUIERDO (sin !inner) -- una jornada nunca puede
  // desaparecer del listado por este join (Hallazgo #51, paso 3b, criterio 7/2). La FK
  // jornadas.chofer_id -> choferes(id) es NOT NULL, así que en la práctica el embed siempre
  // resuelve; igual se trata como opcional en el tipo y en el componente, nunca se asume.
  //
  // ⚠️ try/catch obligatorio: si el filtro "chofer" falla al resolver ids contra `choferes`
  // (resolverChoferIdsPorTexto, lib/jornadas-filtro.ts), aplicarFiltrosJornadas() propaga el
  // error -- nunca se sigue con la consulta de jornadas usando un filtro parcial en silencio.
  let queryFiltrada;
  try {
    ({ query: queryFiltrada } = await aplicarFiltrosJornadas(
      supabase,
      supabase.from("jornadas").select("*, choferes(nombre, apellidos, dni)", { count: "exact" }),
      { empresa, chofer, estado: estado ?? undefined, desde, hasta }
    ));
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { mensaje: "No se pudieron aplicar los filtros de la búsqueda.", detalle },
      { status: 500 }
    );
  }
  let query = queryFiltrada.order("fecha_check_in", { ascending: false });

  const desdeIndice = (page - 1) * pageSize;
  const hastaIndice = desdeIndice + pageSize - 1;
  query = query.range(desdeIndice, hastaIndice);

  const { data, count, error } = await query.returns<JornadaRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las jornadas.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: JornadasResponse = {
    data: data ?? [],
    count: count ?? 0,
    page,
    pageSize,
  };
  return NextResponse.json(respuesta);
}
