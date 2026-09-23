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

/**
 * Reconcilia el estado local de las jornadas que la app ya dio por
 * sincronizadas contra Supabase — necesario porque un administrador puede
 * cerrar una jornada directo desde el Dashboard ("Corregir", Hallazgo #6),
 * sin pasar nunca por la app: `syncService` hasta acá solo subía cambios
 * locales, nunca bajaba nada, así que esa fila quedaba "abierta" en el
 * celular para siempre aunque en Supabase (la fuente de verdad) ya figurara
 * "cerrada".
 *
 * Se descarta a propósito Supabase Realtime para esto — el proyecto ya
 * tiene un patrón establecido de chequeo periódico para todo lo relacionado
 * a sincronización (ver `NetworkContext.tsx`, cada 15s); sumar una
 * suscripción en tiempo real para este único caso sería una arquitectura
 * paralela e inconsistente, con su propio ciclo de vida de reconexión que
 * mantener.
 *
 * `obtenerJornadasParaReconciliar` ya filtra a propósito por
 * `sincronizacion = 'sincronizado'` — una jornada con cambios locales
 * `pendiente`/`error` se saltea sin tocar, para no arriesgarse a pisar una
 * edición local que la app todavía no subió con lo que diga Supabase en ese
 * momento (limitación conocida y aceptada: requiere que el chofer y un
 * administrador actúen sobre la misma jornada casi al mismo tiempo, un caso
 * raro).
 *
 * Devuelve los ids de las jornadas que efectivamente se cerraron acá (puede
 * ser un arreglo vacío, el caso común) — quien llama lo usa para saber si
 * hace falta avisar a algo más que el estado de esa jornada cambió (ver
 * `NetworkContext.tsx`, que lo usa para que `useSeguimientoGPS` dejé de
 * trackear una jornada recién cerrada aunque el chofer esté en otra
 * pestaña).
 */
export async function reconciliarJornadasAbiertas(choferId: string): Promise<string[]> {
  const candidatas = await obtenerJornadasParaReconciliar(choferId);
  if (candidatas.length === 0) return [];

  const cerradas: string[] = [];

  for (const jornada of candidatas) {
    const { data, error } = await supabase
      .from("jornadas")
      .select(
        "estado, fecha_check_out, lat_final, lng_final, foto_tacometro_final_url, km_final, combustible_final, tuvo_incidencia, tipo_incidencia, detalle_incidencia, fotos_incidencia"
      )
      .eq("id", jornada.id)
      .maybeSingle<FilaJornadaRemota>();

    if (error) {
      console.error(`reconciliarJornadasAbiertas: no se pudo consultar la jornada ${jornada.id}:`, error);
      continue;
    }
    // Sin fila remota (se borró), o sigue abierta de verdad allá — nada que
    // reconciliar todavía.
    if (!data || data.estado !== "cerrada" || !data.fecha_check_out) continue;

    await sobrescribirCierreRemoto(jornada.id, {
      kmFinal: data.km_final,
      combustibleFinal: data.combustible_final,
      fotoTacometroFinalUrl: data.foto_tacometro_final_url,
      latFinal: data.lat_final,
      lngFinal: data.lng_final,
      fechaCheckOut: data.fecha_check_out,
      tuvoIncidencia: data.tuvo_incidencia,
      tipoIncidencia: data.tipo_incidencia,
      detalleIncidencia: data.detalle_incidencia,
      fotosIncidencia: data.fotos_incidencia,
    });
    cerradas.push(jornada.id);
  }

  return cerradas;
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
 * `reconciliarJornadasAbiertas()` (arriba) reconcilia jornadas que la app YA CONOCE — recorre lo
 * que hay en SQLite y pregunta por cada una. Si la base local está vacía (desinstalación, Android
 * limpiando almacenamiento, teléfono nuevo — Hallazgo #5), ese recorrido no tiene nada sobre lo
 * que iterar y devuelve `[]` sin error: funciona perfecto y no encuentra nada, que es distinto de
 * fallar. Por eso esta función existe aparte: consulta a Supabase POR CHOFER, no por id, así
 * encuentra jornadas abiertas que el teléfono nunca llegó a tener.
 *
 * Confirmado por Fase 1 de spec_deudas_app_movil.md: `subirJornada()` (arriba en este archivo)
 * sube las fotos y hace upsert de TODOS los campos de check-in la primera vez que sincroniza,
 * sin importar si la jornada sigue abierta o ya se cerró — no hay ningún campo de check-in que
 * quede pendiente hasta el cierre. Una jornada que llegó a sincronizar al menos una vez antes de
 * perderse localmente se recupera COMPLETA (fotos incluidas), no como un esqueleto. El límite
 * real y sin arreglo posible es el anterior a eso: un check-in hecho sin señal que nunca llegó a
 * sincronizar, en un teléfono que se limpió, no está en ningún lado — no hay nada que recuperar
 * porque no hay nada guardado.
 *
 * Nunca pisa lo local: solo INSERTA jornadas cuyo id no existe todavía en SQLite (ver
 * `idsJornadasExistentes`) — si el teléfono ya tiene una jornada abierta (la misma u otra
 * distinta), esa se queda exactamente como está, sin tocar. Identifica "la misma jornada" por
 * `id` (el uuid generado en el dispositivo al hacer check-in, columna primary key tanto acá como
 * en Supabase) — no hay otro campo que sirva mejor para esto.
 */
export async function recuperarJornadasAbiertas(choferId: string): Promise<Jornada[]> {
  const { data, error } = await supabase
    .from("jornadas")
    .select(
      "id, chofer_nombre, empresa, matricula, ruta, incidencias, km_inicial, combustible_inicial, foto_tacometro_inicial_url, foto_ruta_url, lat_inicial, lng_inicial, fecha_check_in"
    )
    .eq("chofer_id", choferId)
    .eq("estado", "abierta")
    .returns<FilaJornadaAbiertaRemota[]>();

  if (error) {
    console.error(`recuperarJornadasAbiertas: no se pudo consultar jornadas del chofer ${choferId}:`, error);
    return [];
  }
  if (!data || data.length === 0) return [];

  const existentes = await idsJornadasExistentes(data.map((fila) => fila.id));
  const faltantes = data.filter((fila) => !existentes.has(fila.id));
  if (faltantes.length === 0) return [];

  const recuperadas: Jornada[] = [];
  for (const fila of faltantes) {
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

  return recuperadas;
}
