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

export async function obtenerJornadaPorId(id: string): Promise<Jornada | null> {
  const db = await obtenerBaseDeDatos();
  const fila = await db.getFirstAsync<FilaJornadaSQLite>(`SELECT * FROM jornadas WHERE id = ?`, [id]);
  return fila ? filaAJornada(fila) : null;
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
