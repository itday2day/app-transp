import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { FusionInvalidaError, validarFusionEmpresas } from "@/lib/catalogo-gestion";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { FusionarResponse } from "@/lib/types";

// POST /api/empresas/fusionar — envuelve la RPC fusionar_empresas() (solo service_role). Revalida
// origen≠destino y que el destino exista y esté ACTIVO ANTES de llamar a la RPC (corrección C3):
// la función SQL real no comprueba por sí sola que el destino esté activo, y la vista previa pudo
// correr hace rato -- el origen SÍ puede estar de baja, nunca se valida eso.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: { origenId?: unknown; destinoId?: unknown };
  try {
    cuerpo = (await request.json()) as { origenId?: unknown; destinoId?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.origenId) || !esUuid(cuerpo.destinoId)) {
    return NextResponse.json({ mensaje: "Faltan el origen o el destino." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  try {
    await validarFusionEmpresas(supabase, cuerpo.origenId, cuerpo.destinoId);
  } catch (error) {
    if (error instanceof FusionInvalidaError) {
      return NextResponse.json({ mensaje: error.message }, { status: error.status });
    }
    return NextResponse.json({ mensaje: (error as Error).message }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("fusionar_empresas", {
    p_origen_id: cuerpo.origenId,
    p_destino_id: cuerpo.destinoId,
  });

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo fusionar las empresas.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: FusionarResponse = { jornadasActualizadas: data ?? 0 };
  return NextResponse.json(respuesta);
}
