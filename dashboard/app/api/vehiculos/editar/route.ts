import { NextResponse } from "next/server";
import { normalizarMatricula } from "@/lib/vehiculos";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type {
  EstadoVehiculo,
  TipoPropiedadVehiculo,
  VehiculoDuplicadoResponse,
  VehiculoResponse,
  VehiculoRow,
} from "@/lib/types";

const TIPOS_PROPIEDAD_VALIDOS: TipoPropiedadVehiculo[] = ["propio", "alquilado", "autonomo"];
const ESTADOS_VALIDOS: EstadoVehiculo[] = ["activo", "baja"];
const ANIO_MINIMO = 1970;
const ANIO_MAXIMO = 2100;

interface CuerpoPeticion {
  id?: unknown;
  matricula?: unknown;
  tipoPropiedad?: unknown;
  capacidadTanqueLitros?: unknown;
  marca?: unknown;
  modelo?: unknown;
  anio?: unknown;
  estado?: unknown;
}

// POST /api/vehiculos/editar — edición, baja y REACTIVACIÓN son la misma operación (cambiar
// campos de una fila existente, `estado` incluido) — mismo patrón que POST
// /api/jornadas/editar (id en el body, no una ruta dinámica). "Dar de baja" es
// `{ id, estado: "baja" }`; "reactivar" (ver POST /api/vehiculos) es
// `{ id, estado: "activo" }` — no existe una acción de eliminar: no hay DELETE acá ni en la
// pantalla.
export async function POST(request: Request) {
  let body: CuerpoPeticion;
  try {
    body = (await request.json()) as CuerpoPeticion;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : undefined;
  if (!id) {
    return NextResponse.json({ mensaje: "Falta el id del vehículo." }, { status: 400 });
  }

  const actualizacion: TablesUpdate<"vehiculos"> = {};

  if (body.matricula !== undefined) {
    const matricula = typeof body.matricula === "string" ? body.matricula.trim() : "";
    if (!matricula) {
      return NextResponse.json({ mensaje: "La matrícula no puede quedar vacía." }, { status: 400 });
    }
    actualizacion.matricula = matricula;
  }

  if (body.tipoPropiedad !== undefined) {
    if (
      typeof body.tipoPropiedad !== "string" ||
      !TIPOS_PROPIEDAD_VALIDOS.includes(body.tipoPropiedad as TipoPropiedadVehiculo)
    ) {
      return NextResponse.json(
        { mensaje: "El tipo de propiedad debe ser propio, alquilado o autónomo." },
        { status: 400 }
      );
    }
    actualizacion.tipo_propiedad = body.tipoPropiedad;
  }

  if (body.capacidadTanqueLitros !== undefined) {
    if (body.capacidadTanqueLitros === null || body.capacidadTanqueLitros === "") {
      actualizacion.capacidad_tanque_litros = null;
    } else {
      const capacidad = Number(body.capacidadTanqueLitros);
      if (!Number.isFinite(capacidad) || capacidad <= 0) {
        return NextResponse.json(
          { mensaje: "La capacidad de tanque debe ser un número positivo." },
          { status: 400 }
        );
      }
      actualizacion.capacidad_tanque_litros = capacidad;
    }
  }

  if (body.marca !== undefined) {
    actualizacion.marca =
      typeof body.marca === "string" && body.marca.trim() ? body.marca.trim() : null;
  }
  if (body.modelo !== undefined) {
    actualizacion.modelo =
      typeof body.modelo === "string" && body.modelo.trim() ? body.modelo.trim() : null;
  }

  if (body.anio !== undefined) {
    if (body.anio === null || body.anio === "") {
      actualizacion.anio = null;
    } else {
      const anio = Number(body.anio);
      if (!Number.isInteger(anio) || anio < ANIO_MINIMO || anio > ANIO_MAXIMO) {
        return NextResponse.json(
          { mensaje: `El año debe ser un número entero entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.` },
          { status: 400 }
        );
      }
      actualizacion.anio = anio;
    }
  }

  if (body.estado !== undefined) {
    if (
      typeof body.estado !== "string" ||
      !ESTADOS_VALIDOS.includes(body.estado as EstadoVehiculo)
    ) {
      return NextResponse.json({ mensaje: "El estado debe ser activo o baja." }, { status: 400 });
    }
    actualizacion.estado = body.estado;
  }

  const supabase = crearClienteSupabaseAdmin();

  // Si la matrícula cambia, aplica la misma regla de unicidad normalizada que el alta — sin esto,
  // editar sería la puerta trasera para crear el duplicado que POST /api/vehiculos ya evita.
  // Se excluye el propio vehículo (`v.id !== id`): reactivar sin tocar la matrícula, o cualquier
  // otra edición que no la toque, nunca puede "chocar contra sí mismo".
  if (actualizacion.matricula) {
    const { data: existentes, error: errorLectura } = await supabase
      .from("vehiculos")
      .select("id, matricula, estado")
      .returns<Pick<VehiculoRow, "id" | "matricula" | "estado">[]>();

    if (errorLectura) {
      return NextResponse.json(
        {
          mensaje: "No se pudo verificar si la matrícula ya existe.",
          detalle: errorLectura.message,
        },
        { status: 500 }
      );
    }

    const normalizada = normalizarMatricula(actualizacion.matricula);
    const duplicado = (existentes ?? []).find(
      (v) => v.id !== id && normalizarMatricula(v.matricula) === normalizada
    );
    if (duplicado) {
      const respuesta: VehiculoDuplicadoResponse = {
        mensaje:
          duplicado.estado === "activo"
            ? `Ya existe otro vehículo con esta matrícula: ${duplicado.matricula} (activo).`
            : `Ya existe otro vehículo con esta matrícula: ${duplicado.matricula}, dado de baja.`,
        vehiculoExistente: duplicado,
      };
      return NextResponse.json(respuesta, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("vehiculos")
    .update(actualizacion)
    .eq("id", id)
    .select()
    .single<VehiculoRow>();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { mensaje: "Ya existe un vehículo con esta matrícula." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { mensaje: "No se pudo guardar los cambios.", detalle: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ mensaje: "No se encontró el vehículo." }, { status: 404 });
  }

  const respuesta: VehiculoResponse = {
    mensaje: "Vehículo actualizado correctamente.",
    vehiculo: data,
  };
  return NextResponse.json(respuesta);
}
