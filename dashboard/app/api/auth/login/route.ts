import { NextResponse } from "next/server";
import { contrasenaEsCorrecta, crearValorCookieSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth";

const UN_DIA_EN_SEGUNDOS = 60 * 60 * 24;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ mensaje: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { password: unknown }).password
      : undefined;

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ mensaje: "Falta la contraseña." }, { status: 400 });
  }

  if (!contrasenaEsCorrecta(password)) {
    return NextResponse.json({ mensaje: "Contraseña incorrecta." }, { status: 401 });
  }

  const valorCookie = await crearValorCookieSesion();
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
