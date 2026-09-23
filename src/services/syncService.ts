import { supabase } from "@/lib/supabase";
import { subirEvidencia } from "./storageService";
import {
  obtenerPendientesSincronizacion,
  obtenerJornadasParaReconciliar,
  sobrescribirCierreRemoto,
  marcarComoSincronizado,
  marcarErrorSincronizacion,
  marcarSincronizando,
  actualizarUrlsFotos,
  idsJornadasExistentes,
  insertarJornadaRecuperada,
  JornadaAbiertaRemota,
} from "@/db/jornadasRepo";
import { EstadoJornada, Jornada, NivelCombustible, TipoIncidencia, UrlsFotosJornada } from "@/types";

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
 * true si hay al menos una jornada que `sincronizarPendientes(forzarReintento)`
 * intentaría subir — mismo criterio de MAX_INTENTOS que esa función, para que
 * ambas coincidan siempre. Se usa en NetworkContext para no prender el banner
 * "Sincronizando…" cuando, en la práctica, no hay nada que hacer (ver
 * comentario ahí: antes parpadeaba cada 15s aunque la app estuviera al día).
 */
export async function hayJornadasPendientes(forzarReintento = false): Promise<boolean> {
  const pendientes = await obtenerPendientesSincronizacion();
  return pendientes.some((j) => forzarReintento || j.intentosSincronizacion < MAX_INTENTOS);
}

/**
 * Recorre las jornadas guardadas localmente que aún no llegaron a Supabase
 * y las sube una por una. Diseñado para llamarse cada vez que vuelve la
 * conexión, sin bloquear la interfaz del chofer.
 *
 * `forzarReintento` ignora el tope de MAX_INTENTOS — sin esto, una jornada
 * que agotó sus 5 intentos automáticos (algo que puede pasar en menos de un
 * minuto, ver INTERVALO_REVISION_MS en NetworkContext) queda atascada para
 * siempre, sin ninguna forma de reintentarla desde la app. Se usa para el
 * pull-to-refresh explícito de HistorialScreen — el chofer pidiendo
 * reintentar a propósito debe poder hacerlo, aunque el auto-sync de fondo ya
 * se haya rendido con esa jornada.
 */
export async function sincronizarPendientes(
  forzarReintento = false
): Promise<{ exitosas: number; fallidas: number }> {
  const pendientes = await obtenerPendientesSincronizacion();
  let exitosas = 0;
  let fallidas = 0;

  for (const jornada of pendientes) {
    if (!forzarReintento && jornada.intentosSincronizacion >= MAX_INTENTOS) continue;

    try {
      await marcarSincronizando(jornada.id);
      await subirJornada(jornada);
      await marcarComoSincronizado(jornada.id);
      exitosas += 1;
    } catch (err) {
      // Antes se descartaba el error sin loguearlo — imposible diagnosticar
      // por qué una jornada específica no sincronizaba nunca (ni para el
      // chofer, ni revisando el código). Con matrícula/id en el log se puede
      // cruzar directo contra la fila real en Supabase.
      console.error(
        `sincronizarPendientes: falló la jornada ${jornada.id} (${jornada.matricula}, intento ${jornada.intentosSincronizacion + 1}/${MAX_INTENTOS}):`,
        err
      );
      await marcarErrorSincronizacion(jornada.id);
      fallidas += 1;
    }
  }

  return { exitosas, fallidas };
}

/** Forma de la fila que interesa de `jornadas` en Supabase para reconciliar
 * — subconjunto de columnas, tal como las devuelve supabase-js (snake_case,
 * sin transformar). */
interface FilaJornadaRemota {
  estado: EstadoJornada;
  fecha_check_out: string | null;
  lat_final: number | null;
  lng_final: number | null;
  foto_tacometro_final_url: string | null;
  km_final: number | null;
  combustible_final: NivelCombustible | null;
  tuvo_incidencia: boolean | null;
  tipo_incidencia: TipoIncidencia | null;
  detalle_incidencia: string | null;
  fotos_incidencia: string[] | null;
}

/** Forma de la fila que interesa de `jornadas` en Supabase para recuperar una jornada abierta —
 * solo las columnas de CHECK-IN (una jornada abierta no tiene nada de check-out que traer). */
interface FilaJornadaAbiertaRemota {
  id: string;
  chofer_nombre: string;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias: string | null;
  km_inicial: number;
  combustible_inicial: NivelCombustible;
  foto_tacometro_inicial_url: string;
  foto_ruta_url: string | null;
  lat_inicial: number;
  lng_inicial: number;
  fecha_check_in: string;
}

