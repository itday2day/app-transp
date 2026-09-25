import { supabase } from "@/lib/supabase";

const BUCKET = "evidencias";

/** La URL pública que va a tener (o ya tiene) `ruta` en el bucket `evidencias` — cómputo puro de
 * string, sin red: `getPublicUrl` no confirma que el archivo exista. Se usa para reconocer, ANTES
 * de subir, si una foto puntual ya está subida (spec_sincronizacion_reintentable.md, Parte B) —
 * comparando URLs remotas contra URLs remotas, nunca contra el URI local del archivo en el
 * dispositivo, que es un valor completamente distinto (mismo error que causó la Parte D). */
export function obtenerUrlPublicaEvidencia(ruta: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

// fetch()/.blob() sobre un uri local (file://) es el único camino que no
// suma un módulo nativo nuevo (expo-file-system exigiría reconstruir el dev
// client) — las fotos ya llegan comprimidas por imageService, así que el
// tamaño no es un problema para este approach.
export async function subirEvidencia(uri: string, ruta: string): Promise<string> {
  const respuesta = await fetch(uri);
  const blob = await respuesta.blob();

  // upsert: true -- si `ruta` ya existe (reintento tras una subida cortada a medias), esto es un
  // UPDATE de storage.objects, no un INSERT. Necesita la policy de UPDATE de
  // schema_v11_evidencias_reintentables.sql; sin ella, Storage devuelve "new row violates
  // row-level security policy" (confirmado en un dispositivo real, Hallazgo #29).
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`No se pudo subir la evidencia (${ruta}): ${error.message}`);

  return obtenerUrlPublicaEvidencia(ruta);
}
