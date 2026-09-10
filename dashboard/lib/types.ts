// Tipos compartidos del Dashboard. Reflejan el esquema de Supabase (columnas
// snake_case, tal cual llegan de Postgres/PostgREST) y las formas de
// respuesta de nuestros propios Route Handlers.

// Porcentaje 0-100 (antes era un enum de texto de 5 niveles — ver
// supabase/schema_v3_combustible_porcentaje.sql).
export type NivelCombustible = number;

export type EstadoJornada = "abierta" | "cerrada";

export type TipoIncidencia = "Avería vehículo" | "Tráfico/Retraso" | "Cliente ausente" | "Otro";

/** Fila cruda de la tabla public.jornadas. */
export interface JornadaRow {
  id: string;
  chofer_id: string;
  chofer_nombre: string;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias: string | null;

  km_inicial: number;
  combustible_inicial: NivelCombustible;
  foto_tacometro_inicial_url: string | null;
  foto_ruta_url: string | null;
  lat_inicial: number | null;
  lng_inicial: number | null;
  fecha_check_in: string;

  km_final: number | null;
  combustible_final: NivelCombustible | null;
  foto_tacometro_final_url: string | null;
  lat_final: number | null;
  lng_final: number | null;
  fecha_check_out: string | null;

  tuvo_incidencia: boolean | null;
  tipo_incidencia: TipoIncidencia | null;
  detalle_incidencia: string | null;
  fotos_incidencia: string[] | null;

  estado: EstadoJornada;
  created_at: string;

  fue_editado: boolean;
  editado_por: string | null;
  editado_en: string | null;
  motivo_edicion: string | null;
}

/** Fila cruda de la vista public.ultimas_posiciones. */
export interface UltimaPosicionRow {
  chofer_id: string;
  jornada_ids: string[];
  lat: number;
  lng: number;
  velocidad_kmh: number | null;
  timestamp: string;
}

/** Fila cruda de la vista public.ubicaciones_tracking_planas. */
export interface UbicacionTrackingPlanaRow {
  chofer_id: string;
  jornada_ids: string[];
  lat: number;
  lng: number;
  velocidad_kmh: number | null;
  timestamp: string;
}

/** Un ping de GPS de la ruta histórica de una jornada. */
export interface PuntoRuta {
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  timestamp: string;
}

/** Respuesta de GET /api/tracking/ruta-jornada. */
export interface RutaJornadaResponse {
  puntos: PuntoRuta[];
}

/** Respuesta enriquecida de GET /api/tracking/ultimas-posiciones. */
export interface PosicionChofer {
  choferId: string;
  jornadaIds: string[];
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  timestamp: string;
  choferNombre: string | null;
  empresa: string | null;
  matricula: string | null;
  tieneIncidencia: boolean;
}

/** Respuesta paginada de GET /api/jornadas. */
export interface JornadasResponse {
  data: JornadaRow[];
  count: number;
  page: number;
  pageSize: number;
}

export interface ExportarReporteRequest {
  correo: string;
  rangoInicio: string; // YYYY-MM-DD
  rangoFin: string; // YYYY-MM-DD
  empresa?: string;
  chofer?: string;
  estado?: EstadoJornada;
}

export interface ExportarReporteResponse {
  mensaje: string;
  previewUrl?: string;
}

/** Campos de una jornada corregibles desde EditarJornadaDialog. */
export interface CamposEditablesJornada {
  empresa?: string;
  matricula?: string;
  ruta?: string;
  kmInicial?: number;
  kmFinal?: number;
  combustibleInicial?: number;
  combustibleFinal?: number;
}

export interface EditarJornadaRequest extends CamposEditablesJornada {
  id: string;
  editadoPor: string;
  motivoEdicion: string;
}

export interface EditarJornadaResponse {
  mensaje: string;
  jornada: JornadaRow;
}
