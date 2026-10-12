import type { Metadata } from "next";
import { enlaceProfundoInvitacion } from "@/lib/invitaciones";
import { crearClienteSupabaseBrowser } from "@/lib/supabase/client";

// Segunda capa junto con el header real (next.config.ts: Referrer-Policy, X-Robots-Tag) -- este
// <meta name="robots"> cubre a cualquier rastreador o navegador que mire la metadata de la
// página en vez del header HTTP. No hay `referrer` en la metadata porque el header ya lo cubre
// por completo (toda request que dispare el navegador para esta página, no solo las que nacen
// del HTML) y declarar los dos sería redundante sin agregar nada.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// El token viene en la URL y decide qué RPC se llama -- sin esto, Next.js podría servir una
// versión cacheada/pre-renderizada de esta ruta dinámica (misma clase de problema que el
// Cache-Control: no-store de next.config.ts, pero del lado del renderizado, no de la respuesta
// HTTP) y mostrarle a un chofer la empresa/ruta de la invitación de otro.
export const dynamic = "force-dynamic";

// spec_bloque_b_invitacion_registro_login_correo.md (Hallazgo #51), criterio 14.
//
// Pública y dinámica a propósito (dynamic = "force-dynamic" arriba: cada token decide una
// consulta distinta, nunca se sirve cacheada): el chofer la abre desde un enlace sin ninguna
// sesión de administrador (dashboard/proxy.ts la excluye explícitamente del chequeo de cookie).
// Llama a
// validar_invitacion() con la clave ANON (crearClienteSupabaseBrowser, nunca
// crearClienteSupabaseAdmin/service_role -- esta pantalla no tiene por qué poder leer ni escribir
// nada más que lo que esa función ya decide exponer a `anon`). El resultado SOLO se usa para
// mostrar la empresa/ruta cuando la invitación es válida -- nunca para decir "esta invitación no
// existe/venció/ya se usó": la spec pide explícito que esta pantalla no revele si el token existe,
// a diferencia de la pantalla de registro DENTRO de la app (criterio 7), que sí distingue cada
// estado porque ahí el chofer ya pasó por el enlace/código y tiene sentido decírselo.
//
// `token` nunca se loguea: ni un console.log ni un mensaje de error que lo incluya. Si
// validar_invitacion() falla (red, RPC caída), se degrada al mismo contenido genérico que un
// token inválido -- no se propaga la excepción ni se imprime nada con el valor recibido.
export default async function PaginaInvitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let empresaNombre: string | null = null;
  let rutaNombre: string | null = null;
  try {
    const supabase = crearClienteSupabaseBrowser();
    const { data } = await supabase.rpc("validar_invitacion", { p_valor: token });
    const fila = data?.[0];
    if (fila?.estado === "valida") {
      empresaNombre = fila.empresa_nombre ?? null;
      rutaNombre = fila.ruta_nombre ?? null;
    }
  } catch {
    // Degradación silenciosa (ver comentario de arriba) -- el resto de la pantalla sigue igual.
  }

  const enlaceProfundo = enlaceProfundoInvitacion(token);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-12 text-foreground">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div>
          <h1 className="font-display text-2xl font-bold">Invitación de Day2Day</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Te invitaron a registrarte como chofer en la app de Day2Day. Abrí este enlace desde tu
            teléfono para continuar.
          </p>
        </div>

        {(empresaNombre || rutaNombre) && (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
            {empresaNombre && (
              <p>
                Empresa: <span className="font-medium">{empresaNombre}</span>
              </p>
            )}
            {rutaNombre && (
              <p>
                Ruta asignada: <span className="font-medium">{rutaNombre}</span>
              </p>
            )}
          </div>
        )}

        <a
          href={enlaceProfundo}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Abrir en la app
        </a>

        <div className="flex flex-col gap-2 text-left text-sm text-muted-foreground">
          <p className="font-medium text-foreground">¿No tenés la app todavía?</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Instalá la app de Day2Day en tu teléfono (te la comparte Administración).</li>
            <li>
              Abrí la app y tocá &quot;Tengo un código de invitación&quot; en la pantalla de
              ingreso.
            </li>
            <li>
              Si el botón de arriba no abrió la app sola, escribí el código de 8 caracteres que te
              compartió Administración junto con este enlace.
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
