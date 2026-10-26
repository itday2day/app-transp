import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { RutaRow } from "@/lib/types";

// POST /api/rutas/revisar — "Marcar como revisada", mismo patrón que /api/empresas/revisar.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: { id?: unknown };
  try {
    cuerpo = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.id)) {
    return NextResponse.json({ mensaje: "Falta el id de la ruta." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  const { data, error } = await supabase
    .from("rutas")
    .update({ pendiente_revision: false })
    .eq("id", cuerpo.id)
    .select("*")
    .maybeSingle<RutaRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo marcar la ruta como revisada.", detalle: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ mensaje: "La ruta no existe." }, { status: 404 });
  }

  return NextResponse.json({ ruta: data });
}
