import type { Metadata } from "next";
import { headers } from "next/headers";
import { enlaceInvitacion } from "@/lib/invitaciones";

// Segunda capa junto con el header real (next.config.ts: Referrer-Policy, X-Robots-Tag) -- este
// <meta name="robots"> cubre a cualquier rastreador o navegador que mire la metadata de la
// página en vez del header HTTP.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// El token decide qué enlaces se arman -- sin esto, Next.js podría servir una versión
// cacheada/pre-renderizada de esta ruta dinámica (misma clase de problema que el
// Cache-Control: no-store de next.config.ts, pero del lado del renderizado).
export const dynamic = "force-dynamic";

// Debe actualizarse a mano si cambia `android.package` en app.json (Fase 1 del Paso C,
// confirmado: hoy es "com.day2day.apptransp") -- el Dashboard no puede leer ese archivo en build
// ni en runtime, son proyectos separados.
const PAQUETE_ANDROID = "com.day2day.apptransp";

// Ruta constante del .apk en el bucket público de Supabase Storage (schema_v22_bucket_builds.sql,
// todavía sin aplicar) -- nunca el id del proyecto escrito a mano (criterio 44).
const RUTA_APK = "/storage/v1/object/public/builds/app-transp-latest.apk";

function detectarPlataforma(userAgent: string): "android" | "ios" | "otro" {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPod|iPad/i.test(userAgent)) return "ios";
  return "otro";
}

// Hallazgo #51, criterio 41: sin acceso a la base ni a `service_role` -- con cualquier token
// (válido, inexistente, vencido, usado, revocado, vacío o basura) esta página se ve exactamente
// igual. El token solo se usa para armar los dos enlaces de abajo, siempre pasado por
// encodeURIComponent, nunca validado ni mostrado en pantalla ni logueado.
export default async function PaginaInvitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // NEXT_PUBLIC_* se incrusta en el build -- si falta acá, el build entero debe fallar de forma
  // legible (mismo patrón que lib/supabase/client.ts) en vez de renderizar un enlace de descarga
  // roto ("undefined/storage/..."). Se prueba con `next build`, no alcanza con `next dev`.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en las variables de entorno.");
  }

  const userAgent = (await headers()).get("user-agent") ?? "";
  const plataforma = detectarPlataforma(userAgent);

  const tokenCodificado = encodeURIComponent(token);
  const enlaceDescarga = `${supabaseUrl}${RUTA_APK}`;
  // Ajuste 1 de la Resolución de la Fase 1: el enlace de reserva lleva #paso-1 -- si la app no
  // está instalada, Chrome vuelve a esta página ya situada en el paso 1, no recargada desde cero.
  const enlaceReserva = encodeURIComponent(`${enlaceInvitacion(token)}#paso-1`);
  // Forma intent:// (criterio 45) -- la variante apptransp://invitacion/{token} (ver
  // enlaceProfundoInvitacion en lib/invitaciones.ts) queda lista para reemplazar esta si la
  // prueba 35 en un Android real muestra que funciona mejor desde WhatsApp/Chrome.
  const enlaceAbrir = `intent://invitacion/${tokenCodificado}#Intent;scheme=apptransp;package=${PAQUETE_ANDROID};S.browser_fallback_url=${enlaceReserva};end;`;

  if (plataforma === "ios") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-foreground">
        <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="font-display text-2xl font-bold">Te invitamos a la app de Day2Day</h1>
          <p className="text-base text-muted-foreground">
            La app de Day2Day todavía no está disponible para iPhone.
          </p>
          <p className="text-base text-muted-foreground">
            Por ahora solo funciona en teléfonos Android. Avisa a la persona que te envió el enlace.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-foreground">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold">Te invitamos a la app de Day2Day</h1>
          {plataforma === "otro" ? (
            <p className="text-base text-muted-foreground">
              Abre este enlace desde tu teléfono Android.
            </p>
          ) : (
            <p className="text-base text-muted-foreground">
              Sigue estos dos pasos desde este teléfono.
            </p>
          )}
        </div>

        <div id="paso-1" className="flex flex-col gap-2 text-left">
          <h2 className="text-base font-semibold text-foreground">1. Descargar la app</h2>
          <p className="text-base text-muted-foreground">
            Pulsa el botón y espera a que termine la descarga. Si el teléfono pregunta, permite
            instalar desde este navegador.
          </p>
          <a
            href={enlaceDescarga}
            rel="noreferrer noopener"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Descargar la app
          </a>
        </div>

        <div className="flex flex-col gap-2 text-left">
          <h2 className="text-base font-semibold text-foreground">2. Abrir la app</h2>
          <p className="text-base text-muted-foreground">
            Cuando esté instalada, pulsa este botón y sigue los pasos. Te llegará un código por
            correo.
          </p>
          <a
            href={enlaceAbrir}
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Abrir la app
          </a>
        </div>

        <p className="text-base text-muted-foreground">
          ¿No se abre? Abre la app desde tu lista de aplicaciones y escribe el código de 8
          caracteres que venía en el mensaje.
        </p>
      </div>
    </main>
  );
}
