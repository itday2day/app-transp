import { NextResponse } from "next/server";
import { generarContrasenaTemporal } from "@/lib/choferes";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { ResetearContrasenaResponse } from "@/lib/types";

// POST /api/choferes/resetear-contrasena — genera una contraseña temporal nueva con el mismo
// mecanismo que el alta (lib/choferes.ts) y vuelve a exigir el cambio en el próximo ingreso.
// Endpoint propio, no un campo más de POST /api/choferes/editar: esto devuelve un secreto que
// se muestra una sola vez, una respuesta de otra naturaleza que "estos son los datos que
// quedaron guardados".
export async function POST(request: Request) {
  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : undefined;
  if (!id) {
    return NextResponse.json({ mensaje: "Falta el id del chofer." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  const contrasenaTemporal = generarContrasenaTemporal();

  const { error: errorAuth } = await supabase.auth.admin.updateUserById(id, {
    password: contrasenaTemporal,
  });
  if (errorAuth) {
    return NextResponse.json(
      { mensaje: "No se pudo generar la nueva contraseña.", detalle: errorAuth.message },
      { status: 500 }
    );
  }

  const { error: errorPerfil } = await supabase
    .from("choferes")
    .update({ debe_cambiar_contrasena: true })
    .eq("id", id);
  if (errorPerfil) {
    return NextResponse.json(
      {
        mensaje:
          "Se generó la contraseña nueva pero no se pudo marcar el perfil para exigir el cambio en el próximo ingreso.",
        detalle: errorPerfil.message,
      },
      { status: 500 }
    );
  }

  const respuesta: ResetearContrasenaResponse = {
    mensaje: "Contraseña reseteada correctamente.",
    contrasenaTemporal,
  };
  return NextResponse.json(respuesta);
}
