import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { CamposEditablesJornada, JornadaRow } from "@/lib/types";

// POST /api/jornadas/editar
// Body: { id, motivoEdicion, empresa?, matricula?, ruta?, kmInicial?,
//         kmFinal?, combustibleInicial?, combustibleFinal? }
//
// La autenticación de administrador ya la exige `proxy.ts` (middleware) para
// todo /api/* salvo /api/auth/* — igual que el resto de los Route Handlers
// de este Dashboard (ver reportes/exportar, tracking/ultimas-posiciones), no
// se repite ese chequeo acá. Lo que sí se lee acá es la identidad del admin
// ya autenticado (`editado_por` se deriva de la sesión, ver lib/auth.ts —
// desde que existe la tabla `admins`, ya no es un campo de texto libre que
// escribe quien edita).

interface CuerpoPeticion {
  id?: unknown;
  motivoEdicion?: unknown;
  empresa?: unknown;
  matricula?: unknown;
  ruta?: unknown;
  kmInicial?: unknown;
  kmFinal?: unknown;
  combustibleInicial?: unknown;
  combustibleFinal?: unknown;
}

function stringNoVacio(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function numeroValido(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }
  const editadoPor = sesion.nombre || sesion.email;

  let body: CuerpoPeticion;
  try {
    body = (await request.json()) as CuerpoPeticion;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const id = stringNoVacio(body.id);
  const motivoEdicion = stringNoVacio(body.motivoEdicion);

  if (!id) {
    return NextResponse.json({ mensaje: "Falta el id de la jornada." }, { status: 400 });
  }
  if (!motivoEdicion) {
    return NextResponse.json(
      { mensaje: "El motivo de la corrección es obligatorio." },
      { status: 400 }
    );
  }

  const campos: CamposEditablesJornada = {
    empresa: stringNoVacio(body.empresa),
    matricula: stringNoVacio(body.matricula),
    ruta: stringNoVacio(body.ruta),
    kmInicial: numeroValido(body.kmInicial),
    kmFinal: numeroValido(body.kmFinal),
    combustibleInicial: numeroValido(body.combustibleInicial),
    combustibleFinal: numeroValido(body.combustibleFinal),
  };

  const actualizacion: Record<string, unknown> = {
    fue_editado: true,
    editado_por: editadoPor,
    editado_en: new Date().toISOString(),
    motivo_edicion: motivoEdicion,
  };
  if (campos.empresa !== undefined) actualizacion.empresa = campos.empresa;
  if (campos.matricula !== undefined) actualizacion.matricula = campos.matricula;
  if (campos.ruta !== undefined) actualizacion.ruta = campos.ruta;
  if (campos.kmInicial !== undefined) actualizacion.km_inicial = campos.kmInicial;
  if (campos.kmFinal !== undefined) actualizacion.km_final = campos.kmFinal;
  if (campos.combustibleInicial !== undefined)
    actualizacion.combustible_inicial = campos.combustibleInicial;
  if (campos.combustibleFinal !== undefined)
    actualizacion.combustible_final = campos.combustibleFinal;

  const huboCambioDeContenido = Object.keys(actualizacion).length > 4; // más que los 4 de auditoría
  if (!huboCambioDeContenido) {
    return NextResponse.json({ mensaje: "No hay ningún campo para corregir." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("jornadas")
    .update(actualizacion)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo guardar la corrección.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    mensaje: "Jornada corregida correctamente.",
    jornada: data as JornadaRow,
  });
}
