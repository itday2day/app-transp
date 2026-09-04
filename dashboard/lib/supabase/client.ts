import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con la clave anon/publicable, pensado para el navegador.
 * Respeta RLS. Hoy el Dashboard no autentica choferes ni lee tablas de
 * negocio directamente con este cliente (todo pasa por Route Handlers con la
 * service_role key) — se deja disponible para un futuro login de chofer o
 * cualquier lectura que sí deba respetar RLS desde el cliente.
 */
export function crearClienteSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno."
    );
  }

  return createClient(url, anonKey);
}
