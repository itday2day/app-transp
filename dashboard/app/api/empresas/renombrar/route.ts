import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { ColisionRenombrarError, verificarColisionRenombrarEmpresa } from "@/lib/catalogo-gestion";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { CuerpoSinValidar, RenombrarRequest, RenombrarResponse } from "@/lib/types";

// POST /api/empresas/renombrar — envuelve la RPC renombrar_empresa() (solo service_role, ver
// schema_v26_catalogo_por_chofer.sql). Revalida la colisión de nombre ANTES de llamar a la base
// (defensa en profundidad: la vista previa ya la comprobó, pero pudo pasar tiempo entre la vista
// previa y confirmar) para devolver 409 con el mensaje claro en vez del 23505 crudo de la función.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoSinValidar<RenombrarRequest>;
  try {
    cuerpo = (await request.json()) as CuerpoSinValidar<RenombrarRequest>;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.id) || typeof cuerpo.nombreNuevo !== "string" || !cuerpo.nombreNuevo.trim()) {
    return NextResponse.json({ mensaje: "Faltan el id o el nombre nuevo." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  try {
    await verificarColisionRenombrarEmpresa(supabase, cuerpo.id, cuerpo.nombreNuevo);
  } catch (error) {
    if (error instanceof ColisionRenombrarError) {
      return NextResponse.json({ mensaje: error.message }, { status: 409 });
    }
    return NextResponse.json({ mensaje: (error as Error).message }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("renombrar_empresa", {
    p_empresa_id: cuerpo.id,
    p_nombre_nuevo: cuerpo.nombreNuevo,
  });

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo renombrar la empresa.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: RenombrarResponse = { jornadasActualizadas: data ?? 0 };
  return NextResponse.json(respuesta);
}
