import type {
  EstadoJornada,
  EstadoSincronizacion,
  Jornada,
  MetadatosFotosJornada,
  NivelCombustible,
  TipoIncidencia,
  TipoIncidenciaCheckin,
} from "@/types";

// Mapeo de una fila cruda de SQLite (jornadasRepo.ts) a `Jornada` -- extraído a un módulo sin
// imports de expo-sqlite/@supabase para poder probarse con Node puro, sin SQLite real (mismo
// criterio que jornadasReconstruccionSql.ts), spec_adjuntar_foto_galeria.md /
// spec_foto_reemplazar_quitar_antes_de_registrar.md. Ver
// specs/pruebas_auth/prueba_filaAJornada_metadatosFotos.js.

/** Forma cruda de una fila tal como la devuelve expo-sqlite (sin las transformaciones de
 * filaAJornada: nulls en vez de undefined, tuvoIncidencia como 0/1 en vez de boolean). */
export interface FilaJornadaSQLite {
  id: string;
  choferId: string;
  choferNombre: string;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias: string | null;
  kmInicial: number;
  combustibleInicial: NivelCombustible | null;
  fotoTacometroInicialUri: string | null;
  fotoRutaUri: string;
  latInicial: number | null;
  lngInicial: number | null;
  fechaCheckIn: string;
  tuvoIncidenciaCheckin: number | null;
  tipoIncidenciaCheckin: TipoIncidenciaCheckin | null;
  detalleIncidenciaCheckin: string | null;
  fotosIncidenciaCheckinUris: string | null; // JSON stringificado
  fotosIncidenciaCheckin: string | null; // ídem, URLs remotas
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
  metadatosFotos: string | null; // JSON stringificado de MetadatosFotosJornada
  creadaPorAdmin: number;
  creadaPor: string | null;
  estado: EstadoJornada;
  sincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
}

export function parsearFotos(json: string | null): string[] {
  if (!json) return [];
  try {
    const valor: unknown = JSON.parse(json);
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** `metadatosFotos` es un campo nuevo (spec_adjuntar_foto_galeria.md /
 * spec_foto_reemplazar_quitar_antes_de_registrar.md) -- una jornada pendiente del formato
 * antiguo (columna NULL, instalada antes de este campo) tiene que seguir leyéndose sin error,
 * simplemente sin metadata ni etiqueta (degradación aceptada). */
export function parsearMetadatosFotos(json: string | null): MetadatosFotosJornada | undefined {
  if (!json) return undefined;
  try {
    const valor: unknown = JSON.parse(json);
    return valor && typeof valor === "object" ? (valor as MetadatosFotosJornada) : undefined;
  } catch {
    return undefined;
  }
}

export function filaAJornada(fila: FilaJornadaSQLite): Jornada {
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
    fotoTacometroInicialUri: fila.fotoTacometroInicialUri ?? undefined,
    fotoRutaUri: fila.fotoRutaUri || undefined,
    latInicial: fila.latInicial ?? undefined,
    lngInicial: fila.lngInicial ?? undefined,
    fechaCheckIn: fila.fechaCheckIn,
    tuvoIncidenciaCheckin:
      fila.tuvoIncidenciaCheckin == null ? undefined : Boolean(fila.tuvoIncidenciaCheckin),
    tipoIncidenciaCheckin: fila.tipoIncidenciaCheckin ?? undefined,
    detalleIncidenciaCheckin: fila.detalleIncidenciaCheckin ?? undefined,
    fotosIncidenciaCheckinUris: parsearFotos(fila.fotosIncidenciaCheckinUris),
    fotosIncidenciaCheckin: parsearFotos(fila.fotosIncidenciaCheckin),
    kmFinal: fila.kmFinal ?? undefined,
    combustibleFinal: fila.combustibleFinal,
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
    metadatosFotos: parsearMetadatosFotos(fila.metadatosFotos),
    creadaPorAdmin: Boolean(fila.creadaPorAdmin),
    creadaPor: fila.creadaPor ?? undefined,
    estado: fila.estado,
    sincronizacion: fila.sincronizacion,
    intentosSincronizacion: fila.intentosSincronizacion,
  };
}
