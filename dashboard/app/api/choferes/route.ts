import { NextResponse } from "next/server";
import { compararChoferesPorNombre } from "@/lib/choferes";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { ChoferRow, ChoferesResponse } from "@/lib/types";

// GET /api/choferes — todos los choferes, sin filtros ni paginación (una flota de choferes son
// decenas de filas, no miles como jornadas — mismo criterio que /api/vehiculos). Incluye los de
// baja: la pantalla los muestra, no los oculta.
//
// Orden por apellidos y nombre (Hallazgo #51, paso 3b, criterio 6) con un Collator declarado EN
// EL CÓDIGO, no un `.order()` de Postgres -- numero_empleado ya no sirve de clave de orden
// (puede ser null) y depender del collation de la base para acentos/ñ es justo el tipo de cosa
// que cambia sin avisar entre entornos.
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase.from("choferes").select("*").returns<ChoferRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener los choferes.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: ChoferesResponse = { data: (data ?? []).sort(compararChoferesPorNombre) };
  return NextResponse.json(respuesta);
}

// POST /api/choferes — RETIRADO (Hallazgo #51, criterio 22): el alta con contraseña temporal se
// reemplaza por la invitación (POST /api/invitaciones). 410, no 500 ni 404 — el endpoint existió
// y se retiró a propósito, no es "nunca existió" ni "un error inesperado". Si algún cliente
// viejo (una pestaña del Dashboard abierta desde antes de este despliegue) todavía lo llama, el
// mensaje tiene que decir qué pasó, no devolver un error genérico de servidor.
export async function POST() {
  return NextResponse.json(
    {
      mensaje:
        'El alta de choferes con contraseña temporal se retiró. Usá "Invitar chofer" — el chofer se registra solo con el enlace o el código.',
    },
    { status: 410 }
  );
}
