import { NextResponse } from "next/server";
import { normalizarMatricula } from "@/lib/vehiculos";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type {
  CrearVehiculoRequest,
  TipoPropiedadVehiculo,
  VehiculoDuplicadoResponse,
  VehiculoResponse,
  VehiculoRow,
  VehiculosResponse,
} from "@/lib/types";

const TIPOS_PROPIEDAD_VALIDOS: TipoPropiedadVehiculo[] = ["propio", "alquilado", "autonomo"];
const ANIO_MINIMO = 1970;
const ANIO_MAXIMO = 2100;

// GET /api/vehiculos — la flota completa, sin filtros ni paginación: a diferencia de jornadas
// (miles de filas con el tiempo), una flota son decenas de vehículos — cargarla entera es simple
// y no hace falta paginar. Incluye los de baja (la pantalla los muestra, solo no los oculta).
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("vehiculos")
    .select("*")
    .order("matricula", { ascending: true })
    .returns<VehiculoRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener los vehículos.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: VehiculosResponse = { data: data ?? [] };
  return NextResponse.json(respuesta);
}

interface CuerpoPeticion {
  matricula?: unknown;
  tipoPropiedad?: unknown;
  capacidadTanqueLitros?: unknown;
  marca?: unknown;
  modelo?: unknown;
  anio?: unknown;
}

function validarCuerpo(body: CuerpoPeticion): { campos: CrearVehiculoRequest } | { error: string } {
  const matricula = typeof body.matricula === "string" ? body.matricula.trim() : "";
  if (!matricula) return { error: "Falta la matrícula." };

  const tipoPropiedad = body.tipoPropiedad;
  if (
    typeof tipoPropiedad !== "string" ||
    !TIPOS_PROPIEDAD_VALIDOS.includes(tipoPropiedad as TipoPropiedadVehiculo)
  ) {
    return { error: "El tipo de propiedad debe ser propio, alquilado o autónomo." };
  }

  const campos: CrearVehiculoRequest = {
    matricula,
    tipoPropiedad: tipoPropiedad as TipoPropiedadVehiculo,
  };

  if (body.capacidadTanqueLitros !== undefined && body.capacidadTanqueLitros !== "") {
    const capacidad = Number(body.capacidadTanqueLitros);
    if (!Number.isFinite(capacidad) || capacidad <= 0) {
      return { error: "La capacidad de tanque debe ser un número positivo." };
    }
    campos.capacidadTanqueLitros = capacidad;
  }

  if (typeof body.marca === "string" && body.marca.trim()) campos.marca = body.marca.trim();
  if (typeof body.modelo === "string" && body.modelo.trim()) campos.modelo = body.modelo.trim();

  if (body.anio !== undefined && body.anio !== "") {
    const anio = Number(body.anio);
    if (!Number.isInteger(anio) || anio < ANIO_MINIMO || anio > ANIO_MAXIMO) {
      return { error: `El año debe ser un número entero entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.` };
    }
    campos.anio = anio;
  }

  return { campos };
}

// POST /api/vehiculos — alta de un vehículo nuevo.
//
// La unicidad de matrícula NORMALIZADA (mayúsculas, sin caracteres no alfanuméricos) es la razón
// de ser de esta tabla — ver vehiculos_matricula_normalizada en supabase/schema.sql. Antes de
// insertar, se busca a mano (la flota es chica, no hace falta una función RPC para esto, ver
// lib/vehiculos.ts) si ya existe un vehículo con la misma matrícula normalizada:
//   - si está ACTIVO: 409, error legible con cuál es (no un error genérico de Postgres).
//   - si está DE BAJA: 409 con el id existente — la pantalla ofrece reactivarlo (POST
//     /api/vehiculos/editar con estado: "activo") en vez de dejar que el admin intente de nuevo a
//     ciegas. No se reactiva solo — reactivar es una acción explícita del admin.
// El índice único de la base sigue siendo la garantía real (defensa en profundidad) si dos altas
// coinciden en la misma fracción de segundo.
export async function POST(request: Request) {
  let body: CuerpoPeticion;
  try {
    body = (await request.json()) as CuerpoPeticion;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const validacion = validarCuerpo(body);
  if ("error" in validacion) {
    return NextResponse.json({ mensaje: validacion.error }, { status: 400 });
  }
  const { campos } = validacion;

  const supabase = crearClienteSupabaseAdmin();
  const normalizada = normalizarMatricula(campos.matricula);

  const { data: existentes, error: errorLectura } = await supabase
    .from("vehiculos")
    .select("id, matricula, estado")
    .returns<Pick<VehiculoRow, "id" | "matricula" | "estado">[]>();

  if (errorLectura) {
    return NextResponse.json(
      { mensaje: "No se pudo verificar si la matrícula ya existe.", detalle: errorLectura.message },
      { status: 500 }
    );
  }

  const duplicado = (existentes ?? []).find(
    (v) => normalizarMatricula(v.matricula) === normalizada
  );
  if (duplicado) {
    const respuesta: VehiculoDuplicadoResponse = {
      mensaje:
        duplicado.estado === "activo"
          ? `Ya existe un vehículo con esta matrícula: ${duplicado.matricula} (activo).`
          : `Ya existe un vehículo con esta matrícula: ${duplicado.matricula}, dado de baja. Podés reactivarlo en vez de crear uno nuevo.`,
      vehiculoExistente: duplicado,
    };
    return NextResponse.json(respuesta, { status: 409 });
  }

  const nuevoVehiculo: TablesInsert<"vehiculos"> = {
    matricula: campos.matricula,
    tipo_propiedad: campos.tipoPropiedad,
    capacidad_tanque_litros: campos.capacidadTanqueLitros ?? null,
    marca: campos.marca ?? null,
    modelo: campos.modelo ?? null,
    anio: campos.anio ?? null,
  };

  const { data, error } = await supabase
    .from("vehiculos")
    .insert(nuevoVehiculo)
    .select()
    .single<VehiculoRow>();

  if (error) {
    // El índice único de la base es la última red de seguridad ante una carrera entre dos altas
    // simultáneas con la misma matrícula — el chequeo de arriba cubre el caso normal, esto cubre
    // el residual. Postgres error 23505 = unique_violation.
    if (error.code === "23505") {
      return NextResponse.json(
        { mensaje: "Ya existe un vehículo con esta matrícula." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { mensaje: "No se pudo crear el vehículo.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: VehiculoResponse = { mensaje: "Vehículo creado correctamente.", vehiculo: data };
  return NextResponse.json(respuesta);
}
