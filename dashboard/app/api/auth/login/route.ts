import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { crearValorCookieSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth";
import { crearClienteSupabaseAdmin } from "@/lib/supabase/server";
import type { AdminRow } from "@/lib/types";

const UN_DIA_EN_SEGUNDOS = 60 * 60 * 24;

// Mensaje genérico a propósito tanto si el correo no existe, el admin está
// inactivo, o la contraseña no coincide — no da pistas de cuál de los tres
// pasó (evita enumeración de correos válidos).
const MENSAJE_CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const email =
    typeof body === "object" && body !== null && "email" in body
      ? (body as { email: unknown }).email
      : undefined;
  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { password: unknown }).password
      : undefined;

  if (typeof email !== "string" || email.trim().length === 0) {
    return NextResponse.json({ mensaje: "Falta el correo." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ mensaje: "Falta la contraseña." }, { status: 400 });
  }

  const supabase = crearClienteSupabaseAdmin();
  const { data: admin, error } = await supabase
    .from("admins")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle<AdminRow>();

  if (error) {
    return NextResponse.json(
      { mensaje: "No se pudo validar las credenciales.", detalle: error.message },
      { status: 500 }
    );
  }

  if (!admin || !admin.activo) {
    return NextResponse.json({ mensaje: MENSAJE_CREDENCIALES_INVALIDAS }, { status: 401 });
  }

  const contrasenaCorrecta = await bcrypt.compare(password, admin.password_hash);
  if (!contrasenaCorrecta) {
    return NextResponse.json({ mensaje: MENSAJE_CREDENCIALES_INVALIDAS }, { status: 401 });
  }

  await supabase
    .from("admins")
    .update({ ultimo_acceso: new Date().toISOString() })
    .eq("id", admin.id);

  const valorCookie = await crearValorCookieSesion({
    id: admin.id,
    email: admin.email,
    nombre: admin.nombre,
  });
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(NOMBRE_COOKIE_SESION, valorCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: UN_DIA_EN_SEGUNDOS * 7,
  });
  return respuesta;
}
