import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import {
  calcularEstadoInvitacion,
  COLUMNAS_LISTADO_INVITACIONES,
  enriquecerInvitacionListado,
} from "@/lib/invitaciones";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type {
  EmpresaRow,
  InvitacionListadoRow,
  RevocarInvitacionResponse,
  RutaRow,
} from "@/lib/types";

// POST /api/invitaciones/revocar — criterio 20 y criterio 2 (mismo principio de la invitación en
// sí, aplicado acá): "solo se puede revocar una pendiente" se hace con un UPDATE condicional de
// un solo paso, nunca "leer el estado y después escribir" -- dos admins (o un admin revocando
// justo cuando el chofer está terminando de registrarse) no deben poder pisarse: si el UPDATE no
// afecta ninguna fila, perdió la carrera (o ya no es pendiente por otro motivo), y se lee DESPUÉS
// solo para poder decir en el mensaje de error cuál es el estado real -- esa lectura posterior no
// decide nada, es puramente informativa.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(body.id)) {
    return NextResponse.json({ mensaje: "Falta el id de la invitación." }, { status: 400 });
  }
  const id = body.id;

  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("invitaciones")
    .update({
      revocada_at: new Date().toISOString(),
      // Borrado de datos personales al revocarse (criterio 29, ajuste del Hallazgo #51,
      // 2026-10-14) -- mismo UPDATE atómico que ya marca revocada_at, no una escritura aparte.
      dni: null,
      nombre: null,
      apellidos: null,
      telefono: null,
      email: null,
      fecha_nacimiento: null,
    })
    .eq("id", id)
    .is("usada_at", null)
    .is("revocada_at", null)
    .gt("vence_at", new Date().toISOString())
    // Columnas explícitas (criterio 34, igual que COLUMNAS_LISTADO_INVITACIONES del GET) -- en
    // la práctica dni/telefono/email/fecha_nacimiento ya quedan en null por el UPDATE de arriba,
    // pero antes el "*" los seguía pidiendo y las claves llegaban igual al JSON (en null): acá ni
    // se piden.
    .select(COLUMNAS_LISTADO_INVITACIONES)
    .maybeSingle<InvitacionListadoRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo revocar la invitación.", detalle: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    // El UPDATE no afectó ninguna fila -- o no existe, o ya no es "pendiente". Esta lectura es
    // solo para el mensaje, no para decidir nada (la decisión ya la tomó el UPDATE de arriba).
    const { data: filaActual } = await supabase
      .from("invitaciones")
      .select(COLUMNAS_LISTADO_INVITACIONES)
      .eq("id", id)
      .maybeSingle<InvitacionListadoRow>();
    if (!filaActual) {
      return NextResponse.json({ mensaje: "No se encontró la invitación." }, { status: 404 });
    }
    const estadoActual = calcularEstadoInvitacion(filaActual);
    return NextResponse.json(
      {
        mensaje: `Esta invitación ya está "${estadoActual}" — solo se puede revocar una pendiente.`,
      },
      { status: 409 }
    );
  }

  const [{ data: empresas }, { data: rutas }] = await Promise.all([
    supabase.from("empresas").select("id, nombre, activo, created_at").returns<EmpresaRow[]>(),
    supabase
      .from("rutas")
      .select("id, empresa_id, nombre, activo, created_at")
      .returns<RutaRow[]>(),
  ]);
  const empresaPorId = new Map((empresas ?? []).map((e) => [e.id, e.nombre]));
  const rutaPorId = new Map((rutas ?? []).map((r) => [r.id, r.nombre]));

  const respuesta: RevocarInvitacionResponse = {
    mensaje: "Invitación revocada.",
    invitacion: enriquecerInvitacionListado(data, empresaPorId, rutaPorId),
  };
  return NextResponse.json(respuesta);
}
