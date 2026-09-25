import { obtenerBaseDeDatos } from "./database";
import {
  Jornada,
  NuevoCheckIn,
  DatosCheckOut,
  Usuario,
  UrlsFotosJornada,
  NivelCombustible,
  TipoIncidencia,
  EstadoJornada,
  EstadoSincronizacion,
} from "@/types";

// Forma cruda de una fila tal como la devuelve expo-sqlite (sin las
// transformaciones de filaAJornada: nulls en vez de undefined, tuvoIncidencia
// como 0/1 en vez de boolean). Reemplaza los getAllAsync<any>/getFirstAsync<any>
// que había antes en este archivo.
interface FilaJornadaSQLite {
  id: string;
  choferId: string;
  choferNombre: string;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias: string | null;
  kmInicial: number;
  combustibleInicial: NivelCombustible;
  fotoTacometroInicialUri: string;
  fotoRutaUri: string;
  latInicial: number;
  lngInicial: number;
  fechaCheckIn: string;
  kmFinal: number | null;
  combustibleFinal: NivelCombustible | null;
  fotoTacometroFinalUri: string | null;
  latFinal: number | null;
  lngFinal: number | null;
  fechaCheckOut: string | null;
  tuvoIncidencia: number | null;
  tipoIncidencia: TipoIncidencia | null;
  detalleIncidencia: string | null;
  fotoCheckInUrl: string | null;
  fotoRutaUrl: string | null;
  fotoCheckOutUrl: string | null;
  fotosIncidenciaUris: string | null; // JSON stringificado (SQLite no tiene arrays)
  fotosIncidencia: string | null; // ídem
  estado: EstadoJornada;
  sincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
}