/**
 * ⚠️ Consolida en una sola función (spec_correccion_gana_dashboard.md, Fase 1 punto 4) lo que
 * antes eran dos mecanismos separados con el mismo propósito de fondo ("bajar del servidor algo
 * que el teléfono no sabe"): `reconciliarJornadasAbiertas()` (recorría lo que SQLite ya tenía
 * localmente, una por una, preguntando si Supabase la había cerrado — Hallazgo #9) y
 * `recuperarJornadasAbiertas()` (consultaba por chofer las jornadas abiertas que el teléfono no
 * tenía — Hallazgo #27, ver ese commit para el porqué "por chofer" y no "por id"). Dos
 * implementaciones del mismo criterio fue lo que causó el Hallazgo #21; sumar un tercer camino acá
 * hubiera sido peor. Este commit es refactor puro — mismo comportamiento exacto que las dos
 * funciones que reemplaza, solo unificadas en un único punto de entrada. La spec de este commit
 * (correccion_gana_dashboard.md) extiende esta misma función en un commit aparte para bajar
 * también correcciones de campo — separado a propósito, para que una regresión se pueda atribuir a
 * uno de los dos commits, no a los dos mezclados.
 *
 * Sigue las dos guardas que ya tenían las funciones originales, sin relajar ninguna:
 *   - Reconciliar el cierre remoto de una jornada local solo si esa jornada está
 *     `sincronizacion = 'sincronizado'` (ver `obtenerJornadasParaReconciliar`) — una con cambios
 *     locales `pendiente`/`error` se saltea sin tocar, para no arriesgarse a pisar una edición
 *     local que la app todavía no subió.
 *   - Recuperar (insertar) una jornada abierta remota solo si su id no existe YA en SQLite (ver
 *     `idsJornadasExistentes`) — nunca se pisa una fila local existente, se identifica "la misma
 *     jornada" por `id` (el uuid generado en el dispositivo, primary key en los dos lados).
 */
export async function sincronizarCambiosDelServidor(
  choferId: string
): Promise<{ recuperadas: Jornada[]; cerradasRemoto: string[] }> {
  // Parte 1 (antes reconciliarJornadasAbiertas): candidatas locales abiertas+sincronizadas,
  // reconsultadas por id para ver si Supabase ya las cerró (Hallazgo #6, "Corregir" desde el
  // Dashboard con fecha de cierre).
  const candidatasLocales = await obtenerJornadasParaReconciliar(choferId);
  const cerradasRemoto: string[] = [];

  if (candidatasLocales.length > 0) {
    const { data, error } = await supabase
      .from("jornadas")
      .select(
        "id, estado, fecha_check_out, lat_final, lng_final, foto_tacometro_final_url, km_final, combustible_final, tuvo_incidencia, tipo_incidencia, detalle_incidencia, fotos_incidencia"
      )
      .in(
        "id",
        candidatasLocales.map((j) => j.id)
      )
      .returns<(FilaJornadaRemota & { id: string })[]>();

    if (error) {
      console.error(
        `sincronizarCambiosDelServidor: no se pudieron consultar las candidatas del chofer ${choferId}:`,
        error
      );
    } else {
      for (const fila of data ?? []) {
        // Sin fila remota (se borró), o sigue abierta de verdad allá — nada que reconciliar
        // todavía.
        if (fila.estado !== "cerrada" || !fila.fecha_check_out) continue;
        await sobrescribirCierreRemoto(fila.id, {
          kmFinal: fila.km_final,
          combustibleFinal: fila.combustible_final,
          fotoTacometroFinalUrl: fila.foto_tacometro_final_url,
          latFinal: fila.lat_final,
          lngFinal: fila.lng_final,
          fechaCheckOut: fila.fecha_check_out,
          tuvoIncidencia: fila.tuvo_incidencia,
          tipoIncidencia: fila.tipo_incidencia,
          detalleIncidencia: fila.detalle_incidencia,
          fotosIncidencia: fila.fotos_incidencia,
        });
        cerradasRemoto.push(fila.id);
      }
    }
  }

  // Parte 2 (antes recuperarJornadasAbiertas): jornadas abiertas del chofer en Supabase que el
  // teléfono nunca llegó a conocer — confirmado en Fase 1 de spec_deudas_app_movil.md que
  // `subirJornada()` sube TODOS los campos de check-in (fotos incluidas) la primera vez que
  // sincroniza, así que una jornada recuperada llega completa, no como un esqueleto.
  const { data: abiertasRemoto, error: errorAbiertas } = await supabase
    .from("jornadas")
    .select(
      "id, chofer_nombre, empresa, matricula, ruta, incidencias, km_inicial, combustible_inicial, foto_tacometro_inicial_url, foto_ruta_url, lat_inicial, lng_inicial, fecha_check_in"
    )
    .eq("chofer_id", choferId)
    .eq("estado", "abierta")
    .returns<FilaJornadaAbiertaRemota[]>();

  const recuperadas: Jornada[] = [];
  if (errorAbiertas) {
    console.error(
      `sincronizarCambiosDelServidor: no se pudieron consultar jornadas abiertas del chofer ${choferId}:`,
      errorAbiertas
    );
  } else if (abiertasRemoto && abiertasRemoto.length > 0) {
    const existentes = await idsJornadasExistentes(abiertasRemoto.map((fila) => fila.id));
    for (const fila of abiertasRemoto) {
      if (existentes.has(fila.id)) continue;
      const remoto: JornadaAbiertaRemota = {
        id: fila.id,
        choferId,
        choferNombre: fila.chofer_nombre,
        empresa: fila.empresa,
        matricula: fila.matricula,
        ruta: fila.ruta,
        incidencias: fila.incidencias,
        kmInicial: fila.km_inicial,
        combustibleInicial: fila.combustible_inicial,
        fotoTacometroInicialUrl: fila.foto_tacometro_inicial_url,
        fotoRutaUrl: fila.foto_ruta_url,
        latInicial: fila.lat_inicial,
        lngInicial: fila.lng_inicial,
        fechaCheckIn: fila.fecha_check_in,
      };
      recuperadas.push(await insertarJornadaRecuperada(remoto));
    }
  }

  return { recuperadas, cerradasRemoto };
}
