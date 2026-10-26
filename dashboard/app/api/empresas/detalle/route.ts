import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type {
  ChoferParaAsignacion,
  EmpresaDetalleResponse,
  EmpresaRow,
  RutaConChoferes,
  RutaRow,
} from "@/lib/types";

// GET /api/empresas/detalle?id=... — la empresa, sus rutas (cada una con los ids de los choferes
// vinculados) y la lista de TODOS los choferes (para armar las casillas de "asignar"), que la
// pantalla de detalle de empresa necesita (spec_catalogo_por_chofer.md, Etapa 2, criterio 13).
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!esUuid(id)) {
    return NextResponse.json({ mensaje: "Falta el id de la empresa." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const [
    { data: empresa, error: errorEmpresa },
    { data: rutas, error: errorRutas },
    { data: vinculosEmpresa, error: errorVinculosEmpresa },
    { data: vinculosRutas, error: errorVinculosRutas },
    { data: choferes, error: errorChoferes },
    { data: rutasPendientes, error: errorRutasPendientes },
  ] = await Promise.all([
    supabase.from("empresas").select("*").eq("id", id).maybeSingle<EmpresaRow>(),
    supabase.from("rutas").select("*").eq("empresa_id", id).order("nombre").returns<RutaRow[]>(),
    supabase.from("chofer_empresas").select("chofer_id").eq("empresa_id", id),
    supabase.from("chofer_rutas").select("chofer_id, ruta_id").eq("empresa_id", id),
    supabase.from("choferes").select("id, nombre, apellidos, activo").order("nombre"),
    supabase.from("rutas").select("empresa_id").eq("pendiente_revision", true),
  ]);

  const error =
    errorEmpresa ||
    errorRutas ||
    errorVinculosEmpresa ||
    errorVinculosRutas ||
    errorChoferes ||
    errorRutasPendientes;
  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo obtener el detalle de la empresa.", detalle: error.message },
      { status: 500 }
    );
  }
  if (!empresa) {
    return NextResponse.json({ mensaje: "La empresa no existe." }, { status: 404 });
  }

  const choferesPorRuta = new Map<string, string[]>();
  for (const vinculo of vinculosRutas ?? []) {
    const lista = choferesPorRuta.get(vinculo.ruta_id) ?? [];
    lista.push(vinculo.chofer_id);
    choferesPorRuta.set(vinculo.ruta_id, lista);
  }

  const rutasConChoferes: RutaConChoferes[] = (rutas ?? []).map((ruta) => ({
    ...ruta,
    choferesVinculados: choferesPorRuta.get(ruta.id) ?? [],
  }));

  const empresasConRutaPendiente = new Set((rutasPendientes ?? []).map((r) => r.empresa_id));

  const respuesta: EmpresaDetalleResponse = {
    empresa: {
      ...empresa,
      tienePendiente: empresa.pendiente_revision || empresasConRutaPendiente.has(empresa.id),
    },
    rutas: rutasConChoferes,
    choferesVinculados: (vinculosEmpresa ?? []).map((v) => v.chofer_id),
    todosLosChoferes: (choferes ?? []) as ChoferParaAsignacion[],
  };

  return NextResponse.json(respuesta);
}
