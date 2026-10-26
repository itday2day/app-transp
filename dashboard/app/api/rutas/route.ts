import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { claveNormalizada, normalizarNombreRuta } from "@/lib/catalogo";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { CrearRutaRequest, CuerpoSinValidar, RutaRow, RutasResponse } from "@/lib/types";

// GET /api/rutas (spec_catalogo_empresas_rutas.md, Hallazgo #48) — el catálogo completo de TODAS
// las empresas de una sola vez (la tabla es chica): el cliente filtra por empresa_id en memoria.
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("rutas")
    .select("*")
    .order("nombre", { ascending: true })
    .returns<RutaRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las rutas.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: RutasResponse = { data: data ?? [] };
  return NextResponse.json(respuesta);
}

// POST /api/rutas — alta manual desde el detalle de una empresa (spec_catalogo_por_chofer.md,
// Etapa 2, decisión D3): NO se puede crear una ruta nueva bajo una empresa inactiva, validado acá
// en el servidor (no solo ocultado en la UI).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: CuerpoSinValidar<CrearRutaRequest>;
  try {
    cuerpo = (await request.json()) as CuerpoSinValidar<CrearRutaRequest>;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(cuerpo.empresaId) || typeof cuerpo.nombre !== "string" || !cuerpo.nombre.trim()) {
    return NextResponse.json(
      { mensaje: "Faltan la empresa o el nombre de la ruta." },
      { status: 400 }
    );
  }

  const nombre = normalizarNombreRuta(cuerpo.nombre);
  if (nombre.length < 2 || nombre.length > 60) {
    return NextResponse.json(
      { mensaje: "El nombre debe tener entre 2 y 60 caracteres." },
      { status: 400 }
    );
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data: empresa, error: errorEmpresa } = await supabase
    .from("empresas")
    .select("id, activo")
    .eq("id", cuerpo.empresaId)
    .maybeSingle();
  if (errorEmpresa) {
    return NextResponse.json(
      { mensaje: "No se pudo comprobar la empresa.", detalle: errorEmpresa.message },
      { status: 500 }
    );
  }
  if (!empresa) {
    return NextResponse.json({ mensaje: "La empresa no existe." }, { status: 404 });
  }
  if (!empresa.activo) {
    return NextResponse.json(
      { mensaje: "No se pueden crear rutas nuevas bajo una empresa de baja." },
      { status: 400 }
    );
  }

  const clave = claveNormalizada(nombre);
  const { data: existente, error: errorExistente } = await supabase
    .from("rutas")
    .select("id")
    .eq("empresa_id", cuerpo.empresaId)
    .eq("clave_normalizada", clave)
    .maybeSingle();
  if (errorExistente) {
    return NextResponse.json(
      { mensaje: "No se pudo comprobar si la ruta ya existe.", detalle: errorExistente.message },
      { status: 500 }
    );
  }
  if (existente) {
    return NextResponse.json(
      { mensaje: "Ya existe una ruta con un nombre equivalente en esta empresa." },
      { status: 409 }
    );
  }

  const { data: creada, error } = await supabase
    .from("rutas")
    .insert({ empresa_id: cuerpo.empresaId, nombre })
    .select("*")
    .single<RutaRow>();
  if (error || !creada) {
    return NextResponse.json(
      { mensaje: "No se pudo crear la ruta.", detalle: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ruta: creada });
}
