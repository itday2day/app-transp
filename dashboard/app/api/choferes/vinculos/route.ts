import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import {
  aplicarDiferenciasVinculosChofer,
  obtenerVinculosChofer,
  VinculoInvalidoError,
} from "@/lib/vinculos";
import type { CuerpoSinValidar, VinculosChoferRequest } from "@/lib/types";

// GET /api/choferes/vinculos?choferId=... — snapshot de empresas/rutas vinculadas (spec_catalogo_
// por_chofer.md, Etapa 2): lo que carga el diálogo del chofer al abrirse en modo Ver/Editar.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  const choferId = request.nextUrl.searchParams.get("choferId");
  if (!esUuid(choferId)) {
    return NextResponse.json({ mensaje: "Falta el choferId." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  try {
    const vinculos = await obtenerVinculosChofer(supabase, choferId);
    return NextResponse.json(vinculos);
  } catch (error) {
    return NextResponse.json(
      {
        mensaje: "No se pudieron obtener los vínculos del chofer.",
        detalle: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// POST /api/choferes/vinculos — decisión D2: el cuerpo son DIFERENCIAS contra el snapshot que el
// cliente cargó, nunca "el conjunto completo" (ver aplicarDiferenciasVinculosChofer, lib/vinculos.ts,
// para el motivo exacto: no borrar un vínculo origen='chofer' creado por el trigger mientras el
// admin tenía el diálogo abierto). Usada desde el diálogo del chofer Y desde la pantalla de detalle
// de empresa (un llamado por chofer que se marca/desmarca ahí).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoSinValidar<VinculosChoferRequest>;
  try {
    cuerpo = (await request.json()) as CuerpoSinValidar<VinculosChoferRequest>;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.choferId)) {
    return NextResponse.json({ mensaje: "Falta el choferId." }, { status: 400 });
  }
  const choferId = cuerpo.choferId;

  const supabase = crearClienteSupabaseAdmin();
  try {
    await aplicarDiferenciasVinculosChofer(supabase, choferId, {
      empresasAgregar: cuerpo.empresasAgregar as string[] | undefined,
      empresasQuitar: cuerpo.empresasQuitar as string[] | undefined,
      rutasAgregar: cuerpo.rutasAgregar as string[] | undefined,
      rutasQuitar: cuerpo.rutasQuitar as string[] | undefined,
    });
    const vinculos = await obtenerVinculosChofer(supabase, choferId);
    return NextResponse.json(vinculos);
  } catch (error) {
    if (error instanceof VinculoInvalidoError) {
      return NextResponse.json({ mensaje: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { mensaje: "No se pudieron guardar los vínculos.", detalle: (error as Error).message },
      { status: 500 }
    );
  }
}