function parsearFotos(json: string | null): string[] {
  if (!json) return [];
  try {
    const valor: unknown = JSON.parse(json);
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// react-native (Hermes) no implementa crypto.getRandomValues(), que uuid@9
// necesita — por eso no se usa expo-crypto (requeriría reconstruir el
// development build nativo) ni el paquete uuid. Estos IDs solo sirven para
// idempotencia local del dispositivo, no necesitan ser criptográficamente
// aleatorios.
function generarId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function filaAJornada(fila: FilaJornadaSQLite): Jornada {
  return {
    id: fila.id,
    choferId: fila.choferId,
    choferNombre: fila.choferNombre,
    empresa: fila.empresa,
    matricula: fila.matricula,
    ruta: fila.ruta,
    incidencias: fila.incidencias ?? undefined,
    kmInicial: fila.kmInicial,
    combustibleInicial: fila.combustibleInicial,
    fotoTacometroInicialUri: fila.fotoTacometroInicialUri,
    fotoRutaUri: fila.fotoRutaUri || undefined,
    latInicial: fila.latInicial,
    lngInicial: fila.lngInicial,
    fechaCheckIn: fila.fechaCheckIn,
    kmFinal: fila.kmFinal ?? undefined,
    combustibleFinal: fila.combustibleFinal ?? undefined,
    fotoTacometroFinalUri: fila.fotoTacometroFinalUri ?? undefined,
    latFinal: fila.latFinal ?? undefined,
    lngFinal: fila.lngFinal ?? undefined,
    fechaCheckOut: fila.fechaCheckOut ?? undefined,
    tuvoIncidencia: fila.tuvoIncidencia == null ? undefined : Boolean(fila.tuvoIncidencia),
    tipoIncidencia: fila.tipoIncidencia ?? undefined,
    detalleIncidencia: fila.detalleIncidencia ?? undefined,
    fotoCheckInUrl: fila.fotoCheckInUrl ?? undefined,
    fotoRutaUrl: fila.fotoRutaUrl ?? undefined,
    fotoCheckOutUrl: fila.fotoCheckOutUrl ?? undefined,
    fotosIncidenciaUris: parsearFotos(fila.fotosIncidenciaUris),
    fotosIncidencia: parsearFotos(fila.fotosIncidencia),
    estado: fila.estado,
    sincronizacion: fila.sincronizacion,
    intentosSincronizacion: fila.intentosSincronizacion,
  };
}

export async function crearCheckIn(datos: NuevoCheckIn, chofer: Usuario): Promise<Jornada> {
  const db = await obtenerBaseDeDatos();
  const jornada: Jornada = {
    id: generarId(),
    choferId: chofer.id,
    choferNombre: chofer.nombre,
    ...datos,
    fechaCheckIn: new Date().toISOString(),
    estado: "abierta",
    sincronizacion: "pendiente",
    intentosSincronizacion: 0,
  };

  await db.runAsync(
    `INSERT INTO jornadas (
      id, choferId, choferNombre, empresa, matricula, ruta, incidencias, kmInicial, combustibleInicial,
      fotoTacometroInicialUri, fotoRutaUri, latInicial, lngInicial, fechaCheckIn,
      estado, sincronizacion, intentosSincronizacion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jornada.id,
      jornada.choferId,
      jornada.choferNombre,
      jornada.empresa,
      jornada.matricula,
      jornada.ruta,
      jornada.incidencias || null,
      jornada.kmInicial,
      jornada.combustibleInicial,
      jornada.fotoTacometroInicialUri,
      jornada.fotoRutaUri || "",
      jornada.latInicial,
      jornada.lngInicial,
      jornada.fechaCheckIn,
      jornada.estado,
      jornada.sincronizacion,
      jornada.intentosSincronizacion,
    ]
  );

  return jornada;
}

export async function registrarCheckOut(datos: DatosCheckOut): Promise<void> {
  const db = await obtenerBaseDeDatos();
  await db.runAsync(
    `UPDATE jornadas SET
      kmFinal = ?, combustibleFinal = ?, fotoTacometroFinalUri = ?,
      latFinal = ?, lngFinal = ?, fechaCheckOut = ?,
      tuvoIncidencia = ?, tipoIncidencia = ?, detalleIncidencia = ?, fotosIncidenciaUris = ?,
      estado = 'cerrada', sincronizacion = 'pendiente'
    WHERE id = ?`,
    [
      datos.kmFinal ?? null,
      datos.combustibleFinal ?? null,
      datos.fotoTacometroFinalUri ?? null,
      datos.latFinal ?? null,
      datos.lngFinal ?? null,
      new Date().toISOString(),
      datos.tuvoIncidencia == null ? null : datos.tuvoIncidencia ? 1 : 0,
      datos.tipoIncidencia ?? null,
      datos.detalleIncidencia ?? null,
      datos.fotosIncidenciaUris && datos.fotosIncidenciaUris.length > 0
        ? JSON.stringify(datos.fotosIncidenciaUris)
        : null,
      datos.id,
    ]
  );
}

// Un chofer puede tener varios viajes abiertos en paralelo (Tarea 6), así que
// esto devuelve todas sus jornadas en curso, no solo la más reciente.
export async function obtenerJornadasAbiertas(choferId: string): Promise<Jornada[]> {
  const db = await obtenerBaseDeDatos();
  const filas = await db.getAllAsync<FilaJornadaSQLite>(
    `SELECT * FROM jornadas WHERE choferId = ? AND estado = 'abierta' ORDER BY fechaCheckIn DESC`,
    [choferId]
  );
  return filas.map(filaAJornada);
}

/** Una jornada corregida por el administrador, tal como viene de Supabase (Hallazgo #28,
 * spec_correccion_gana_dashboard.md) — `syncService.sincronizarCambiosDelServidor` ya la trae en
 * camelCase. `camposCorregidos` son las claves REALES de columna (snake_case, tal como las
 * guarda `campos_editados_admin`) que esta corrección puntual tocó — decide qué se aplica acá
 * abajo, nunca "toda la fila". */
export interface JornadaCorregidaRemota {
  id: string;
  empresa: string;
  matricula: string;
  ruta: string;
  kmInicial: number;
  kmFinal: number | null;
  combustibleInicial: NivelCombustible;
  combustibleFinal: NivelCombustible | null;
  latFinal: number | null;
  lngFinal: number | null;
  fotoTacometroFinalUrl: string | null;
  tuvoIncidencia: boolean | null;
  tipoIncidencia: TipoIncidencia | null;
  detalleIncidencia: string | null;
  fotosIncidencia: string[] | null;
  fechaCheckOut: string | null;
  estado: EstadoJornada;
  camposCorregidos: string[];
}

/**
 * Aplica localmente SOLO los campos que `campos_editados_admin` marca como corregidos por el
 * administrador — nunca la fila entera (Hallazgo #28: eso es justo lo que permite quedarse con el
 * kilometraje que corrigió el administrador Y el check-out que hizo el chofer, sin que uno pise al
 * otro). Reemplaza a `sobrescribirCierreRemoto()` (Hallazgo #9): cerrar una jornada desde el
 * Dashboard ya no es un caso aparte, es una corrección de campo más — `estado`/`fecha_check_out`
 * son dos de las claves que puede traer `camposCorregidos`, igual que cualquier otra.
 *
 * A propósito NO toca `sincronizacion` (se llama solo sobre filas que ya estaban
 * `sincronizacion = 'sincronizado'`, ver `estadosSincronizacionLocal`) ni genera ningún timestamp
 * local — todo lo que escribe viene tal cual de Supabase, la fuente de verdad.
 *
 * `foto_tacometro_final_url` completa `fotoTacometroFinalUri` (la columna que
 * `DetalleJornadaScreen` usa para MOSTRAR la foto — a `<Image source={{uri}}>` le da igual si
 * `uri` es un archivo local o una URL remota) Y `fotoCheckOutUrl` (la columna que `syncService` ya
 * usa como "esto ya está subido, no lo reintentes") a la vez — mismo criterio para
 * `fotos_incidencia` con `fotosIncidenciaUris`/`fotosIncidencia`.
 */
export async function aplicarCorreccionesAdmin(remoto: JornadaCorregidaRemota): Promise<void> {
  if (remoto.camposCorregidos.length === 0) return;

  const asignaciones: string[] = [];
  const valores: (string | number | null)[] = [];
  function set(columna: string, valor: string | number | null) {
    asignaciones.push(`${columna} = ?`);
    valores.push(valor);
  }

  for (const campo of remoto.camposCorregidos) {
    switch (campo) {
      case "empresa":
        set("empresa", remoto.empresa);
        break;
      case "matricula":
        set("matricula", remoto.matricula);
        break;
      case "ruta":
        set("ruta", remoto.ruta);
        break;
      case "km_inicial":
        set("kmInicial", remoto.kmInicial);
        break;
      case "km_final":
        set("kmFinal", remoto.kmFinal);
        break;
      case "combustible_inicial":
        set("combustibleInicial", remoto.combustibleInicial);
        break;
      case "combustible_final":
        set("combustibleFinal", remoto.combustibleFinal);
        break;
      case "lat_final":
        set("latFinal", remoto.latFinal);
        break;
      case "lng_final":
        set("lngFinal", remoto.lngFinal);
        break;
      case "foto_tacometro_final_url":
        set("fotoTacometroFinalUri", remoto.fotoTacometroFinalUrl);
        set("fotoCheckOutUrl", remoto.fotoTacometroFinalUrl);
        break;
      case "tuvo_incidencia":
        set("tuvoIncidencia", remoto.tuvoIncidencia == null ? null : remoto.tuvoIncidencia ? 1 : 0);
        break;
      case "tipo_incidencia":
        set("tipoIncidencia", remoto.tipoIncidencia);
        break;
      case "detalle_incidencia":
        set("detalleIncidencia", remoto.detalleIncidencia);
        break;
      case "fecha_check_out":
        set("fechaCheckOut", remoto.fechaCheckOut);
        break;
      case "estado":
        set("estado", remoto.estado);
        break;
      case "fotos_incidencia": {
        const json =
          remoto.fotosIncidencia && remoto.fotosIncidencia.length > 0
            ? JSON.stringify(remoto.fotosIncidencia)
            : null;
        set("fotosIncidenciaUris", json);
        set("fotosIncidencia", json);
        break;
      }
      // Cualquier clave que no esté en este switch (no debería pasar: el trigger solo escribe
      // las que protege) se ignora sin romper el resto de la corrección.
    }
  }

  if (asignaciones.length === 0) return;
  const db = await obtenerBaseDeDatos();
  valores.push(remoto.id);
  const resultado = await db.runAsync(`UPDATE jornadas SET ${asignaciones.join(", ")} WHERE id = ?`, valores);
  // Instrumentación temporal (Hallazgo #28): si `changes` da 0, el WHERE id = ? no encontró la fila
  // -- la corrección se "aplicó" sin tocar nada, y eso no se veía en ningún log hasta ahora.
  console.log(
    `[H28-sync] aplicarCorreccionesAdmin(${remoto.id}): UPDATE afectó ${resultado.changes} fila(s), columnas=[${asignaciones.join(", ")}]`
  );
}

/** Estado de `sincronizacion` de cada id que exista localmente — un id ausente del `Map`
 * devuelto significa que esa jornada no existe en este teléfono. Usado por
 * `syncService.sincronizarCambiosDelServidor` para decidir, por cada jornada corregida que
 * devuelve Supabase, si corresponde aplicarla (`sincronizado`), saltearla por tener cambios
 * locales pendientes (`pendiente`/`sincronizando`/`error`, Hallazgo #27), o ignorarla por no
 * existir acá. */
export async function estadosSincronizacionLocal(ids: string[]): Promise<Map<string, EstadoSincronizacion>> {
  if (ids.length === 0) return new Map();
  const db = await obtenerBaseDeDatos();
  const placeholders = ids.map(() => "?").join(", ");
  const filas = await db.getAllAsync<{ id: string; sincronizacion: EstadoSincronizacion }>(
    `SELECT id, sincronizacion FROM jornadas WHERE id IN (${placeholders})`,
    ids
  );
  return new Map(filas.map((f) => [f.id, f.sincronizacion]));
}

export async function obtenerJornadaPorId(id: string): Promise<Jornada | null> {
  const db = await obtenerBaseDeDatos();
  const fila = await db.getFirstAsync<FilaJornadaSQLite>(`SELECT * FROM jornadas WHERE id = ?`, [id]);
  return fila ? filaAJornada(fila) : null;
}

/** Subconjunto de `ids` que YA existen en la base local, sin importar su estado — usado por
 * syncService.sincronizarCambiosDelServidor() para no duplicar una jornada abierta que Supabase
 * devuelve pero que el teléfono ya tiene (en cualquier forma: abierta, cerrada, con cambios
 * pendientes de subir). Una sola consulta en vez de N `obtenerJornadaPorId` — la cantidad de
 * jornadas abiertas de un chofer es chica, pero no hay motivo para pagar N round-trips a SQLite
 * pudiendo pagar uno. */
export async function idsJornadasExistentes(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = await obtenerBaseDeDatos();
  const placeholders = ids.map(() => "?").join(", ");
  const filas = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM jornadas WHERE id IN (${placeholders})`,
    ids
  );
  return new Set(filas.map((f) => f.id));
}

/** Datos de una jornada abierta tal como vienen de Supabase
 * (`syncService.sincronizarCambiosDelServidor` ya los trae en camelCase) — mismas columnas de
 * check-in que `crearCheckIn`, más el `id` real
 * (a diferencia de un check-in nuevo, acá NO se genera uno: hay que conservar el mismo id con el
 * que esta jornada ya existe en Supabase, o dejaría de ser "la misma jornada" para cualquier cosa
 * que la busque por id — reconciliación incluida). */
export interface JornadaAbiertaRemota {
  id: string;
  choferId: string;
  choferNombre: string;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias: string | null;
  kmInicial: number;
  combustibleInicial: NivelCombustible;
  fotoTacometroInicialUrl: string;
  fotoRutaUrl: string | null;
  latInicial: number;
  lngInicial: number;
  fechaCheckIn: string;
}

/**
 * Inserta localmente una jornada abierta que existe en Supabase pero no en este teléfono — el
 * caso del Hallazgo #5 (desinstalación, teléfono nuevo, Android limpiando almacenamiento).
 *
 * `fotoTacometroInicialUri`/`fotoRutaUri` (las columnas que la pantalla de check-out y
 * `DetalleJornadaScreen` leen para MOSTRAR la foto) se completan con la URL remota en vez de un
 * archivo local — mismo criterio ya establecido por `sobrescribirCierreRemoto` más abajo/arriba
 * en este archivo para el lado del check-out: a `<Image source={{uri}}>` le da igual si `uri` es
 * un archivo local o una URL de Supabase Storage. `fotoCheckInUrl`/`fotoRutaUrl` se completan con
 * lo mismo, marcando esas fotos como "ya subidas" para que syncService no intente resubirlas.
 * `sincronizacion = 'sincronizado'` por el mismo motivo — este registro nació ya sincronizado,
 * literalmente es una copia de lo que hay en el servidor.
 */
export async function insertarJornadaRecuperada(remoto: JornadaAbiertaRemota): Promise<Jornada> {
  const db = await obtenerBaseDeDatos();
  const jornada: Jornada = {
    id: remoto.id,
    choferId: remoto.choferId,
    choferNombre: remoto.choferNombre,
    empresa: remoto.empresa,
    matricula: remoto.matricula,
    ruta: remoto.ruta,
    incidencias: remoto.incidencias ?? undefined,
    kmInicial: remoto.kmInicial,
    combustibleInicial: remoto.combustibleInicial,
    fotoTacometroInicialUri: remoto.fotoTacometroInicialUrl,
    fotoRutaUri: remoto.fotoRutaUrl ?? undefined,
    latInicial: remoto.latInicial,
    lngInicial: remoto.lngInicial,
    fechaCheckIn: remoto.fechaCheckIn,
    fotoCheckInUrl: remoto.fotoTacometroInicialUrl,
    fotoRutaUrl: remoto.fotoRutaUrl ?? undefined,
    estado: "abierta",
    sincronizacion: "sincronizado",
    intentosSincronizacion: 0,
  };

  await db.runAsync(
    `INSERT INTO jornadas (
      id, choferId, choferNombre, empresa, matricula, ruta, incidencias, kmInicial, combustibleInicial,
      fotoTacometroInicialUri, fotoRutaUri, latInicial, lngInicial, fechaCheckIn,
      fotoCheckInUrl, fotoRutaUrl,
      estado, sincronizacion, intentosSincronizacion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jornada.id,
      jornada.choferId,
      jornada.choferNombre,
      jornada.empresa,
      jornada.matricula,
      jornada.ruta,
      jornada.incidencias || null,
      jornada.kmInicial,
      jornada.combustibleInicial,
      jornada.fotoTacometroInicialUri,
      jornada.fotoRutaUri || "",
      jornada.latInicial,
      jornada.lngInicial,
      jornada.fechaCheckIn,
      jornada.fotoCheckInUrl ?? null,
      jornada.fotoRutaUrl ?? null,
      jornada.estado,
      jornada.sincronizacion,
      jornada.intentosSincronizacion,
    ]
  );

  return jornada;
}

export async function obtenerMatriculasFrecuentes(choferId: string, limite = 8): Promise<string[]> {
  const db = await obtenerBaseDeDatos();
  const filas = await db.getAllAsync<{ matricula: string }>(
    `SELECT DISTINCT matricula FROM jornadas
     WHERE choferId = ? AND matricula != ''
     ORDER BY fechaCheckIn DESC
     LIMIT ?`,
    [choferId, limite]
  );
  return filas.map((fila) => fila.matricula);
}

export async function listarHistorial(choferId: string, limite = 20): Promise<Jornada[]> {
  const db = await obtenerBaseDeDatos();
  const filas = await db.getAllAsync<FilaJornadaSQLite>(
    `SELECT * FROM jornadas WHERE choferId = ? ORDER BY fechaCheckIn DESC LIMIT ?`,
    [choferId, limite]
  );
  return filas.map(filaAJornada);
}

export async function obtenerPendientesSincronizacion(): Promise<Jornada[]> {
  const db = await obtenerBaseDeDatos();
  const filas = await db.getAllAsync<FilaJornadaSQLite>(
    `SELECT * FROM jornadas WHERE sincronizacion IN ('pendiente', 'error') ORDER BY fechaCheckIn ASC`
  );
  return filas.map(filaAJornada);
}

export async function marcarComoSincronizado(id: string): Promise<void> {
  const db = await obtenerBaseDeDatos();
  await db.runAsync(`UPDATE jornadas SET sincronizacion = 'sincronizado' WHERE id = ?`, [id]);
}

export async function marcarErrorSincronizacion(id: string): Promise<void> {
  const db = await obtenerBaseDeDatos();
  await db.runAsync(
    `UPDATE jornadas SET sincronizacion = 'error', intentosSincronizacion = intentosSincronizacion + 1 WHERE id = ?`,
    [id]
  );
}

export async function marcarSincronizando(id: string): Promise<void> {
  const db = await obtenerBaseDeDatos();
  await db.runAsync(`UPDATE jornadas SET sincronizacion = 'sincronizando' WHERE id = ?`, [id]);
}

// Guarda las URLs públicas devueltas por el servidor tras subir las fotos de
// una jornada. Solo actualiza las columnas presentes en `urls` (una jornada
// abierta, por ejemplo, todavía no tiene fotoCheckOutUrl).
export async function actualizarUrlsFotos(id: string, urls: UrlsFotosJornada): Promise<void> {
  const columnas = Object.keys(urls) as (keyof UrlsFotosJornada)[];
  if (columnas.length === 0) return;

  const db = await obtenerBaseDeDatos();
  const asignaciones = columnas.map((columna) => `${columna} = ?`).join(", ");
  const valores = columnas.map((columna) => urls[columna] ?? null);

  await db.runAsync(`UPDATE jornadas SET ${asignaciones} WHERE id = ?`, [...valores, id]);
}
