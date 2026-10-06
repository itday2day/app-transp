import { NextResponse } from "next/server";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { RutaRow, RutasResponse } from "@/lib/types";

// GET /api/rutas (spec_catalogo_empresas_rutas.md, Hallazgo #48) — el catálogo completo de TODAS
// las empresas de una sola vez (la tabla es chica, decenas de filas, no miles): el cliente filtra
// por empresa_id en memoria para armar "las rutas de la empresa elegida", mismo criterio que
// obtenerRutasDeEmpresa() en la app móvil, en vez de pedir un GET nuevo cada vez que cambia la
// empresa elegida en el selector.
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("rutas")
    .select("*")
    .order("nombre", { ascending: true })
    .returns<RutaRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las rutas.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: RutasResponse = { data: data ?? [] };
  return NextResponse.json(respuesta);
}
