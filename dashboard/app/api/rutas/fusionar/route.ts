import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { FusionInvalidaError, validarFusionRutas } from "@/lib/catalogo-gestion";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { CuerpoSinValidar, FusionarRequest, FusionarResponse } from "@/lib/types";

// POST /api/rutas/fusionar — envuelve la RPC fusionar_rutas() (solo service_role; exige que las
// dos rutas sean de la misma empresa, la función lo valida). Revalida origen≠destino y que el
// destino exista y esté ACTIVO ANTES de la RPC (corrección C3) -- el origen SÍ puede estar de
// baja.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoSinValidar<FusionarRequest>;
  try {
    cuerpo = (await request.json()) as CuerpoSinValidar<FusionarRequest>;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.origenId) || !esUuid(cuerpo.destinoId)) {
    return NextResponse.json({ mensaje: "Faltan el origen o el destino." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  try {
    await validarFusionRutas(supabase, cuerpo.origenId, cuerpo.destinoId);
  } catch (error) {
    if (error instanceof FusionInvalidaError) {
      return NextResponse.json({ mensaje: error.message }, { status: error.status });
    }
    return NextResponse.json({ mensaje: (error as Error).message }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("fusionar_rutas", {
    p_origen_id: cuerpo.origenId,
    p_destino_id: cuerpo.destinoId,
  });

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo fusionar las rutas.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: FusionarResponse = { jornadasActualizadas: data ?? 0 };
  return NextResponse.json(respuesta);
}
