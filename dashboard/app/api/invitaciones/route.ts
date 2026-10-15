import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { normalizarDni } from "@/lib/choferes";
import {
  armarMensajeParaCopiar,
  COLUMNAS_LISTADO_INVITACIONES,
  enriquecerInvitaciones,
  enriquecerInvitacionesListado,
  limpiarDatosVencidos,
  validarDatosInvitacion,
} from "@/lib/invitaciones";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { formatFechaHora } from "@/lib/utils";
import type {
  CrearInvitacionRequest,
  CrearInvitacionResponse,
  EmpresaRow,
  InvitacionesResponse,
  InvitacionListadoRow,
  InvitacionRow,
  RutaRow,
} from "@/lib/types";

// Sin `pg_cron`, la limpieza de datos personales de las vencidas hace más de 7 días (Fase 1,
// punto 3) corre como efecto lateral de cada GET/POST -- nunca bloquea la petición principal: un
// fallo acá se registra y se sigue, no se propaga como error de la petición que lo disparó. Solo
// se registra el NÚMERO de filas (criterio 29) -- nunca los datos que tenían.
async function limpiarVencidasSinBloquear(
  supabase: ReturnType<typeof crearClienteSupabaseAdmin>
): Promise<void> {
  try {
    const filas = await limpiarDatosVencidos(supabase);
    if (filas > 0) {
      console.log(`[invitaciones] limpieza de vencidas (+7 días): ${filas} fila(s) anuladas.`);
    }
  } catch (error) {
    console.error(
      "[invitaciones] la limpieza de vencidas falló, no bloquea la petición:",
      error instanceof Error ? error.message : error
    );
  }
}

// GET /api/invitaciones — lista completa, sin paginar (criterio 20: mismo criterio de volumen
// que /api/choferes, no son miles de filas). Resuelve empresa_id/ruta_id a nombres acá, no en el
// cliente: son FK reales al catálogo (a diferencia de jornadas.empresa/ruta, que son texto
// libre), así que el nombre se busca una sola vez por request, no por fila en el navegador.
export async function GET() {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }

  const supabase = crearClienteSupabaseAdmin();

  await limpiarVencidasSinBloquear(supabase);

  const [{ data: invitaciones, error: errorInvitaciones }, { data: empresas }, { data: rutas }] =
    await Promise.all([
      supabase
        .from("invitaciones")
        .select(COLUMNAS_LISTADO_INVITACIONES)
        .order("created_at", { ascending: false })
        .returns<InvitacionListadoRow[]>(),
      supabase.from("empresas").select("id, nombre, activo, created_at").returns<EmpresaRow[]>(),
      supabase
        .from("rutas")
        .select("id, empresa_id, nombre, activo, created_at")
        .returns<RutaRow[]>(),
    ]);

  if (errorInvitaciones) {
    return NextResponse.json(
      { mensaje: "No se pudieron obtener las invitaciones.", detalle: errorInvitaciones.message },
      { status: 500 }
    );
  }

  const respuesta: InvitacionesResponse = {
    data: enriquecerInvitacionesListado(invitaciones ?? [], empresas ?? [], rutas ?? []),
  };
  return NextResponse.json(respuesta);
}

