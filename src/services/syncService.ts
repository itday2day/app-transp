import { supabase } from "@/lib/supabase";
import { subirEvidencia } from "./storageService";
import { guardarValor, obtenerValor } from "./almacenamientoSeguro";
import {
  obtenerPendientesSincronizacion,
  aplicarCorreccionesAdmin,
  estadosSincronizacionLocal,
  JornadaCorregidaRemota,
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

/** Forma de la fila que interesa de `jornadas` en Supabase para bajar correcciones del
 * administrador (Hallazgo #28) — subconjunto de columnas más `campos_editados_admin`/`editado_en`,
 * tal como las devuelve supabase-js (snake_case, sin transformar). `campos_editados_admin` puede
 * venir `null` en filas nunca tocadas por el trigger (`schema_v10_correccion_admin_gana.sql` les
 * pone default `'{}'::jsonb`, pero una fila creada por un cliente viejo antes de esa migración
 * podría no tenerlo todavía). */
interface FilaJornadaCorregidaRemota {
  id: string;
  empresa: string;
  matricula: string;
  ruta: string;
  km_inicial: number;
  km_final: number | null;
  combustible_inicial: NivelCombustible;
  combustible_final: NivelCombustible | null;
  lat_final: number | null;
  lng_final: number | null;
  foto_tacometro_final_url: string | null;
  tuvo_incidencia: boolean | null;
  tipo_incidencia: TipoIncidencia | null;
  detalle_incidencia: string | null;
  fotos_incidencia: string[] | null;
  fecha_check_out: string | null;
  estado: EstadoJornada;
  campos_editados_admin: Record<string, string> | null;
  editado_en: string | null;
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

const PREFIJO_MARCA_AGUA = "marcaAguaCorreccionesAdmin:";

function claveMarcaAgua(choferId: string): string {
  return `${PREFIJO_MARCA_AGUA}${choferId}`;
}

/** Epoch (1970) como valor por defecto — "nunca corrió esta consulta para este chofer todavía",
 * así la primera corrida en un teléfono nuevo trae TODO lo que tenga `editado_en`, sin importar
 * cuán viejo. Persistida con `almacenamientoSeguro` (no en SQLite): tiene que sobrevivir aunque se
 * reinstale la app conservando el mismo chofer logueado, que es justo el escenario del
 * Hallazgo #27 — si viviera en la misma base que se reinstala, cada reinstalación volvería a bajar
 * el historial completo de correcciones en vez de solo las nuevas. */
async function obtenerMarcaAgua(choferId: string): Promise<string> {
  const guardada = await obtenerValor(claveMarcaAgua(choferId));
  return guardada ?? new Date(0).toISOString();
}

async function guardarMarcaAgua(choferId: string, valor: string): Promise<void> {
  await guardarValor(claveMarcaAgua(choferId), valor);
}

/** Una corrección del administrador que se terminó de aplicar en este teléfono — lo que
 * `useJornadasAbiertas` necesita para avisarle al chofer (Hallazgo #28: a diferencia de
 * `cerradasRemoto`, que solo refresca en silencio, esto dispara un aviso visible). */
export interface JornadaCorregida {
  id: string;
  matricula: string;
  ruta: string;
  campos: string[];
}

/**
 * ⚠️ Consolida en una sola función (spec_correccion_gana_dashboard.md, Fase 1 punto 4) lo que
 * antes eran dos mecanismos separados con el mismo propósito de fondo ("bajar del servidor algo
 * que el teléfono no sabe"): `reconciliarJornadasAbiertas()` (recorría lo que SQLite ya tenía
 * localmente, una por una, preguntando si Supabase la había cerrado — Hallazgo #9) y
 * `recuperarJornadasAbiertas()` (consultaba por chofer las jornadas abiertas que el teléfono no
 * tenía — Hallazgo #27, ver ese commit para el porqué "por chofer" y no "por id"). Dos
 * implementaciones del mismo criterio fue lo que causó el Hallazgo #21; sumar un tercer camino acá
 * hubiera sido peor.
 *
 * La Parte 1 de abajo (antes "reconciliar cierre remoto") quedó reemplazada por completo por el
 * mecanismo del Hallazgo #28: cerrar una jornada desde el Dashboard ya no es un caso aparte, es
 * una corrección de campo más (`estado`/`fecha_check_out` son dos claves más de
 * `campos_editados_admin`, ver `schema_v10_correccion_admin_gana.sql`) — mantenerla aparte hubiera
 * sido sostener una distinción que dejó de ser real, y un tercer camino paralelo era justo lo que
 * había que evitar. `editar/route.ts` pone `editado_en` en CUALQUIER escritura del Dashboard, así
 * que una sola consulta acotada por `editado_en > marca de agua` (por chofer, nunca "todas las
 * jornadas") cubre tanto el cierre remoto (Hallazgo #6/#9) como cualquier otra corrección de campo,
 * sin iterar las jornadas locales una por una — importante porque un chofer puede acumular
 * cientos de jornadas en su historial.
 *
 * Sigue las dos guardas que ya tenía el mecanismo original, sin relajar ninguna:
 *   - Aplicar una corrección remota a una jornada local solo si esa jornada está
 *     `sincronizacion = 'sincronizado'` (ver `estadosSincronizacionLocal`) — una con cambios
 *     locales `pendiente`/`sincronizando`/`error` se saltea sin tocar, para no arriesgarse a pisar
 *     una edición local que la app todavía no subió.
 *   - Recuperar (insertar) una jornada abierta remota solo si su id no existe YA en SQLite (ver
 *     `idsJornadasExistentes`) — nunca se pisa una fila local existente, se identifica "la misma
 *     jornada" por `id` (el uuid generado en el dispositivo, primary key en los dos lados).
 *
 * Y agrega el criterio de `sobrescribirCierreRemoto()` (Hallazgo #9), ahora heredado por
 * `aplicarCorreccionesAdmin()` en vez de reimplementado: la hora de cierre que se guarda es la que
 * manda Supabase, nunca el reloj del dispositivo, y la fila nunca queda marcada como pendiente de
 * subir (`aplicarCorreccionesAdmin` no toca `sincronizacion`) — si quedara pendiente, el teléfono
 * intentaría volver a subirla, y contra el trigger de protección eso da un lío difícil de leer.
 */
// Prefijo fijo para poder filtrar en `adb logcat` sin ambigüedad
// (`adb logcat | grep H28`). Instrumentación temporal para diagnosticar en
// dispositivo real por qué la Parte B del Hallazgo #28 no estaba aplicando
// nada — se retira una vez confirmada la causa real.
const LOG = "[H28-sync]";

export async function sincronizarCambiosDelServidor(
  choferId: string
): Promise<{ recuperadas: Jornada[]; cerradasRemoto: string[]; corregidas: JornadaCorregida[] }> {
  console.log(`${LOG} arrancó para chofer=${choferId}, reloj del dispositivo=${new Date().toISOString()}`);

  // Parte 1 (antes reconciliarJornadasAbiertas, Hallazgo #9; extendida en Hallazgo #28 para
  // cualquier corrección de campo, no solo el cierre). Acotada por chofer + marca de agua — nunca
  // "todas las jornadas del chofer", que crecería sin límite con el historial.
  const marcaAgua = await obtenerMarcaAgua(choferId);
  console.log(`${LOG} marca de agua leída = ${marcaAgua}`);
  const cerradasRemoto: string[] = [];
  const corregidas: JornadaCorregida[] = [];

  const { data: corregidasRemoto, error: errorCorregidas } = await supabase
    .from("jornadas")
    .select(
      "id, empresa, matricula, ruta, km_inicial, km_final, combustible_inicial, combustible_final, lat_final, lng_final, foto_tacometro_final_url, tuvo_incidencia, tipo_incidencia, detalle_incidencia, fotos_incidencia, fecha_check_out, estado, campos_editados_admin, editado_en"
    )
    .eq("chofer_id", choferId)
    .gt("editado_en", marcaAgua)
    .returns<FilaJornadaCorregidaRemota[]>();

  if (errorCorregidas) {
    console.error(`${LOG} Query B falló para chofer ${choferId}:`, JSON.stringify(errorCorregidas));
    console.error(
      `sincronizarCambiosDelServidor: no se pudieron consultar correcciones del chofer ${choferId}:`,
      errorCorregidas
    );
  } else {
    console.log(
      `${LOG} Query B devolvió ${corregidasRemoto?.length ?? 0} fila(s) para chofer=${choferId}, marca_agua>${marcaAgua}`
    );
    // Crudo, para TODAS las filas devueltas, antes de cualquier filtro local — si RLS devolviera
    // esta columna vacía o con otra forma, acá se ve tal cual llega, sin pasar todavía por el
    // filtro de sincronizacion local (que podría hacer parecer un problema de la app cuando sería
    // de lo que devuelve/permite Supabase).
    for (const fila of corregidasRemoto ?? []) {
      console.log(
        `${LOG} fila cruda id=${fila.id} editado_en=${fila.editado_en} campos_editados_admin=${JSON.stringify(fila.campos_editados_admin)}`
      );
    }
  }

  if (errorCorregidas) {
    // ya logueado arriba
  } else if (corregidasRemoto && corregidasRemoto.length > 0) {
    const estadosLocales = await estadosSincronizacionLocal(corregidasRemoto.map((fila) => fila.id));
    console.log(
      `${LOG} estadosSincronizacionLocal para [${corregidasRemoto.map((f) => f.id).join(", ")}] = ${JSON.stringify(Array.from(estadosLocales.entries()))}`
    );
    // Todo-o-nada (ver doc de `obtenerMarcaAgua`): si algo queda bloqueado, la marca de agua no
    // avanza nada en esta corrida — se reintenta el lote completo en la próxima. Avanzarla igual
    // dejaría esa corrección perdida para siempre: la consulta usa `gt` estricto, así que una
    // marca de agua que ya pasó ese `editado_en` nunca más lo va a volver a traer.
    let huboBloqueo = false;
    let maxEditadoEn = marcaAgua;

    for (const fila of corregidasRemoto) {
      if (fila.editado_en && fila.editado_en > maxEditadoEn) maxEditadoEn = fila.editado_en;

      const estadoLocal = estadosLocales.get(fila.id);
      // No existe localmente todavía: nada que corregir acá. Si sigue abierta remotamente la trae
      // completa la Parte 2 de abajo; si está cerrada, esta jornada nunca existió en este
      // teléfono y no hay nada que aplicarle.
      if (!estadoLocal) {
        console.log(`${LOG} fila ${fila.id}: no existe localmente, se saltea (no es bloqueo)`);
        continue;
      }

      // Guarda del Hallazgo #27: nunca se pisa una fila con cambios locales todavía sin subir.
      if (estadoLocal !== "sincronizado") {
        console.log(
          `${LOG} fila ${fila.id}: BLOQUEADA — sincronizacion local = '${estadoLocal}' (no 'sincronizado')`
        );
        huboBloqueo = true;
        continue;
      }

      const campos = Object.keys(fila.campos_editados_admin ?? {});
      console.log(
        `${LOG} fila ${fila.id}: local='sincronizado', editado_en=${fila.editado_en}, campos_editados_admin=${JSON.stringify(fila.campos_editados_admin)}`
      );
      // `editado_en` puede venir seteado sin `campos_editados_admin` en filas editadas antes de
      // que corriera schema_v10 — nada que aplicar, pero tampoco es un bloqueo.
      if (campos.length === 0) {
        console.log(`${LOG} fila ${fila.id}: campos_editados_admin vacío, nada que aplicar`);
        continue;
      }

      const remoto: JornadaCorregidaRemota = {
        id: fila.id,
        empresa: fila.empresa,
        matricula: fila.matricula,
        ruta: fila.ruta,
        kmInicial: fila.km_inicial,
        kmFinal: fila.km_final,
        combustibleInicial: fila.combustible_inicial,
        combustibleFinal: fila.combustible_final,
        latFinal: fila.lat_final,
        lngFinal: fila.lng_final,
        fotoTacometroFinalUrl: fila.foto_tacometro_final_url,
        tuvoIncidencia: fila.tuvo_incidencia,
        tipoIncidencia: fila.tipo_incidencia,
        detalleIncidencia: fila.detalle_incidencia,
        fotosIncidencia: fila.fotos_incidencia,
        fechaCheckOut: fila.fecha_check_out,
        estado: fila.estado,
        camposCorregidos: campos,
      };

      try {
        await aplicarCorreccionesAdmin(remoto);
        console.log(`${LOG} fila ${fila.id}: aplicarCorreccionesAdmin OK, campos=[${campos.join(", ")}]`);
      } catch (err) {
        console.error(`${LOG} fila ${fila.id}: aplicarCorreccionesAdmin FALLÓ:`, err);
        console.error(
          `sincronizarCambiosDelServidor: no se pudo aplicar la corrección de la jornada ${fila.id}:`,
          err
        );
        huboBloqueo = true;
        continue;
      }

      if (campos.includes("estado") && fila.estado === "cerrada") cerradasRemoto.push(fila.id);
      corregidas.push({ id: fila.id, matricula: fila.matricula, ruta: fila.ruta, campos });
    }

    console.log(
      `${LOG} fin del lote: huboBloqueo=${huboBloqueo}, marcaAgua=${marcaAgua}, maxEditadoEn=${maxEditadoEn}, corregidas.length=${corregidas.length}`
    );
    if (!huboBloqueo && maxEditadoEn > marcaAgua) {
      await guardarMarcaAgua(choferId, maxEditadoEn);
      console.log(`${LOG} marca de agua avanzada a ${maxEditadoEn}`);
    } else if (huboBloqueo) {
      console.log(
        `${LOG} marca de agua NO avanza (hubo bloqueo) — se reintenta el lote completo la próxima vez`
      );
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

  console.log(
    `${LOG} terminó para chofer=${choferId}: recuperadas=${recuperadas.length}, cerradasRemoto=${cerradasRemoto.length}, corregidas=${corregidas.length}`
  );
  return { recuperadas, cerradasRemoto, corregidas };
}
