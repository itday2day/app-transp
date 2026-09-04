// Porcentaje 0-100. Antes era un enum de 5 niveles ("Reserva"|"1/4"|"1/2"|"3/4"|"Lleno") —
// ver supabase/schema_v3_combustible_porcentaje.sql para el mapeo de migración de esos
// valores históricos a porcentaje (Reserva->0, 1/4->25, 1/2->50, 3/4->75, Lleno->100).
export type NivelCombustible = number;

export interface Usuario {
  id: string;
  nombre: string;
  numeroEmpleado: string;
}

export type Sexo = "Masculino" | "Femenino" | "Otro";

export interface Pais {
  nombre: string;
  codigo: string; // ISO 3166-1 alpha-2
}

export interface NuevoRegistro {
  numeroEmpleado: string;
  nombre: string;
  apellidos: string;
  dni: string;
  fechaNacimiento: string; // YYYY-MM-DD (ISO 8601)
  paisNacimiento: string;
  contrasena: string;
  sexo: Sexo;
}

export type EstadoJornada = "abierta" | "cerrada";
export type EstadoSincronizacion = "pendiente" | "sincronizando" | "sincronizado" | "error";

export type TipoIncidencia = "Avería vehículo" | "Tráfico/Retraso" | "Cliente ausente" | "Otro";

export interface IncidenciaData {
  tuvoIncidencia: boolean;
  tipo: TipoIncidencia | null;
  detalle: string;
  fotos: string[]; // uris locales mientras se llena el formulario
}

export interface Jornada {
  id: string; // uuid generado en el dispositivo
  choferId: string;
  choferNombre: string;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias?: string;

  kmInicial: number;
  combustibleInicial: NivelCombustible;
  fotoTacometroInicialUri: string;
  fotoRutaUri?: string; // opcional: la foto de la hoja de ruta no es obligatoria para el check-in
  latInicial: number;
  lngInicial: number;
  fechaCheckIn: string; // ISO 8601

  kmFinal?: number;
  combustibleFinal?: NivelCombustible;
  fotoTacometroFinalUri?: string;
  latFinal?: number;
  lngFinal?: number;
  fechaCheckOut?: string;
  tuvoIncidencia?: boolean;
  tipoIncidencia?: TipoIncidencia;
  detalleIncidencia?: string;
  fotosIncidenciaUris?: string[]; // local, se muestran en DetalleJornadaScreen

  // URLs públicas en el servidor (se llenan tras sincronizar; antes de eso
  // solo existen las *Uri locales de arriba).
  fotoCheckInUrl?: string;
  fotoRutaUrl?: string;
  fotoCheckOutUrl?: string;
  fotosIncidencia?: string[];

  estado: EstadoJornada;
  sincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
}

export type NuevoCheckIn = Pick<
  Jornada,
  | "empresa"
  | "matricula"
  | "ruta"
  | "incidencias"
  | "kmInicial"
  | "combustibleInicial"
  | "fotoTacometroInicialUri"
  | "fotoRutaUri"
  | "latInicial"
  | "lngInicial"
>;

export type DatosCheckOut = Pick<
  Jornada,
  | "kmFinal"
  | "combustibleFinal"
  | "fotoTacometroFinalUri"
  | "latFinal"
  | "lngFinal"
  | "tuvoIncidencia"
  | "detalleIncidencia"
  | "fotosIncidenciaUris"
> & { id: string; tipoIncidencia: TipoIncidencia | null };

export interface UrlsFotosJornada {
  fotoCheckInUrl?: string;
  fotoRutaUrl?: string;
  fotoCheckOutUrl?: string;
  fotosIncidencia?: string; // JSON stringificado de string[] (ver jornadasRepo.ts)
}

// Ping de posición GPS enviado al Dashboard en tiempo real (best-effort, sin
// cola de reintentos — a diferencia de una jornada, perder un punto no importa).
export interface PingUbicacion {
  choferId: string;
  jornadaIds: string[];
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  timestamp: string; // ISO 8601
}
