import { supabase } from "@/lib/supabase";

const BUCKET = "evidencias";

// fetch()/.blob() sobre un uri local (file://) es el único camino que no
// suma un módulo nativo nuevo (expo-file-system exigiría reconstruir el dev
// client) — las fotos ya llegan comprimidas por imageService, así que el
// tamaño no es un problema para este approach.
export async function subirEvidencia(uri: string, ruta: string): Promise<string> {
  const respuesta = await fetch(uri);
  const blob = await respuesta.blob();

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`No se pudo subir la evidencia (${ruta}): ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}
