import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_SESION } from "@/lib/auth";

export async function POST() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(NOMBRE_COOKIE_SESION, "", { path: "/", maxAge: 0 });
  return respuesta;
}
