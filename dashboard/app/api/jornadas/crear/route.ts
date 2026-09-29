import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type { JornadaRow, TipoIncidencia } from "@/lib/types";
import { MATRICULA_LONGITUD, normalizarMatricula } from "@/lib/vehiculos";

// POST /api/jornadas/crear (spec_rutas_asignadas_admin.md)
//
// Administración carga una jornada sin que el chofer haya pasado por el check-in del celular --
// dos casos reales con el mismo formulario: una ruta planificada a futuro (queda abierta, para
// que el chofer la complete) o el aviso tardío de una entrega que ya se hizo (se completan también
// los datos de cierre y la jornada nace cerrada). Nunca hay foto real de tacómetro ni GPS real --
// esos tres campos son nullable desde schema_v13_jornadas_creadas_admin.sql. `creada_por_admin`
// distingue esta jornada de una nacida en la app, mismo patrón de auditoría que fue_editado/
// editado_por del Hallazgo #28, sin inventar un tercer valor de `estado`.
//
// Body: JSON -- nunca multipart/form-data, a diferencia de /api/jornadas/editar: acá no hay
// ningún archivo que subir.

interface CuerpoPeticion {
  choferId?: string;
  empresa?: string;
  matricula?: string;
  ruta?: string;
  kmInicial?: number;
  combustibleInicial?: number;
  fechaCheckIn?: string;
  // Cierre -- opcional como bloque. Si se completa kmFinal/combustibleFinal, la jornada nace
  // cerrada; si no, nace abierta. tuvoIncidencia/tipoIncidencia/detalleIncidencia son la
  // incidencia de CHECK-OUT (mismo campo que ya usa /api/jornadas/editar), independientes entre
  // sí dentro del bloque de cierre.
  kmFinal?: number;
  combustibleFinal?: number;
  fechaCheckOut?: string;
  tuvoIncidencia?: boolean;
  tipoIncidencia?: TipoIncidencia;
  detalleIncidencia?: string;
}

function numeroValido(valor: unknown): number | undefined {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return undefined;
  return valor;
}

