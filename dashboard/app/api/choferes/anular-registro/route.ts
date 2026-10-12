import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { AnularRegistroResponse, ChoferRow } from "@/lib/types";

// POST /api/choferes/anular-registro — criterio 20: "el chofer se registró (consumió la
// invitación, existe su fila) pero nunca confirmó el correo (typo, no le llegó, se arrepintió)".
// Libera su DNI y su correo borrando el usuario de Auth -- la fila de `choferes` desaparece sola
// por el ON DELETE CASCADE de choferes.id -> auth.users.id (confirmado en Fase 1/paso 2, no
// supuesto). Dos condiciones, re-chequeadas acá aunque la pantalla ya las haya filtrado antes de
// ofrecer el botón: nunca confiar en lo que mandó el cliente para un borrado.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }
  const administrador = sesion.nombre || sesion.email;

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  if (!esUuid(body.id)) {
    return NextResponse.json({ mensaje: "Falta el id del chofer." }, { status: 400 });
  }
  const id = body.id;

  const supabase = crearClienteSupabaseAdmin();

  // Se lee la fila de `choferes` primero (y es la que decide el 404): es la entidad que la
  // pantalla le muestra al admin y la que da DNI/apellidos para el log de abajo. auth.users es
  // un sistema aparte -- si por lo que sea no estuviera (no debería pasar, choferes.id ->
  // auth.users.id es FK), eso es un 500 real, no "no se encontró ese usuario".
  const { data: chofer, error: errorChofer } = await supabase
    .from("choferes")
    .select("*")
    .eq("id", id)
    .maybeSingle<ChoferRow>();
  if (errorChofer) {
    return NextResponse.json(
      { mensaje: "No se pudo leer el chofer.", detalle: errorChofer.message },
      { status: 500 }
    );
  }
  if (!chofer) {
    return NextResponse.json({ mensaje: "No se encontró el chofer." }, { status: 404 });
  }

  const { data: usuario, error: errorUsuario } = await supabase.auth.admin.getUserById(id);
  if (errorUsuario || !usuario?.user) {
    return NextResponse.json(
      { mensaje: "No se pudo leer el usuario de autenticación de este chofer." },
      { status: 500 }
    );
  }
  if (usuario.user.email_confirmed_at) {
    return NextResponse.json(
      { mensaje: "Este chofer ya confirmó su correo — no se puede anular el registro." },
      { status: 409 }
    );
  }

  // Las dos, no solo jornadas: choferes.id -> auth.users.id es ON DELETE CASCADE, y tanto
  // jornadas.chofer_id como ubicaciones_tracking.chofer_id son CASCADE hacia choferes (medido
  // contra pg_constraint, no supuesto) -- borrar el usuario de Auth se llevaría puesto cualquier
  // fila de las dos tablas, no solo la de jornadas.
  const [
    { count: countJornadas, error: errorJornadas },
    { count: countTracking, error: errorTracking },
  ] = await Promise.all([
    supabase.from("jornadas").select("id", { count: "exact", head: true }).eq("chofer_id", id),
    supabase
      .from("ubicaciones_tracking")
      .select("id", { count: "exact", head: true })
      .eq("chofer_id", id),
  ]);
  if (errorJornadas || errorTracking) {
    return NextResponse.json(
      {
        mensaje: "No se pudo comprobar si el chofer tiene jornadas o tracking.",
        detalle: errorJornadas?.message ?? errorTracking?.message,
      },
      { status: 500 }
    );
  }
  if ((countJornadas && countJornadas > 0) || (countTracking && countTracking > 0)) {
    return NextResponse.json(
      {
        mensaje: `Este chofer ya tiene ${countJornadas ?? 0} jornada(s) y ${countTracking ?? 0} ping(s) de tracking cargados — no se puede anular el registro.`,
      },
      { status: 409 }
    );
  }

  // Log de auditoría MÍNIMO (no hay tabla de auditoría para esto, a diferencia de
  // jornadas.editado_por/campos_editados_admin): un borrado de auth.users es irreversible y se
  // lleva el DNI/correo con él -- esta línea queda en los logs de Render como el único rastro de
  // quién lo pidió y sobre quién, justo antes de ejecutarlo (nunca después: si deleteUser
  // revienta, igual queda constancia de que se intentó).
  console.info(
    `[anular-registro] administrador=${administrador} chofer_id=${id} dni=${chofer.dni} correo=${usuario.user.email} en=${new Date().toISOString()}`
  );

  const { error: errorBorrado } = await supabase.auth.admin.deleteUser(id);
  if (errorBorrado) {
    return NextResponse.json(
      { mensaje: "No se pudo anular el registro.", detalle: errorBorrado.message },
      { status: 500 }
    );
  }

  const respuesta: AnularRegistroResponse = {
    mensaje: "Registro anulado: el DNI y el correo quedan libres para una invitación nueva.",
  };
  return NextResponse.json(respuesta);
}
