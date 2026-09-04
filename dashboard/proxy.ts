import { NextResponse, type NextRequest } from "next/server";
import { esCookieSesionValida, NOMBRE_COOKIE_SESION } from "@/lib/auth";

// Next.js 16 renombró la convención "middleware" a "proxy" (mismo mecanismo:
// corre antes de resolver la ruta, en runtime Edge por defecto). Protege
// todas las rutas del Dashboard exigiendo la cookie de sesión de admin.
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(NOMBRE_COOKIE_SESION)?.value;
  const autenticado = await esCookieSesionValida(cookie);

  if (!autenticado) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protege todo excepto /login, las rutas de auth (login/logout) y los
  // assets estáticos internos de Next.js.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
