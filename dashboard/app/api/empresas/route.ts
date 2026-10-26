import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { claveNormalizada, normalizarNombreEmpresa } from "@/lib/catalogo";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EmpresaConPendiente, EmpresaRow, EmpresasResponse } from "@/lib/types";

// GET /api/empresas (spec_catalogo_empresas_rutas.md, Hallazgo #48; spec_catalogo_por_chofer.md,
// Etapa 2, decisión D4) — el catálogo completo, sin filtrar por `activo` (el selector/la pantalla
// deciden qué mostrar). Orden: pendientes de revisión primero, después alfabético. Una empresa
// cuenta como "pendiente" si ELLA MISMA lo está O si CUALQUIERA de sus rutas lo está (calculado
// acá, nunca en el cliente) — caso real: una empresa sin pendiente propio puede tener una ruta
// pendiente creada por un chofer.
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const [{ data: empresas, error: errorEmpresas }, { data: rutasPendientes, error: errorRutas }] =
    await Promise.all([
      supabase.from("empresas").select("*").returns<EmpresaRow[]>(),
      supabase.from("rutas").select("empresa_id").eq("pendiente_revision", true),
    ]);

  if (errorEmpresas) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las empresas.", detalle: errorEmpresas.message },
      { status: 500 }
    );
  }
  if (errorRutas) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las rutas pendientes.", detalle: errorRutas.message },
      { status: 500 }
    );
  }

  const empresasConRutaPendiente = new Set((rutasPendientes ?? []).map((r) => r.empresa_id));

  const conPendiente: EmpresaConPendiente[] = (empresas ?? []).map((empresa) => ({
    ...empresa,
    tienePendiente: empresa.pendiente_revision || empresasConRutaPendiente.has(empresa.id),
  }));

  conPendiente.sort((a, b) => {
    if (a.tienePendiente !== b.tienePendiente) return a.tienePendiente ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const respuesta: EmpresasResponse = { data: conPendiente };
  return NextResponse.json(respuesta);
}

// POST /api/empresas — alta manual desde el Dashboard (nunca "pendiente de revisión": eso es solo
// para la que crea el trigger de una jornada, criterio 6). Misma normalización/clave que usa
// obtenerOCrearEmpresa (lib/catalogo.ts) para los selectores de jornadas, para que las dos vías de
// alta no puedan dejar nombres equivalentes como filas distintas.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let cuerpo: { nombre?: unknown };
  try {
    cuerpo = (await request.json()) as { nombre?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (typeof cuerpo.nombre !== "string" || !cuerpo.nombre.trim()) {
    return NextResponse.json({ mensaje: "Falta el nombre de la empresa." }, { status: 400 });
  }

  const nombre = normalizarNombreEmpresa(cuerpo.nombre);
  if (nombre.length < 2 || nombre.length > 60) {
    return NextResponse.json(
      { mensaje: "El nombre debe tener entre 2 y 60 caracteres." },
      { status: 400 }
    );
  }

  const supabase = crearClienteSupabaseAdmin();
  const clave = claveNormalizada(nombre);
  const { data: existente, error: errorExistente } = await supabase
    .from("empresas")
    .select("id")
    .eq("clave_normalizada", clave)
    .maybeSingle();
  if (errorExistente) {
    return NextResponse.json(
      { mensaje: "No se pudo comprobar si la empresa ya existe.", detalle: errorExistente.message },
      { status: 500 }
    );
  }
  if (existente) {
    return NextResponse.json(
      { mensaje: "Ya existe una empresa con un nombre equivalente." },
      { status: 409 }
    );
  }

  const { data: creada, error } = await supabase
    .from("empresas")
    .insert({ nombre })
    .select("*")
    .single<EmpresaRow>();
  if (error || !creada) {
    return NextResponse.json(
      { mensaje: "No se pudo crear la empresa.", detalle: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ empresa: creada });
}
