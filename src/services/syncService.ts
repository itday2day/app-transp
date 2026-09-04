import { supabase } from "@/lib/supabase";
import { subirEvidencia } from "./storageService";
import {
  obtenerPendientesSincronizacion,
  marcarComoSincronizado,
  marcarErrorSincronizacion,
  marcarSincronizando,
  actualizarUrlsFotos,
} from "@/db/jornadasRepo";
import { Jornada, UrlsFotosJornada } from "@/types";

const MAX_INTENTOS = 5;

async function subirJornada(jornada: Jornada): Promise<void> {
  // Solo sube las fotos que todavía no tienen URL pública — evita re-subir en
  // reintentos (una jornada puede fallar el paso de la fila y reintentarse
  // con las fotos ya subidas en el intento anterior).
  const urlsNuevas: UrlsFotosJornada = {};

  if (!jornada.fotoCheckInUrl) {
    urlsNuevas.fotoCheckInUrl = await subirEvidencia(
      jornada.fotoTacometroInicialUri,
      `${jornada.choferId}/${jornada.id}-inicial.jpg`
    );
  }
  if (jornada.fotoRutaUri && !jornada.fotoRutaUrl) {
    urlsNuevas.fotoRutaUrl = await subirEvidencia(
      jornada.fotoRutaUri,
      `${jornada.choferId}/${jornada.id}-ruta.jpg`
    );
  }
  if (jornada.estado === "cerrada" && jornada.fotoTacometroFinalUri && !jornada.fotoCheckOutUrl) {
    urlsNuevas.fotoCheckOutUrl = await subirEvidencia(
      jornada.fotoTacometroFinalUri,
      `${jornada.choferId}/${jornada.id}-final.jpg`
    );
  }

  // Simplificación consciente: a diferencia de tacómetro/ruta (que rastrean
  // cada foto individual), acá se suben todas juntas o se reintenta el lote
  // completo — no se rastrea qué foto individual ya se subió en un intento
  // parcial anterior. upload(..., {upsert:true}) sobre la misma ruta hace que
  // reintentar no duplique nada, solo repita trabajo si falló a medias.
  const fotosIncidenciaLocales = jornada.fotosIncidenciaUris ?? [];
  let fotosIncidenciaNuevas: string[] | undefined;
  if (fotosIncidenciaLocales.length > 0 && !jornada.fotosIncidencia?.length) {
    fotosIncidenciaNuevas = await Promise.all(
      fotosIncidenciaLocales.map((uri, indice) =>
        subirEvidencia(uri, `${jornada.choferId}/${jornada.id}-incidencia-${indice}.jpg`)
      )
    );
    urlsNuevas.fotosIncidencia = JSON.stringify(fotosIncidenciaNuevas);
  }

  if (Object.keys(urlsNuevas).length > 0) {
    await actualizarUrlsFotos(jornada.id, urlsNuevas);
  }

  const fotoCheckInUrl = jornada.fotoCheckInUrl ?? urlsNuevas.fotoCheckInUrl;
  const fotoRutaUrl = jornada.fotoRutaUrl ?? urlsNuevas.fotoRutaUrl;
  const fotoCheckOutUrl = jornada.fotoCheckOutUrl ?? urlsNuevas.fotoCheckOutUrl;
  const fotosIncidencia = jornada.fotosIncidencia?.length ? jornada.fotosIncidencia : fotosIncidenciaNuevas;

  const fila = {
    id: jornada.id,
    chofer_id: jornada.choferId,
    chofer_nombre: jornada.choferNombre,
    empresa: jornada.empresa,
    matricula: jornada.matricula,
    ruta: jornada.ruta,
    incidencias: jornada.incidencias || null,
    km_inicial: jornada.kmInicial,
    combustible_inicial: jornada.combustibleInicial,
    foto_tacometro_inicial_url: fotoCheckInUrl,
    foto_ruta_url: fotoRutaUrl ?? null,
    lat_inicial: jornada.latInicial,
    lng_inicial: jornada.lngInicial,
    fecha_check_in: jornada.fechaCheckIn,
    estado: jornada.estado,
    ...(jornada.estado === "cerrada"
      ? {
          km_final: jornada.kmFinal,
          combustible_final: jornada.combustibleFinal,
          foto_tacometro_final_url: fotoCheckOutUrl ?? null,
          lat_final: jornada.latFinal,
          lng_final: jornada.lngFinal,
          fecha_check_out: jornada.fechaCheckOut,
          tuvo_incidencia: jornada.tuvoIncidencia ?? null,
          tipo_incidencia: jornada.tipoIncidencia ?? null,
          detalle_incidencia: jornada.detalleIncidencia ?? null,
          fotos_incidencia: fotosIncidencia?.length ? fotosIncidencia : null,
        }
      : {}),
  };

  const { error } = await supabase.from("jornadas").upsert(fila);
  if (error) throw new Error(`Fallo al sincronizar jornada ${jornada.id}: ${error.message}`);
}

/**
 * Recorre las jornadas guardadas localmente que aún no llegaron a Supabase
 * y las sube una por una. Diseñado para llamarse cada vez que vuelve la
 * conexión, sin bloquear la interfaz del chofer.
 */
export async function sincronizarPendientes(): Promise<{ exitosas: number; fallidas: number }> {
  const pendientes = await obtenerPendientesSincronizacion();
  let exitosas = 0;
  let fallidas = 0;

  for (const jornada of pendientes) {
    if (jornada.intentosSincronizacion >= MAX_INTENTOS) continue;

    try {
      await marcarSincronizando(jornada.id);
      await subirJornada(jornada);
      await marcarComoSincronizado(jornada.id);
      exitosas += 1;
    } catch {
      await marcarErrorSincronizacion(jornada.id);
      fallidas += 1;
    }
  }

  return { exitosas, fallidas };
}
