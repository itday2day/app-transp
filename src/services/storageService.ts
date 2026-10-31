import { supabase } from "@/lib/supabase";
import { envolverErrorConCampos } from "./erroresSync";
import { MetadatoFoto } from "@/types";

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
// spec_adjuntar_foto_galeria.md: `metadata` viaja SIEMPRE que la foto la tenga guardada
// localmente -- incluyendo cada reintento de subida (#29), nunca solo la primera vez. Confirmado
// en la prueba de humo real (Fase 1b de la spec, ya hecha y limpiada): un upsert que omite
// `metadata` sobre un objeto que YA tenía uno lo BORRA entero (reemplaza, nunca mezcla). Para una
// jornada del formato antiguo (sin metadatosFotos local) esto es siempre la primera subida de ese
// objeto -- no hay nada que "borrar" todavía, así que omitir `metadata` ahí es inocuo.
export async function subirEvidencia(uri: string, ruta: string, metadata?: MetadatoFoto): Promise<string> {
  const respuesta = await fetch(uri);
  const blob = await respuesta.blob();

  // upsert: true -- si `ruta` ya existe (reintento tras una subida cortada a medias), esto es un
  // UPDATE de storage.objects, no un INSERT. Necesita la policy de UPDATE de
  // schema_v11_evidencias_reintentables.sql; sin ella, Storage devuelve "new row violates
  // row-level security policy" (confirmado en un dispositivo real, Hallazgo #29).
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    contentType: "image/jpeg",
    upsert: true,
    ...(metadata ? { metadata: { origen: metadata.origen, fechaOriginal: metadata.fechaOriginal } } : {}),
  });
  // Criterio 4 (spec_sync_sin_sesion_no_agota_intentos.md): antes `new Error(...)` a secas perdía
  // `code`/`status`/`statusCode` del StorageError original -- sin ellos, esErrorDeAutenticacion()
  // no podía clasificar este fallo más adelante, en el catch de sincronizarPendientes. El mensaje
  // que ve el usuario no cambia.
  if (error) throw envolverErrorConCampos(`No se pudo subir la evidencia (${ruta}): ${error.message}`, error);

  return obtenerUrlPublicaEvidencia(ruta);
}
