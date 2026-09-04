import { NextResponse } from "next/server";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EstadoJornada, JornadaRow, JornadasResponse } from "@/lib/types";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

// GET /api/jornadas?empresa=&chofer=&estado=&desde=&hasta=&page=&pageSize=
//
// `desde`/`hasta` son fechas YYYY-MM-DD (inclusive) filtradas sobre
// fecha_check_in. `chofer` hace un ILIKE sobre chofer_nombre (no tenemos
// búsqueda por numero_empleado desde esta tabla sin un join a `choferes`,
// y para la lista de jornadas el nombre alcanza).
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

  let query = supabase
    .from("jornadas")
    .select("*", { count: "exact" })
    .order("fecha_check_in", { ascending: false });

  if (empresa) query = query.ilike("empresa", `%${empresa}%`);
  if (chofer) query = query.ilike("chofer_nombre", `%${chofer}%`);
  if (estado) query = query.eq("estado", estado);
  if (desde) query = query.gte("fecha_check_in", `${desde}T00:00:00`);
  if (hasta) query = query.lte("fecha_check_in", `${hasta}T23:59:59.999`);

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
