import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con la service_role key: salta Row Level Security.
 *
 * SOLO se importa desde Route Handlers (app/api/**\/route.ts). El paquete
 * `server-only` hace que cualquier intento de importar este módulo desde un
 * Client Component (o desde cualquier código que termine en el bundle del
 * navegador) falle en build con un error explícito, en vez de filtrar la
 * service_role key silenciosamente.
 */
export function crearClienteSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
