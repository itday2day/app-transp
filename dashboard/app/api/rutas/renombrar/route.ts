import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { ColisionRenombrarError, verificarColisionRenombrarRuta } from "@/lib/catalogo-gestion";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { RenombrarResponse } from "@/lib/types";

// POST /api/rutas/renombrar — envuelve la RPC renombrar_ruta() (solo service_role). Revalida la
// colisión de nombre ANTES de llamar a la base, mismo criterio que /api/empresas/renombrar
// (defensa en profundidad: pudo pasar tiempo entre la vista previa y confirmar).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: { id?: unknown; nombreNuevo?: unknown };
  try {
    cuerpo = (await request.json()) as { id?: unknown; nombreNuevo?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.id) || typeof cuerpo.nombreNuevo !== "string" || !cuerpo.nombreNuevo.trim()) {
    return NextResponse.json({ mensaje: "Faltan el id o el nombre nuevo." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data: ruta, error: errorRuta } = await supabase
    .from("rutas")
    .select("empresa_id")
    .eq("id", cuerpo.id)
    .maybeSingle();
  if (errorRuta) {
    return NextResponse.json(
      { mensaje: "No se pudo leer la ruta.", detalle: errorRuta.message },
      { status: 500 }
    );
  }
  if (!ruta) {
    return NextResponse.json({ mensaje: "La ruta no existe." }, { status: 404 });
  }

  try {
    await verificarColisionRenombrarRuta(supabase, cuerpo.id, ruta.empresa_id, cuerpo.nombreNuevo);
  } catch (error) {
    if (error instanceof ColisionRenombrarError) {
      return NextResponse.json({ mensaje: error.message }, { status: 409 });
    }
    return NextResponse.json({ mensaje: (error as Error).message }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("renombrar_ruta", {
    p_ruta_id: cuerpo.id,
    p_nombre_nuevo: cuerpo.nombreNuevo,
  });

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo renombrar la ruta.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: RenombrarResponse = { jornadasActualizadas: data ?? 0 };
  return NextResponse.json(respuesta);
}
