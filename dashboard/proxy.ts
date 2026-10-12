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
  // /invitacion/{token} (Hallazgo #51, criterio 14): pública y estática a propósito -- el chofer
  // la abre desde un enlace sin ninguna sesión de administrador. No llama a service_role ni
  // revela si el token existe (ver app/invitacion/[token]/page.tsx); exigirle la cookie de admin
  // acá simplemente la dejaría inalcanzable para quien tiene que verla. `invitacion/[^/]+$`, con
  // el `$` al final: sin él, la alternativa adentro de un lookahead solo necesita matchear como
  // PREFIJO, no como el resto completo de la URL -- "/invitacion/abc/lo-que-sea" también hubiera
  // quedado público, no solo "/invitacion/{token}". Con el `$`, solo matchea si "invitacion/" +
  // un único segmento sin más barras es TODO lo que queda del path -- ni un `/invitacion` suelto
  // (sin token) ni nada con un segmento de más.
  matcher: [
    "/((?!login|invitacion/[^/]+$|api/auth|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|otf)$).*)",
  ],
};