// POST /api/invitaciones — "Invitar chofer" (criterio 19). Reemplaza al alta con contraseña
// temporal: acá no se crea ningún usuario de Auth ni fila de choferes, solo la invitación -- el
// propio chofer hace el resto al registrarse (ver crear_chofer_desde_invitacion(), Migración 2,
// todavía no instalada). empresa_id/ruta_id son opcionales y van por id (el admin elige de un
// <Select> del catálogo real, nunca texto libre -- a diferencia de jornadas.empresa/ruta).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sesion = await obtenerAdminSesion(cookieStore.get(NOMBRE_COOKIE_SESION)?.value);
  if (!sesion) {
    return NextResponse.json({ mensaje: "Sesión inválida o expirada." }, { status: 401 });
  }
  const creadaPor = sesion.nombre || sesion.email;

  let body: CrearInvitacionRequest;
  try {
    body = (await request.json()) as CrearInvitacionRequest;
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const empresaId = typeof body.empresaId === "string" && body.empresaId ? body.empresaId : null;
  const rutaId = typeof body.rutaId === "string" && body.rutaId ? body.rutaId : null;

  // Una ruta siempre depende de una empresa (rutas.empresa_id no es nullable) -- no tiene
  // sentido guardar una ruta sin empresa en la invitación: el chofer vería "Ruta asignada: X"
  // sin "Empresa: —" al lado, algo que no puede pasar en el catálogo real.
  if (rutaId && !empresaId) {
    return NextResponse.json(
      { mensaje: "Elegí primero la empresa antes de elegir la ruta." },
      { status: 400 }
    );
  }

  // Datos personales OPCIONALES (criterio 31, ajuste del Hallazgo #51) -- cada campo que vino se
  // valida con la MISMA regla que usará el trigger al consumir la invitación (lib/invitaciones.ts,
  // validarDatosInvitacion): el encargado ve el error antes de generar nada, no recién cuando el
  // chofer intente registrarse.
  const dniNormalizado =
    typeof body.dni === "string" && body.dni.trim() ? normalizarDni(body.dni) : null;
  const nombre = typeof body.nombre === "string" && body.nombre.trim() ? body.nombre.trim() : null;
  const apellidos =
    typeof body.apellidos === "string" && body.apellidos.trim() ? body.apellidos.trim() : null;
  const telefono =
    typeof body.telefono === "string" && body.telefono.trim() ? body.telefono.trim() : null;
  const email =
    typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const fechaNacimiento =
    typeof body.fechaNacimiento === "string" && body.fechaNacimiento.trim()
      ? body.fechaNacimiento.trim()
      : null;

  const errorDatos = validarDatosInvitacion({
    dni: body.dni,
    telefono: body.telefono,
    email: body.email,
    fechaNacimiento: body.fechaNacimiento,
  });
  if (errorDatos) {
    return NextResponse.json({ mensaje: errorDatos }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();

  await limpiarVencidasSinBloquear(supabase);

  // DNI duplicado al invitar (criterio 32) -- comodidad del Dashboard, la garantía real sigue
  // siendo el UNIQUE de choferes.dni y el CHECK/trigger de la base. Primero contra choferes ya
  // dados de alta, después contra otra invitación todavía pendiente con el mismo DNI (mismo
  // criterio de "pendiente" que calcularEstadoInvitacion: sin usar, sin revocar, sin vencer).
  if (dniNormalizado) {
    const { data: choferExistente } = await supabase
      .from("choferes")
      .select("id")
      .eq("dni", dniNormalizado)
      .maybeSingle();
    if (choferExistente) {
      return NextResponse.json({ mensaje: "Ya hay un chofer con ese DNI." }, { status: 409 });
    }

    // .limit(1) en vez de .maybeSingle(): si llegara a haber más de una fila (no debería, pero
    // .maybeSingle() lanza error si encuentra más de una, y este chequeo es una comodidad del
    // Dashboard, no la garantía real -- esa sigue siendo la base), toma la primera sin romper.
    const { data: invitacionesPendientes } = await supabase
      .from("invitaciones")
      .select("id")
      .eq("dni", dniNormalizado)
      .is("usada_at", null)
      .is("revocada_at", null)
      .gt("vence_at", new Date().toISOString())
      .limit(1);
    const invitacionPendiente = invitacionesPendientes?.[0];
    if (invitacionPendiente) {
      return NextResponse.json(
        {
          mensaje: "Ya hay una invitación pendiente para ese DNI.",
          invitacionPendienteId: invitacionPendiente.id,
        },
        { status: 409 }
      );
    }
  }

  // Se valida que empresa/ruta existan de verdad en el catálogo, estén activas, y que la ruta
  // pertenezca a la empresa elegida -- un id inventado, inactivo, o de otra empresa no debe
  // quedar guardado en la invitación: el chofer vería "Ruta asignada: —" (o una combinación que
  // no existe en el catálogo real) sin ninguna pista de qué pasó.
  if (empresaId) {
    const { data: empresa } = await supabase
      .from("empresas")
      .select("id, activo")
      .eq("id", empresaId)
      .maybeSingle();
    if (!empresa) {
      return NextResponse.json({ mensaje: "La empresa elegida no existe." }, { status: 400 });
    }
    if (!empresa.activo) {
      return NextResponse.json({ mensaje: "La empresa elegida está inactiva." }, { status: 400 });
    }
  }
  if (rutaId) {
    const { data: ruta } = await supabase
      .from("rutas")
      .select("id, empresa_id, activo")
      .eq("id", rutaId)
      .maybeSingle();
    if (!ruta) {
      return NextResponse.json({ mensaje: "La ruta elegida no existe." }, { status: 400 });
    }
    if (!ruta.activo) {
      return NextResponse.json({ mensaje: "La ruta elegida está inactiva." }, { status: 400 });
    }
    if (ruta.empresa_id !== empresaId) {
      return NextResponse.json(
        { mensaje: "La ruta elegida no pertenece a la empresa seleccionada." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("invitaciones")
    .insert({
      empresa_id: empresaId,
      ruta_id: rutaId,
      creada_por: creadaPor,
      dni: dniNormalizado,
      nombre,
      apellidos,
      telefono,
      email,
      fecha_nacimiento: fechaNacimiento,
    })
    .select()
    .single<InvitacionRow>();

  if (error || !data) {
    return NextResponse.json(
      { mensaje: "No se pudo generar la invitación.", detalle: error?.message },
      { status: 500 }
    );
  }

  const [{ data: empresas }, { data: rutas }] = await Promise.all([
    supabase.from("empresas").select("id, nombre, activo, created_at").returns<EmpresaRow[]>(),
    supabase
      .from("rutas")
      .select("id, empresa_id, nombre, activo, created_at")
      .returns<RutaRow[]>(),
  ]);
  const [invitacion] = enriquecerInvitaciones([data], empresas ?? [], rutas ?? []);

  const respuesta: CrearInvitacionResponse = {
    mensaje: "Invitación generada correctamente.",
    invitacion,
    mensajeParaCopiar: armarMensajeParaCopiar(
      data.token,
      data.codigo,
      formatFechaHora(data.vence_at),
      data.nombre
    ),
  };
  return NextResponse.json(respuesta);
}
