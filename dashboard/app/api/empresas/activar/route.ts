import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { ActivarRequest, CuerpoSinValidar, EmpresaRow } from "@/lib/types";

// POST /api/empresas/activar — spec_catalogo_por_chofer.md (Etapa 2, decisión D3): desactivar NO
// toca los vínculos chofer_empresas/chofer_rutas existentes (la base no tiene ningún trigger que
// los borre al poner activo=false), y reactivar no pierde nada por el mismo motivo -- este
// endpoint es solo el UPDATE de la columna.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoSinValidar<ActivarRequest>;
  try {
    cuerpo = (await request.json()) as CuerpoSinValidar<ActivarRequest>;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.id) || typeof cuerpo.activo !== "boolean") {
    return NextResponse.json({ mensaje: "Faltan el id o el estado activo." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  const { data, error } = await supabase
    .from("empresas")
    .update({ activo: cuerpo.activo })
    .eq("id", cuerpo.id)
    .select("*")
    .maybeSingle<EmpresaRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo cambiar el estado de la empresa.", detalle: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ mensaje: "La empresa no existe." }, { status: 404 });
  }

  return NextResponse.json({ empresa: data });
}
