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
  /** Qué campos tocó la ÚLTIMA corrección del administrador y cuándo — lo escribe el trigger
   * `jornadas_proteger_correcciones_admin_trigger` (Hallazgo #28,
   * `supabase/schema_v10_correccion_admin_gana.sql`), nunca este Route Handler a mano. Claves =
   * nombres de columna reales (snake_case); valores = ISO 8601 de cuándo se corrigió esa columna. */
  campos_editados_admin: Record<string, string>;
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

/** Respuesta de GET /api/geocodificar. */
export interface GeocodificarResponse {
  direccion: string | null;
}

/** Un resultado de búsqueda de dirección (geocodificación directa). */
export interface ResultadoBusquedaDireccion {
  displayName: string;
  lat: number;
  lng: number;
}

/** Respuesta de GET /api/geocodificar/buscar. */
export interface BuscarDireccionResponse {
  resultados: ResultadoBusquedaDireccion[];
}

/** Respuesta paginada de GET /api/jornadas. */
export interface JornadasResponse {
  data: JornadaRow[];
  count: number;
  page: number;
  pageSize: number;
}

// rangoInicio/rangoFin pasaron a ser opcionales (Hallazgo #21): "sin
// filtro de fecha" significa lo mismo acá que en /api/jornadas (desde/
// hasta), sin fecha = sin límite de ese lado — antes este endpoint los
// exigía, y el diálogo sustituía en silencio un rango que la tabla nunca
// tuvo. Ver contexto_proyecto.md §4.
export interface ExportarReporteRequest {
  correo: string;
  rangoInicio?: string; // YYYY-MM-DD
  rangoFin?: string; // YYYY-MM-DD
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
  /** ISO 8601. Si viene y la jornada estaba "abierta", el backend la cierra
   * como parte de la misma corrección (ver POST /api/jornadas/editar). */
  fechaCheckOut?: string;
  latFinal?: number;
  lngFinal?: number;
  tuvoIncidencia?: boolean;
  tipoIncidencia?: TipoIncidencia | null;
  detalleIncidencia?: string;
}

export interface EditarJornadaRequest extends CamposEditablesJornada {
  id: string;
  motivoEdicion: string;
}

export interface EditarJornadaResponse {
  mensaje: string;
  jornada: JornadaRow;
}

/** Fila cruda de la tabla public.admins (ver supabase/schema_v7_admins.sql). */
export interface AdminRow {
  id: string;
  email: string;
  nombre: string;
  password_hash: string;
  activo: boolean;
  creado_en: string;
  ultimo_acceso: string | null;
}

export type TipoPropiedadVehiculo = "propio" | "alquilado" | "autonomo";

export type EstadoVehiculo = "activo" | "baja";

/** Fila cruda de la tabla public.vehiculos (ver supabase/schema_v8_flota_vehiculos.sql). */
export interface VehiculoRow {
  id: string;
  matricula: string;
  tipo_propiedad: TipoPropiedadVehiculo;
  capacidad_tanque_litros: number | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  estado: EstadoVehiculo;
  created_at: string;
}

/** Respuesta de GET /api/vehiculos. */
export interface VehiculosResponse {
  data: VehiculoRow[];
}

/** Campos que se pueden cargar/editar de un vehículo. */
export interface CamposVehiculo {
  matricula: string;
  tipoPropiedad: TipoPropiedadVehiculo;
  capacidadTanqueLitros?: number;
  marca?: string;
  modelo?: string;
  anio?: number;
}

export type CrearVehiculoRequest = CamposVehiculo;

export interface EditarVehiculoRequest extends Partial<CamposVehiculo> {
  id: string;
  estado?: EstadoVehiculo;
}

/** Devuelto con 409 cuando la matrícula (normalizada) ya existe — con lo necesario para que la
 * pantalla ofrezca reactivar en vez de mostrar un error genérico de base de datos. */
export interface VehiculoDuplicadoResponse {
  mensaje: string;
  vehiculoExistente: {
    id: string;
    matricula: string;
    estado: EstadoVehiculo;
  };
}

export interface VehiculoResponse {
  mensaje: string;
  vehiculo: VehiculoRow;
}

export type SexoChofer = "Masculino" | "Femenino" | "Otro";

/** Fila cruda de la tabla public.choferes (ver supabase/schema_v9_choferes_administrados.sql
 * para `activo`/`debe_cambiar_contrasena` — las demás columnas son del esquema inicial). */
export interface ChoferRow {
  id: string;
  numero_empleado: string;
  nombre: string;
  apellidos: string;
  dni: string;
  fecha_nacimiento: string;
  pais_nacimiento: string;
  sexo: SexoChofer;
  activo: boolean;
  debe_cambiar_contrasena: boolean;
  created_at: string;
}

/** Respuesta de GET /api/choferes. */
export interface ChoferesResponse {
  data: ChoferRow[];
}

/** Campos que carga el administrador al crear un chofer — son los mismos que hoy exige
 * `registrarCuenta()` en la app móvil (RegistroScreen.tsx), menos la contraseña: la genera el
 * servidor (ver spec_alta_choferes_dashboard.md, Fase 1). */
export interface CamposChofer {
  numeroEmpleado: string;
  nombre: string;
  apellidos: string;
  dni: string;
  fechaNacimiento: string; // YYYY-MM-DD
  paisNacimiento: string;
  sexo: SexoChofer;
}

export type CrearChoferRequest = CamposChofer;

/** `contrasenaTemporal` se devuelve UNA sola vez acá — nunca se guarda, nunca se vuelve a poder
 * consultar (ni siquiera el propio backend la retiene después de esta respuesta). */
export interface CrearChoferResponse {
  mensaje: string;
  chofer: ChoferRow;
  contrasenaTemporal: string;
}

export interface EditarChoferRequest extends Partial<Omit<CamposChofer, "numeroEmpleado">> {
  id: string;
  activo?: boolean;
}

export interface EditarChoferResponse {
  mensaje: string;
  chofer: ChoferRow;
}

/** Devuelto con 409 cuando el número de empleado (comparación exacta, sin normalizar — ver
 * spec_alta_choferes_dashboard.md, Fase 1, punto 4) ya existe. */
export interface ChoferDuplicadoResponse {
  mensaje: string;
  choferExistente: {
    id: string;
    numeroEmpleado: string;
    nombre: string;
    activo: boolean;
  };
}

/** Misma garantía de "se muestra una sola vez" que CrearChoferResponse. */
export interface ResetearContrasenaResponse {
  mensaje: string;
  contrasenaTemporal: string;
}