function stringNoVacio(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

/** Igual criterio que /api/jornadas/editar y que IncidenciasForm.tsx en la app móvil: el detalle
 * es obligatorio solo cuando el tipo es "Otro". */
function validarIncidencia(
  tuvoIncidencia: boolean,
  tipo?: TipoIncidencia,
  detalle?: string
): string | null {
  if (!tuvoIncidencia) return null;
  if (tipo === "Otro" && !detalle) {
    return 'El detalle es obligatorio cuando el tipo de incidencia es "Otro".';
  }
  return null;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }
  const creadaPor = sesion.nombre || sesion.email;

  let cuerpo: CuerpoPeticion;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const choferId = stringNoVacio(cuerpo.choferId);
  const empresa = stringNoVacio(cuerpo.empresa);
  // spec_normalizacion_dni_matricula_telefono.md: defensa en profundidad — llega ya normalizada
  // desde crear-jornada-dialog.tsx (matricula del vehículo elegido, ya validada al cargarlo en
  // /flota), esto cubre cualquier otro cliente de la API.
  const matriculaCruda = stringNoVacio(cuerpo.matricula);
  const matricula = matriculaCruda ? normalizarMatricula(matriculaCruda) : undefined;
  const ruta = stringNoVacio(cuerpo.ruta);
  const kmInicial = numeroValido(cuerpo.kmInicial);
  const combustibleInicial = numeroValido(cuerpo.combustibleInicial);

  if (
    !choferId ||
    !empresa ||
    !matricula ||
    !ruta ||
    kmInicial === undefined ||
    combustibleInicial === undefined
  ) {
    return NextResponse.json(
      {
        mensaje:
          "Faltan datos obligatorios de check-in (chofer, empresa, matrícula, ruta, km y combustible).",
      },
      { status: 400 }
    );
  }
  if (matricula.length !== MATRICULA_LONGITUD) {
    return NextResponse.json(
      { mensaje: `La matrícula debe tener ${MATRICULA_LONGITUD} caracteres.` },
      { status: 400 }
    );
  }

  const kmFinal = numeroValido(cuerpo.kmFinal);
  const combustibleFinal = numeroValido(cuerpo.combustibleFinal);
  // Cierre "completo" solo si vienen los dos -- mismo criterio que ya exige CheckOutForm.tsx en
  // la app móvil (km y combustible finales van juntos, nunca uno solo).
  const hayCierre = kmFinal !== undefined && combustibleFinal !== undefined;
  if ((kmFinal !== undefined) !== (combustibleFinal !== undefined)) {
    return NextResponse.json(
      { mensaje: "Si cargás el cierre, hacen falta km final y combustible final juntos." },
      { status: 400 }
    );
  }

  const tuvoIncidencia = cuerpo.tuvoIncidencia === true;
  const errorIncidencia = validarIncidencia(
    tuvoIncidencia,
    cuerpo.tipoIncidencia,
    cuerpo.detalleIncidencia
  );
  if (errorIncidencia) {
    return NextResponse.json({ mensaje: errorIncidencia }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  const { data: chofer, error: errorChofer } = await supabase
    .from("choferes")
    .select("id, nombre, activo")
    .eq("id", choferId)
    .maybeSingle();
  if (errorChofer || !chofer) {
    return NextResponse.json({ mensaje: "No se encontró el chofer." }, { status: 404 });
  }
  if (!chofer.activo) {
    return NextResponse.json({ mensaje: "El chofer elegido está dado de baja." }, { status: 400 });
  }

  // Criterio 5 (Fase 2): no puede haber dos jornadas abiertas para el mismo chofer a la vez, sea
  // real o creada por admin -- cierra de paso el punto que había quedado abierto del Hallazgo #27.
  const { data: abiertaExistente, error: errorAbierta } = await supabase
    .from("jornadas")
    .select("id")
    .eq("chofer_id", choferId)
    .eq("estado", "abierta")
    .limit(1)
    .maybeSingle();
  if (errorAbierta) {
    return NextResponse.json(
      {
        mensaje: "No se pudo verificar si el chofer ya tiene una jornada abierta.",
        detalle: errorAbierta.message,
      },
      { status: 500 }
    );
  }
  if (abiertaExistente) {
    return NextResponse.json(
      {
        mensaje:
          "Este chofer ya tiene una jornada abierta -- no se puede cargar una segunda hasta que se cierre la primera.",
      },
      { status: 409 }
    );
  }

  const fechaCheckIn = stringNoVacio(cuerpo.fechaCheckIn);
  if (fechaCheckIn && Number.isNaN(Date.parse(fechaCheckIn))) {
    return NextResponse.json(
      { mensaje: "La hora de check-in no es una fecha válida." },
      { status: 400 }
    );
  }
  const fechaCheckOut = stringNoVacio(cuerpo.fechaCheckOut);
  if (fechaCheckOut && Number.isNaN(Date.parse(fechaCheckOut))) {
    return NextResponse.json(
      { mensaje: "La hora de check-out no es una fecha válida." },
      { status: 400 }
    );
  }

  const nuevaFila: TablesInsert<"jornadas"> = {
    chofer_id: choferId,
    chofer_nombre: chofer.nombre,
    empresa,
    matricula,
    ruta,
    km_inicial: kmInicial,
    combustible_inicial: combustibleInicial,
    // Nunca hay foto real de tacómetro ni GPS real -- Administración no tiene cámara ni ubicación
    // del chofer. Nullable desde schema_v13_jornadas_creadas_admin.sql.
    foto_tacometro_inicial_url: null,
    lat_inicial: null,
    lng_inicial: null,
    fecha_check_in: fechaCheckIn ? new Date(fechaCheckIn).toISOString() : new Date().toISOString(),
    creada_por_admin: true,
    creada_por: creadaPor,
    estado: hayCierre ? "cerrada" : "abierta",
    ...(hayCierre
      ? {
          km_final: kmFinal,
          combustible_final: combustibleFinal,
          fecha_check_out: fechaCheckOut
            ? new Date(fechaCheckOut).toISOString()
            : new Date().toISOString(),
          tuvo_incidencia: tuvoIncidencia,
          tipo_incidencia: tuvoIncidencia ? (cuerpo.tipoIncidencia ?? null) : null,
          detalle_incidencia: tuvoIncidencia ? (cuerpo.detalleIncidencia ?? "") : "",
        }
      : {}),
  };

  const { data, error } = await supabase.from("jornadas").insert(nuevaFila).select().single();
  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo crear la jornada.", detalle: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    mensaje: "Jornada creada correctamente.",
    jornada: data as JornadaRow,
  });
}
