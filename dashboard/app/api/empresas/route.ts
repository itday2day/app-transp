import { NextResponse } from "next/server";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EmpresaRow, EmpresasResponse } from "@/lib/types";

// GET /api/empresas (spec_catalogo_empresas_rutas.md, Hallazgo #48) — el catálogo completo, sin
// filtrar por `activo`: el selector del Dashboard decide qué mostrar, mismo criterio que
// /api/choferes (incluye los de baja, la pantalla no los oculta).
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("empresas")
    .select("*")
    .order("nombre", { ascending: true })
    .returns<EmpresaRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las empresas.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: EmpresasResponse = { data: data ?? [] };
  return NextResponse.json(respuesta);
}
