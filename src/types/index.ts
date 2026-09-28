// Porcentaje 0-100. Antes era un enum de 5 niveles ("Reserva"|"1/4"|"1/2"|"3/4"|"Lleno") —
// ver supabase/schema_v3_combustible_porcentaje.sql para el mapeo de migración de esos
// valores históricos a porcentaje (Reserva->0, 1/4->25, 1/2->50, 3/4->75, Lleno->100).
export type NivelCombustible = number;

export interface Usuario {
  id: string;
  nombre: string;
  numeroEmpleado: string;
  // El alta la hace el Dashboard con una contraseña temporal (spec_alta_choferes_dashboard.md);
  // mientras esto sea true, RootNavigator.tsx no deja pasar de
  // CambiarContrasenaObligatorioScreen a ninguna otra pantalla. La fija el alta y el reseteo
  // (ambos del lado del servidor); la apaga cambiarContrasenaObligatorio() al completar el
  // cambio.
  debeCambiarContrasena: boolean;
}

export type Sexo = "Masculino" | "Femenino" | "Otro";

export interface Pais {
  nombre: string;
  codigo: string; // ISO 3166-1 alpha-2
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
  // ⚠️ Histórico: texto libre que capturaba el check-in antes de
  // spec_incidencia_en_checkin.md. Ya no se escribe desde el formulario (ver
  // tuvoIncidenciaCheckin y el resto de campos *Checkin más abajo) — se
  // mantiene de solo lectura para no perder el dato de jornadas viejas.
  incidencias?: string;

  kmInicial: number;
  combustibleInicial: NivelCombustible;
  // Opcionales desde spec_rutas_asignadas_admin.md: una jornada creada_por_admin (más abajo) no
  // tiene foto real de tacómetro ni GPS real -- el check-in del propio chofer (CheckInForm.tsx)
  // siempre los completa, así que en ese camino nunca vienen vacíos.
  fotoTacometroInicialUri?: string;
  fotoRutaUri?: string; // opcional: la foto de la hoja de ruta no es obligatoria para el check-in
  latInicial?: number;
  lngInicial?: number;
  fechaCheckIn: string; // ISO 8601
  // Incidencia estructurada del check-in (spec_incidencia_en_checkin.md) — mismo patrón que la
  // incidencia de check-out más abajo, independiente de ella (una jornada puede tener 0, 1 o 2).
  tuvoIncidenciaCheckin?: boolean;
  tipoIncidenciaCheckin?: TipoIncidencia;
  detalleIncidenciaCheckin?: string;
  fotosIncidenciaCheckinUris?: string[]; // local, se muestran en DetalleJornadaScreen

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
  fotosIncidenciaCheckin?: string[];
  fotosIncidencia?: string[];

  // Jornada cargada por Administración desde el Dashboard (spec_rutas_asignadas_admin.md), no por
  // el check-in del chofer -- mismo patrón que fue_editado/editado_por del Hallazgo #28.
  creadaPorAdmin: boolean;
  creadaPor?: string;

  estado: EstadoJornada;
  sincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
}

export type NuevoCheckIn = Pick<
  Jornada,
  | "empresa"
  | "matricula"
  | "ruta"
  | "kmInicial"
  | "combustibleInicial"
  | "fotoTacometroInicialUri"
  | "fotoRutaUri"
  | "latInicial"
  | "lngInicial"
  | "tuvoIncidenciaCheckin"
  | "detalleIncidenciaCheckin"
  | "fotosIncidenciaCheckinUris"
> & { tipoIncidenciaCheckin: TipoIncidencia | null };

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
  fotosIncidenciaCheckin?: string; // JSON stringificado de string[] (ver jornadasRepo.ts)
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
