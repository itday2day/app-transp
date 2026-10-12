import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { EstadoChoferAuth, EstadoChoferesResponse } from "@/lib/types";

// GET /api/choferes/estado — envuelve la RPC listar_estado_choferes() (criterio 21): email/
// email_confirmed_at viven en auth.users, no en `choferes`, así que no hay forma de pedirlos con
// un `select` normal a la tabla. La RPC está marcada solo para `service_role` (confirmado en el
// paso 2: has_function_privilege da false para anon/authenticated) -- este Route Handler es el
// único lugar permitido para llamarla.
export async function GET() {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase.rpc("listar_estado_choferes");

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo obtener el estado de los choferes.", detalle: error.message },
      { status: 500 }
    );
  }

  // email_confirmed_at/revisado_at SÍ pueden ser null en la realidad (un chofer sin confirmar, o
  // nunca revisado) aunque los tipos generados por `supabase gen types` los marquen como
  // `string` a secas -- limitación conocida del generador con `returns table(...)`, no un hecho
  // de la base (la función se escribió a mano, el `rowtype` real de origen sí los admite null).
  const filas = (data ?? []) as unknown as {
    id: string;
    email: string;
    email_confirmed_at: string | null;
    revisado_at: string | null;
  }[];

  const estado: EstadoChoferAuth[] = filas.map((fila) => ({
    id: fila.id,
    email: fila.email,
    emailConfirmedAt: fila.email_confirmed_at,
    revisadoAt: fila.revisado_at,
  }));

  const respuesta: EstadoChoferesResponse = { data: estado };
  return NextResponse.json(respuesta);
}
