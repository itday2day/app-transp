import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION, obtenerAdminSesion } from "@/lib/auth";
import { armarMensajeParaCopiar, enriquecerInvitaciones } from "@/lib/invitaciones";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import { formatFechaHora } from "@/lib/utils";
import type {
  CrearInvitacionRequest,
  CrearInvitacionResponse,
  EmpresaRow,
  InvitacionesResponse,
  InvitacionRow,
  RutaRow,
} from "@/lib/types";

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

  const [{ data: invitaciones, error: errorInvitaciones }, { data: empresas }, { data: rutas }] =
    await Promise.all([
      supabase
        .from("invitaciones")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<InvitacionRow[]>(),
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
    data: enriquecerInvitaciones(invitaciones ?? [], empresas ?? [], rutas ?? []),
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

  const supabase = crearClienteSupabaseAdmin();

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
    .insert({ empresa_id: empresaId, ruta_id: rutaId, creada_por: creadaPor })
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
      formatFechaHora(data.vence_at)
    ),
  };
  return NextResponse.json(respuesta);
}
