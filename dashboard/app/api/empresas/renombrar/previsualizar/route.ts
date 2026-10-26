import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { ColisionRenombrarError, previsualizarRenombrarEmpresa } from "@/lib/catalogo-gestion";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";

// POST /api/empresas/renombrar/previsualizar — decisión D5: número previsto de jornadas antes de
// confirmar, con la nota de "coincidencia exacta" siempre presente. 409 si el nombre nuevo
// colisiona (misma clave normalizada que otra empresa ya existente) -- "usa Fusionar" en vez de
// dejar avanzar hacia un renombrar que de todos modos fallaría.
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
  try {
    const previa = await previsualizarRenombrarEmpresa(supabase, cuerpo.id, cuerpo.nombreNuevo);
    return NextResponse.json(previa);
  } catch (error) {
    if (error instanceof ColisionRenombrarError) {
      return NextResponse.json({ mensaje: error.message }, { status: 409 });
    }
    return NextResponse.json({ mensaje: (error as Error).message }, { status: 500 });
  }
}
