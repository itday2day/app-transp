import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

// spec_aviso_version_y_pagina_actualizar.md, Fase 2, criterios 11-14: página de servidor, SIN
// sesión (excluida en proxy.ts, igual que /invitacion/[token]), con la misma tarjeta e identidad
// visual de esa página (reutiliza sus clases Tailwind, no su lógica de portapapeles -- criterio 13,
// esta página no copia nada al portapapeles).
export const metadata: Metadata = {
  // robots: noindex/nofollow (revisión de César, 2026-11-04) -- misma cautela que
  // /invitacion/[token] (criterio 14 de ese Hallazgo): una página de distribución de un .apk no
  // tiene nada que ganar apareciendo en buscadores, y sí un motivo para no aparecer (un rastreador
  // descargando el .apk repetidamente, o la página indexada fuera de contexto).
  robots: { index: false, follow: false },
  title: "Actualiza la app de Day2Day",
  description: "Pasos para instalar la última versión de la app de Day2Day.",
};

// dynamic = "force-dynamic" (igual que /invitacion/[token]): el botón tiene que reflejar SIEMPRE
// la fila real de app_version, nunca una versión pre-renderizada/cacheada que ofrezca un .apk
// viejo (criterio 11, "sin caché").
export const dynamic = "force-dynamic";

// Ruta de respaldo si la lectura de app_version falla o la fila no existe (criterio 11): el botón
// NUNCA debe quedar roto -- cae al mismo .apk que ya ofrece la página de invitación.
const RUTA_APK_RESPALDO = "/storage/v1/object/public/builds/app-transp-latest.apk";

// Solo lee `url_apk` de la fila `android` de `app_version`, con la clave pública (anon) -- la
// misma tabla que lee la app, sin usar el cliente server-only (service_role) del resto del
// Dashboard: esta página no necesita bypassear RLS, la fila ya es de lectura pública (schema_v27).
// Sin tipar contra `Database` (database.types.ts no conoce `app_version` hasta que se corra
// `npm run types:supabase` DESPUÉS de aplicar la migración -- fuera de esta tarea) -- cliente
// genérico a propósito.
async function obtenerUrlApk(supabaseUrl: string, anonKey: string): Promise<string> {
  const fallback = `${supabaseUrl}${RUTA_APK_RESPALDO}`;
  try {
    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase
      .from("app_version")
      .select("url_apk")
      .eq("plataforma", "android")
      .maybeSingle();

    if (error || !data?.url_apk) return fallback;
    return data.url_apk as string;
  } catch {
    // Mejor esfuerzo (criterio 11): sin conexión, tabla ausente o cualquier otro fallo -- la
    // página sigue funcionando, nunca se cae.
    return fallback;
  }
}

export default async function PaginaActualizar() {
  // NEXT_PUBLIC_* se incrusta en el build -- mismo patrón de fallo temprano y legible que
  // app/invitacion/[token]/page.tsx (se prueba con `next build`, no alcanza con `next dev`).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno."
    );
  }

  const enlaceDescarga = await obtenerUrlApk(supabaseUrl, anonKey);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-foreground">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold">Actualiza la app de Day2Day</h1>
        </div>

        <div className="flex flex-col gap-2 text-left">
          <h2 className="text-base font-semibold text-foreground">1. Antes de actualizar</h2>
          <p className="text-base text-muted-foreground">
            Antes de actualizar, abre la app y comprueba que no te quede nada pendiente de enviar.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-left">
          <h2 className="text-base font-semibold text-foreground">2. Descargar la app</h2>
          <p className="text-base text-muted-foreground">
            Pulsa el botón. El teléfono mostrará avisos normales: pulsa{" "}
            <strong className="font-semibold text-foreground">«Descargar de todos modos»</strong>,
            luego <strong className="font-semibold text-foreground">«Instalar»</strong> y, si
            aparece Play Protect, pulsa el enlace pequeño{" "}
            <strong className="font-semibold text-foreground">«Instalar sin analizar»</strong>.
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
          <h2 className="text-base font-semibold text-foreground">3. No desinstales</h2>
          <p className="text-base text-muted-foreground">
            No desinstales la app anterior: la nueva se instala encima y conserva tus datos.
          </p>
        </div>
      </div>
    </main>
  );
}
