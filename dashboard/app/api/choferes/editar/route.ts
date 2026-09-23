import { NextResponse } from "next/server";
import { DNI_VALIDO_REGEX, edadMinimaCumplida, SEXOS } from "@/lib/choferes";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { ChoferRow, EditarChoferResponse, SexoChofer } from "@/lib/types";

// Duración de ban efectivamente permanente — mismo valor que usa la documentación oficial de
// Supabase para "banear indefinidamente" (no existe un "para siempre" real en la API, así que
// esto es la convención). "none" levanta el ban (reactivar).
const BAN_PERMANENTE = "876000h";

interface CuerpoPeticion {
  id?: unknown;
  nombre?: unknown;
  apellidos?: unknown;
  dni?: unknown;
  fechaNacimiento?: unknown;
  paisNacimiento?: unknown;
  sexo?: unknown;
  activo?: unknown;
}

// POST /api/choferes/editar — edita datos personales y/o cambia `activo` (baja/reactivar). El
// número de empleado NO se edita acá (cambiar numeroEmpleado cambiaría el correo sintético con
// el que el chofer ya inició sesión antes — reasignar identidad de acceso no es "editar datos",
// es un caso aparte fuera de esta spec).
//
// ⚠️ Dar de baja/reactivar tiene que actuar en LOS DOS sistemas: `activo` en la tabla (lo que ve
// el Dashboard) y el ban de Supabase Auth (lo que de verdad le impide — o le permite — iniciar
// sesión). Marcar solo la columna no saca a nadie de la app: Auth seguiría dejándolo entrar.
export async function POST(request: Request) {
  let body: CuerpoPeticion;
  try {
    body = (await request.json()) as CuerpoPeticion;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : undefined;
  if (!id) {
    return NextResponse.json({ mensaje: "Falta el id del chofer." }, { status: 400 });
  }

  const actualizacion: TablesUpdate<"choferes"> = {};

  if (body.nombre !== undefined) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre)
      return NextResponse.json({ mensaje: "El nombre no puede quedar vacío." }, { status: 400 });
    actualizacion.nombre = nombre;
  }
  if (body.apellidos !== undefined) {
    const apellidos = typeof body.apellidos === "string" ? body.apellidos.trim() : "";
    if (!apellidos) {
      return NextResponse.json(
        { mensaje: "Los apellidos no pueden quedar vacíos." },
        { status: 400 }
      );
    }
    actualizacion.apellidos = apellidos;
  }
  if (body.dni !== undefined) {
    const dni = typeof body.dni === "string" ? body.dni.trim().toUpperCase() : "";
    if (!DNI_VALIDO_REGEX.test(dni)) {
      return NextResponse.json(
        { mensaje: "El DNI debe tener entre 5 y 20 caracteres alfanuméricos." },
        { status: 400 }
      );
    }
    actualizacion.dni = dni;
  }
  if (body.fechaNacimiento !== undefined) {
    const fecha = typeof body.fechaNacimiento === "string" ? body.fechaNacimiento : "";
    if (!fecha || Number.isNaN(new Date(fecha).getTime())) {
      return NextResponse.json(
        { mensaje: "La fecha de nacimiento no es válida." },
        { status: 400 }
      );
    }
    if (!edadMinimaCumplida(fecha)) {
      return NextResponse.json(
        { mensaje: "El chofer debe ser mayor de 18 años." },
        { status: 400 }
      );
    }
    actualizacion.fecha_nacimiento = fecha;
  }
  if (body.paisNacimiento !== undefined) {
    const pais = typeof body.paisNacimiento === "string" ? body.paisNacimiento.trim() : "";
    if (!pais)
      return NextResponse.json({ mensaje: "Falta el país de nacimiento." }, { status: 400 });
    actualizacion.pais_nacimiento = pais;
  }
  if (body.sexo !== undefined) {
    if (typeof body.sexo !== "string" || !SEXOS.includes(body.sexo as SexoChofer)) {
      return NextResponse.json(
        { mensaje: "El sexo debe ser Masculino, Femenino u Otro." },
        { status: 400 }
      );
    }
    actualizacion.sexo = body.sexo;
  }

  let cambioActivo: boolean | undefined;
  if (body.activo !== undefined) {
    if (typeof body.activo !== "boolean") {
      return NextResponse.json(
        { mensaje: "El estado activo debe ser verdadero o falso." },
        { status: 400 }
      );
    }
    actualizacion.activo = body.activo;
    cambioActivo = body.activo;
  }

  const supabase = crearClienteSupabaseAdmin();

  // El ban/unban de Auth se hace ANTES de tocar la tabla: si esto falla, se corta acá sin haber
  // marcado `activo` — evita el estado inconsistente "la tabla dice de baja pero Auth lo sigue
  // dejando entrar", que es exactamente lo que esta regla existe para prevenir.
  if (cambioActivo !== undefined) {
    const { error: errorBan } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: cambioActivo ? "none" : BAN_PERMANENTE,
    });
    if (errorBan) {
      return NextResponse.json(
        {
          mensaje: cambioActivo
            ? "No se pudo reactivar el acceso del chofer."
            : "No se pudo cortar el acceso del chofer.",
          detalle: errorBan.message,
        },
        { status: 500 }
      );
    }
  }

  const { data, error } = await supabase
    .from("choferes")
    .update(actualizacion)
    .eq("id", id)
    .select()
    .single<ChoferRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo guardar los cambios.", detalle: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ mensaje: "No se encontró el chofer." }, { status: 404 });
  }

  const respuesta: EditarChoferResponse = {
    mensaje: "Chofer actualizado correctamente.",
    chofer: data,
  };
  return NextResponse.json(respuesta);
}
