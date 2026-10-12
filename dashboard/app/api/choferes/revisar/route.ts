import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { esUuid } from "@/lib/utils";
import type { ChoferRow, RevisarChoferResponse } from "@/lib/types";

// POST /api/choferes/revisar — "Marcar como revisado" (criterio 21). Solo informativo: no
// bloquea nada del chofer, es la única acción que quita la etiqueta "Nuevo — sin revisar" de
// /choferes. revisado_por es texto libre (nombre/correo del admin), mismo criterio que
// creada_por/editado_por en el resto del Dashboard.
//
// UPDATE condicionado a `revisado_at is null` (mismo principio que revocar invitaciones, criterio
// 2): si dos admins tocan "Marcar como revisado" casi al mismo tiempo, el primero gana y queda
// registrado con SU nombre -- el segundo no debe pisarlo con el suyo. Si el UPDATE no afecta
// ninguna fila es porque ya estaba revisado (no un error): se devuelve la fila tal cual está, sin
// modificarla.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }
  const revisadoPor = sesion.nombre || sesion.email;

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
  const { data, error } = await supabase
    .from("choferes")
    .update({ revisado_at: new Date().toISOString(), revisado_por: revisadoPor })
    .eq("id", id)
    .is("revisado_at", null)
    .select()
    .maybeSingle<ChoferRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo marcar el chofer como revisado.", detalle: error.message },
      { status: 500 }
    );
  }

  if (data) {
    const respuesta: RevisarChoferResponse = {
      mensaje: "Chofer marcado como revisado.",
      chofer: data,
    };
    return NextResponse.json(respuesta);
  }

  // El UPDATE no afectó ninguna fila -- o no existe, o ya estaba revisado. Esta lectura es solo
  // para decidir cuál de los dos mensajes mostrar, nunca para decidir si se escribe algo.
  const { data: filaActual, error: errorLectura } = await supabase
    .from("choferes")
    .select("*")
    .eq("id", id)
    .maybeSingle<ChoferRow>();
  if (errorLectura) {
    return NextResponse.json(
      { mensaje: "No se pudo leer el chofer.", detalle: errorLectura.message },
      { status: 500 }
    );
  }
  if (!filaActual) {
    return NextResponse.json({ mensaje: "No se encontró el chofer." }, { status: 404 });
  }

  const respuesta: RevisarChoferResponse = {
    mensaje: "Este chofer ya estaba marcado como revisado.",
    chofer: filaActual,
  };
  return NextResponse.json(respuesta);
}
