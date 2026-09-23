import { NextResponse } from "next/server";
import {
  DNI_VALIDO_REGEX,
  edadMinimaCumplida,
  generarContrasenaTemporal,
  numeroEmpleadoAEmail,
  SEXOS,
} from "@/lib/choferes";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type {
  ChoferDuplicadoResponse,
  ChoferRow,
  ChoferesResponse,
  CrearChoferRequest,
  CrearChoferResponse,
  SexoChofer,
} from "@/lib/types";

// GET /api/choferes — todos los choferes, sin filtros ni paginación (una flota de choferes son
// decenas de filas, no miles como jornadas — mismo criterio que /api/vehiculos). Incluye los de
// baja: la pantalla los muestra, no los oculta.
export async function GET() {
  const supabase = crearClienteSupabaseAdmin();

  const { data, error } = await supabase
    .from("choferes")
    .select("*")
    .order("numero_empleado", { ascending: true })
    .returns<ChoferRow[]>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener los choferes.", detalle: error.message },
      { status: 500 }
    );
  }

  const respuesta: ChoferesResponse = { data: data ?? [] };
  return NextResponse.json(respuesta);
}

interface CuerpoPeticion {
  numeroEmpleado?: unknown;
  nombre?: unknown;
  apellidos?: unknown;
  dni?: unknown;
  fechaNacimiento?: unknown;
  paisNacimiento?: unknown;
  sexo?: unknown;
}

function validarCuerpo(body: CuerpoPeticion): { campos: CrearChoferRequest } | { error: string } {
  const numeroEmpleado = typeof body.numeroEmpleado === "string" ? body.numeroEmpleado.trim() : "";
  if (!numeroEmpleado) return { error: "Falta el número de empleado." };

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) return { error: "Falta el nombre." };

  const apellidos = typeof body.apellidos === "string" ? body.apellidos.trim() : "";
  if (!apellidos) return { error: "Faltan los apellidos." };

  const dni = typeof body.dni === "string" ? body.dni.trim().toUpperCase() : "";
  if (!DNI_VALIDO_REGEX.test(dni)) {
    return { error: "El DNI debe tener entre 5 y 20 caracteres alfanuméricos." };
  }

  const fechaNacimiento = typeof body.fechaNacimiento === "string" ? body.fechaNacimiento : "";
  if (!fechaNacimiento || Number.isNaN(new Date(fechaNacimiento).getTime())) {
    return { error: "La fecha de nacimiento no es válida." };
  }
  if (!edadMinimaCumplida(fechaNacimiento)) {
    return { error: "El chofer debe ser mayor de 18 años." };
  }

  const paisNacimiento = typeof body.paisNacimiento === "string" ? body.paisNacimiento.trim() : "";
  if (!paisNacimiento) return { error: "Falta el país de nacimiento." };

  const sexo = body.sexo;
  if (typeof sexo !== "string" || !SEXOS.includes(sexo as SexoChofer)) {
    return { error: "El sexo debe ser Masculino, Femenino u Otro." };
  }

  return {
    campos: {
      numeroEmpleado,
      nombre,
      apellidos,
      dni,
      fechaNacimiento,
      paisNacimiento,
      sexo: sexo as SexoChofer,
    },
  };
}

// POST /api/choferes — alta de un chofer nuevo. Dos sistemas sin transacción común (Supabase
// Auth + la fila de `choferes`), así que el orden y la compensación importan (ver Fase 1/2 de
// spec_alta_choferes_dashboard.md):
//
//   1. `choferes.id` es FK a `auth.users.id` — el orden NO es una elección, el usuario de Auth
//      tiene que existir antes de poder insertar la fila. Lo que SÍ se elige es qué pasa si
//      falla el paso 2 (la fila): en vez de dejar un usuario de Auth huérfano e invisible (no
//      aparece en ningún lado porque no hay fila que lo represente), se BORRA el usuario de Auth
//      recién creado (rollback) — el estado que queda es "no se creó nada", limpio y reintentable,
//      no un huérfano escondido.
//   2. Antes de tocar Auth para nada, se chequea si el número de empleado YA existe (comparación
//      exacta, sin normalizar — ver Fase 1 punto 4: "04" y "4" son valores de texto distintos a
//      propósito, no se inventa una equivalencia que la base no tiene) — evita crear-y-compensar
//      en el caso común de un typo/duplicado.
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

  const { data: existente, error: errorLectura } = await supabase
    .from("choferes")
    .select("id, numero_empleado, nombre, activo")
    .eq("numero_empleado", campos.numeroEmpleado)
    .maybeSingle();

  if (errorLectura) {
    return NextResponse.json(
      {
        mensaje: "No se pudo verificar si el número de empleado ya existe.",
        detalle: errorLectura.message,
      },
      { status: 500 }
    );
  }
  if (existente) {
    const respuesta: ChoferDuplicadoResponse = {
      mensaje: `Ya existe un chofer con el número de empleado ${existente.numero_empleado}: ${existente.nombre} (${existente.activo ? "activo" : "de baja"}).`,
      choferExistente: {
        id: existente.id,
        numeroEmpleado: existente.numero_empleado,
        nombre: existente.nombre,
        activo: existente.activo,
      },
    };
    return NextResponse.json(respuesta, { status: 409 });
  }

  const email = numeroEmpleadoAEmail(campos.numeroEmpleado);
  const contrasenaTemporal = generarContrasenaTemporal();

  const { data: usuarioAuth, error: errorAuth } = await supabase.auth.admin.createUser({
    email,
    password: contrasenaTemporal,
    email_confirm: true,
  });

  if (errorAuth || !usuarioAuth.user) {
    const mensaje =
      errorAuth?.code === "email_exists"
        ? "Ya existe una cuenta de acceso para este número de empleado (sin perfil asociado) — contactá a soporte."
        : "No se pudo crear el acceso del chofer.";
    return NextResponse.json({ mensaje, detalle: errorAuth?.message }, { status: 500 });
  }

  const nuevoChofer: TablesInsert<"choferes"> = {
    id: usuarioAuth.user.id,
    numero_empleado: campos.numeroEmpleado,
    nombre: campos.nombre,
    apellidos: campos.apellidos,
    dni: campos.dni,
    fecha_nacimiento: campos.fechaNacimiento,
    pais_nacimiento: campos.paisNacimiento,
    sexo: campos.sexo,
    activo: true,
    debe_cambiar_contrasena: true,
  };

  const { data, error } = await supabase
    .from("choferes")
    .insert(nuevoChofer)
    .select()
    .single<ChoferRow>();

  if (error) {
    // Compensación: sin esto, queda un usuario de Auth que puede iniciar sesión pero no tiene
    // fila de chofer — invisible en la lista, y `iniciarSesion()` (app móvil) falla al buscar el
    // perfil con un error que no dice por qué. Mejor "no se creó nada" y reintentable.
    const { error: errorCompensacion } = await supabase.auth.admin.deleteUser(usuarioAuth.user.id);
    if (errorCompensacion) {
      return NextResponse.json(
        {
          mensaje:
            "Se creó el acceso del chofer pero no se pudo guardar su perfil, y tampoco se pudo deshacer el acceso creado. Contactá a soporte con este id: " +
            usuarioAuth.user.id,
          detalle: `insert: ${error.message} | compensación: ${errorCompensacion.message}`,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        mensaje: "No se pudo guardar el perfil del chofer. No se creó ningún acceso — reintentá.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }

  const respuesta: CrearChoferResponse = {
    mensaje: "Chofer creado correctamente.",
    chofer: data,
    contrasenaTemporal,
  };
  return NextResponse.json(respuesta);
}
