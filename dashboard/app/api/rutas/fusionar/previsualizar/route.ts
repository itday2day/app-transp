import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { FusionInvalidaError, previsualizarFusionarRutas } from "@/lib/catalogo-gestion";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { CuerpoSinValidar, FusionarRequest } from "@/lib/types";

// POST /api/rutas/fusionar/previsualizar — choferes vinculados y jornadas afectadas (D5), mismo
// criterio de texto exacto que fusionar_rutas() real.
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
  if (cuerpo.origenId === cuerpo.destinoId) {
    return NextResponse.json(
      { mensaje: "Origen y destino no pueden ser la misma ruta." },
      { status: 400 }
    );
  }

  const supabase = crearClienteSupabaseAdmin();
  try {
    const previa = await previsualizarFusionarRutas(supabase, cuerpo.origenId, cuerpo.destinoId);
    return NextResponse.json(previa);
  } catch (error) {
    if (error instanceof FusionInvalidaError) {
      return NextResponse.json({ mensaje: error.message }, { status: error.status });
    }
    return NextResponse.json({ mensaje: (error as Error).message }, { status: 500 });
  }
}
