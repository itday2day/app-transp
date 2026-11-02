// spec_validar_archivo_antes_de_subir_foto.md, criterio 5: SIN import del singleton `supabase`
// real (@/lib/supabase importa expo-constants/expo-secure-store, no corre en Node puro) -- mismo
// patrón que authCore.ts: `cliente`/`fetchImpl` son parámetros OBLIGATORIOS (nunca opcionales, sin
// valor por defecto importado), la única forma de inyectar un fetch y un cliente falsos en una
// prueba sin cambiar cómo el resto de la app usa los reales. syncService.ts (el único llamador)
// pasa el `supabase`/`fetch` reales en cada llamada.
import type { SupabaseClient } from "@supabase/supabase-js";
import { envolverErrorConCampos } from "./erroresSync";
import type { MetadatoFoto } from "@/types";

export type ClienteStorage = SupabaseClient;
export type FetchEvidencia = typeof fetch;

const BUCKET = "evidencias";

// spec_validar_archivo_antes_de_subir_foto.md: medido en el Samsung (Galaxy A15, Android 14, Expo
// Go 57.0.9) que fetch(uri) sobre un file:// puede devolver 404 "File not found" (texto plano, 14
// bytes) AUNQUE el archivo exista y sea válido en el dispositivo (confirmado aparte con
// expo-file-system, File.exists/size) -- es un problema de cómo Expo Go lee file:// con su propio
// fetch (OkHttpFileUrlInterceptor.kt), no del archivo en sí. Una foto comprimida real pesa entre
// ~35 y ~120 KB; 2 KB es un mínimo conservador muy por debajo de cualquier foto real y muy por
// encima de un cuerpo de error como este.
const TAMANO_MINIMO_EVIDENCIA_BYTES = 2048;

/** Se lanza cuando la lectura local de una foto (`fetch(uri).blob()`) no produjo un archivo
 * válido -- `respuesta.ok` falso o un tamaño por debajo del mínimo conservador. `syncService` la
 * trata como cualquier otro fallo de subida (ver `sincronizarPendientes`): cuenta como intento, se
 * reintenta hasta `MAX_INTENTOS`, sin pantallas nuevas (spec_validar_archivo_antes_de_subir_foto.md,
 * decisión "opción 1"). */
export class EvidenciaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenciaInvalidaError";
  }
}

/** La URL pública que va a tener (o ya tiene) `ruta` en el bucket `evidencias` — cómputo puro de
 * string, sin red: `getPublicUrl` no confirma que el archivo exista. Se usa para reconocer, ANTES
 * de subir, si una foto puntual ya está subida (spec_sincronizacion_reintentable.md, Parte B) —
 * comparando URLs remotas contra URLs remotas, nunca contra el URI local del archivo en el
 * dispositivo, que es un valor completamente distinto (mismo error que causó la Parte D). */
export function obtenerUrlPublicaEvidencia(ruta: string, cliente: ClienteStorage): string {
  const { data } = cliente.storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

// fetch()/.blob() sobre un uri local (file://) es el único camino que no
// suma un módulo nativo nuevo (expo-file-system exigiría reconstruir el dev
// client) — las fotos ya llegan comprimidas por imageService, así que el
// tamaño no es un problema para este approach. spec_validar_archivo_antes_de_subir_foto.md,
// criterio 6: este mecanismo de lectura NO cambia -- la corrección es validar lo que devuelve,
// no cómo se lee (tocar cómo se lee exigiría probarlo contra un .apk real, fuera de esta spec).
// spec_adjuntar_foto_galeria.md: `metadata` viaja SIEMPRE que la foto la tenga guardada
// localmente -- incluyendo cada reintento de subida (#29), nunca solo la primera vez. Confirmado
// en la prueba de humo real (Fase 1b de la spec, ya hecha y limpiada): un upsert que omite
// `metadata` sobre un objeto que YA tenía uno lo BORRA entero (reemplaza, nunca mezcla). Para una
// jornada del formato antiguo (sin metadatosFotos local) esto es siempre la primera subida de ese
// objeto -- no hay nada que "borrar" todavía, así que omitir `metadata` ahí es inocuo.
export async function subirEvidencia(
  uri: string,
  ruta: string,
  metadata: MetadatoFoto | undefined,
  cliente: ClienteStorage,
  fetchImpl: FetchEvidencia
): Promise<string> {
  const respuesta = await fetchImpl(uri);
  const blob = await respuesta.blob();

  // spec_validar_archivo_antes_de_subir_foto.md, criterio 1: nunca se sube un archivo que no se
  // pudo leer bien -- ni el 404 de 14 bytes medido en Expo Go, ni ningún otro caso donde la
  // lectura local falle de una forma que no lance excepción. No se valida blob.type: en Storage
  // todos los objetos existentes tienen tipo text/plain, no es un dato fiable en este entorno.
  if (!respuesta.ok || blob.size < TAMANO_MINIMO_EVIDENCIA_BYTES) {
    throw new EvidenciaInvalidaError(
      `La evidencia ${ruta} no se pudo leer (status=${respuesta.status}, blob.size=${blob.size} bytes) -- no se sube.`
    );
  }

  // upsert: true -- si `ruta` ya existe (reintento tras una subida cortada a medias), esto es un
  // UPDATE de storage.objects, no un INSERT. Necesita la policy de UPDATE de
  // schema_v11_evidencias_reintentables.sql; sin ella, Storage devuelve "new row violates
  // row-level security policy" (confirmado en un dispositivo real, Hallazgo #29).
  const { error } = await cliente.storage.from(BUCKET).upload(ruta, blob, {
    contentType: "image/jpeg",
    upsert: true,
    ...(metadata ? { metadata: { origen: metadata.origen, fechaOriginal: metadata.fechaOriginal } } : {}),
  });
  // Criterio 4 (spec_sync_sin_sesion_no_agota_intentos.md): antes `new Error(...)` a secas perdía
  // `code`/`status`/`statusCode` del StorageError original -- sin ellos, esErrorDeAutenticacion()
  // no podía clasificar este fallo más adelante, en el catch de sincronizarPendientes. El mensaje
  // que ve el usuario no cambia.
  if (error) throw envolverErrorConCampos(`No se pudo subir la evidencia (${ruta}): ${error.message}`, error);

  return obtenerUrlPublicaEvidencia(ruta, cliente);
}
