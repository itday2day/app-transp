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
  // Protege todo excepto /login, las rutas de auth (login/logout), los
  // assets estáticos internos de Next.js, y los archivos sueltos de /public
  // (spec_identidad_visual_day2day_enmienda.md, Hallazgo #41: el pedido que
  // hace el propio optimizador de next/image a /logo-blanco.png pasaba por
  // este proxy sin cookie de sesión en ese contexto y volvía el HTML de
  // /login en vez de la imagen — 400 en /_next/image, logo roto en todos
  // lados). Exclusión por extensión, no por nombre de archivo: así cubre
  // cualquier asset que se agregue después a /public sin tener que volver a
  // tocar este matcher.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|otf)$).*)",
  ],
};
