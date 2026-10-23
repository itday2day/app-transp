import { NextResponse } from "next/server";
import {
  DNI_VALIDO_REGEX,
  edadMinimaCumplida,
  identificadorChofer,
  normalizarDni,
  TELEFONO_VALIDO_REGEX,
} from "@/lib/choferes";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { ChoferDuplicadoResponse, ChoferRow, EditarChoferResponse } from "@/lib/types";

// Duración de ban efectivamente permanente — mismo valor que usa la documentación oficial de
// Supabase para "banear indefinidamente" (no existe un "para siempre" real en la API, así que
// esto es la convención). "none" levanta el ban (reactivar).
const BAN_PERMANENTE = "876000h";

// spec_dashboard_choferes_limpieza.md, criterio 9: sexo/paisNacimiento ya no están acá a
// propósito -- si una pestaña vieja todavía los manda, no se leen de `body` (TS los deja fuera
// del tipo) y nunca llegan a `actualizacion`, así que el servidor los ignora sin devolver 400.
interface CuerpoPeticion {
  id?: unknown;
  nombre?: unknown;
  apellidos?: unknown;
  dni?: unknown;
  fechaNacimiento?: unknown;
  telefono?: unknown;
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
    const dni = typeof body.dni === "string" ? normalizarDni(body.dni) : "";
    if (!DNI_VALIDO_REGEX.test(dni)) {
      return NextResponse.json(
        { mensaje: "El DNI debe tener 9 caracteres (DNI o NIE español)." },
        { status: 400 }
      );
    }
    actualizacion.dni = dni;
  }
  if (body.telefono !== undefined) {
    const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
    if (telefono && !TELEFONO_VALIDO_REGEX.test(telefono)) {
      return NextResponse.json(
        { mensaje: "El teléfono debe tener formato internacional, por ejemplo +34612345678." },
        { status: 400 }
      );
    }
    actualizacion.telefono = telefono || null;
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

  // spec_normalizacion_dni_matricula_telefono.md, criterio 3: misma regla de unicidad legible que
  // POST /api/choferes, aplicada también al editar — sin esto, editar sería la puerta trasera para
  // guardar el DNI de otro chofer que el alta ya rechaza. `id !== id actual` para que un chofer
  // nunca "choque contra sí mismo" cuando edita otro campo sin tocar el DNI.
  if (actualizacion.dni) {
    const { data: dniExistente, error: errorLecturaDni } = await supabase
      .from("choferes")
      .select("id, numero_empleado, nombre, apellidos, dni, activo")
      .eq("dni", actualizacion.dni)
      .neq("id", id)
      .maybeSingle();

    if (errorLecturaDni) {
      return NextResponse.json(
        { mensaje: "No se pudo verificar si el DNI ya existe.", detalle: errorLecturaDni.message },
        { status: 500 }
      );
    }
    if (dniExistente) {
      // Hallazgo #51, paso 3b: identifica al otro chofer por identificadorChofer(), no por
      // numero_empleado (que puede no existir para un chofer registrado por invitación).
      const respuesta: ChoferDuplicadoResponse = {
        mensaje: `Ya existe otro chofer con este DNI: ${identificadorChofer(dniExistente)} (${dniExistente.activo ? "activo" : "de baja"}).`,
        choferExistente: {
          id: dniExistente.id,
          numeroEmpleado: dniExistente.numero_empleado,
          nombre: dniExistente.nombre,
          activo: dniExistente.activo,
        },
      };
      return NextResponse.json(respuesta, { status: 409 });
    }
  }

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
