import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { CuerpoSinValidar, EmpresaRow, RevisarRequest } from "@/lib/types";

// POST /api/empresas/revisar — "Marcar como revisada" (decisión D4): mismo patrón que
// /api/choferes/revisar (UPDATE condicionado, nunca el cliente contra Supabase directo). Solo
// quita la insignia "Pendiente de revisión" que puso el trigger -- no reactiva ni cambia nada más.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoSinValidar<RevisarRequest>;
  try {
    cuerpo = (await request.json()) as CuerpoSinValidar<RevisarRequest>;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.id)) {
    return NextResponse.json({ mensaje: "Falta el id de la empresa." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  const { data, error } = await supabase
    .from("empresas")
    .update({ pendiente_revision: false })
    .eq("id", cuerpo.id)
    .select("*")
    .maybeSingle<EmpresaRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo marcar la empresa como revisada.", detalle: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ mensaje: "La empresa no existe." }, { status: 404 });
  }

  return NextResponse.json({ empresa: data });
}
