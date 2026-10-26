// Tipos compartidos del Dashboard. Reflejan el esquema de Supabase (columnas
// snake_case, tal cual llegan de Postgres/PostgREST) y las formas de
// respuesta de nuestros propios Route Handlers.

// Porcentaje 0-100 (antes era un enum de texto de 5 niveles — ver
// supabase/schema_v3_combustible_porcentaje.sql).
export type NivelCombustible = number;

export type EstadoJornada = "abierta" | "cerrada";

export type TipoIncidencia = "Avería vehículo" | "Tráfico/Retraso" | "Cliente ausente" | "Otro";

/** spec_bloque_a_pantallas_checkin_checkout.md (Hallazgo #50): el check-in tiene sus propios tipos
 * (pensados para la carga) desde `schema_v18_tipos_incidencia_checkin.sql` -- 8 valores en total,
 * ampliación solo aditiva sobre el `CHECK` de la base (los 4 de `TipoIncidencia` siguen siendo
 * válidos ahí por las filas históricas, aunque la app ya no los ofrezca). El de check-out
 * (`TipoIncidencia`, arriba) no cambia. */
export type TipoIncidenciaCheckin =
  | TipoIncidencia
  | "Mercancía dañada"
  | "Faltante/Sobrante"
  | "Temperatura fuera de rango"
  | "Pedido/Documentación";

/** Fila cruda de la tabla public.jornadas. */
export interface JornadaRow {
  id: string;
  chofer_id: string;
  chofer_nombre: string;
  /** Embed izquierdo de PostgREST (Hallazgo #51, paso 3b, criterio 7) -- nunca se escribe nada
   * nuevo en `jornadas`: esto solo se LEE para mostrar el identificador completo en vivo. `null`
   * solo si el embed no vino (no debería, la FK es NOT NULL); ausente del todo si el handler
   * no lo pidió (no todos los consumidores de JornadaRow lo necesitan). */
  choferes?: { nombre: string; apellidos: string; dni: string } | null;
  empresa: string;
  matricula: string;
  ruta: string;
  incidencias: string | null;

  km_inicial: number;
  // opcional desde schema_v25_combustible_inicial_opcional.sql (spec_ajustes_previos_apk.md, A1)
  combustible_inicial: NivelCombustible | null;
  foto_tacometro_inicial_url: string | null;
  foto_ruta_url: string | null;
  lat_inicial: number | null;
  lng_inicial: number | null;
  fecha_check_in: string;
  // Incidencia estructurada del check-in (spec_incidencia_en_checkin.md) — mismo patrón que la
  // incidencia de check-out más abajo, independiente de ella.
  tuvo_incidencia_checkin: boolean | null;
  tipo_incidencia_checkin: TipoIncidenciaCheckin | null;
  detalle_incidencia_checkin: string | null;
  fotos_incidencia_checkin: string[] | null;

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

  /** Jornada cargada por Administración desde `/jornadas` (spec_rutas_asignadas_admin.md), nunca
   * por el check-in del chofer en el celular — mismo patrón de auditoría que fue_editado/
   * editado_por de arriba. */
  creada_por_admin: boolean;
  creada_por: string | null;
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

/** Body de POST /api/jornadas/crear (spec_rutas_asignadas_admin.md) — nunca incluye foto de
 * tacómetro ni GPS reales, Administración no los tiene. Los campos de cierre son opcionales como
 * bloque: si se completan, la jornada nace cerrada. */
export interface CrearJornadaRequest {
  choferId: string;
  empresa: string;
  matricula: string;
  ruta: string;
  kmInicial: number;
  // spec_ajustes_previos_apk.md, A6: opcional -- si no viene, se guarda NULL (nunca 0).
  combustibleInicial?: number;
  /** ISO 8601, opcional — por defecto la hora del servidor al crearla. */
  fechaCheckIn?: string;
  kmFinal?: number;
  combustibleFinal?: number;
  /** ISO 8601, opcional — por defecto la hora del servidor al crearla (solo se usa si se
   * completó el resto del cierre). */
  fechaCheckOut?: string;
  tuvoIncidencia?: boolean;
  tipoIncidencia?: TipoIncidencia | null;
  detalleIncidencia?: string;
}

export interface CrearJornadaResponse {
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
 * para `activo`/`debe_cambiar_contrasena` — las demás columnas son del esquema inicial).
 * numero_empleado/pais_nacimiento/sexo son `| null` desde schema_v19_invitaciones_alta_choferes.sql
 * (Hallazgo #51): un chofer registrado por invitación no los pide. empresa_defecto_id/
 * ruta_defecto_id/revisado_at/revisado_por son nuevos de esa misma migración. */
export interface ChoferRow {
  id: string;
  numero_empleado: string | null;
  nombre: string;
  apellidos: string;
  dni: string;
  fecha_nacimiento: string;
  pais_nacimiento: string | null;
  sexo: SexoChofer | null;
  telefono: string | null;
  activo: boolean;
  debe_cambiar_contrasena: boolean;
  created_at: string;
  empresa_defecto_id: string | null;
  ruta_defecto_id: string | null;
  /** NULL = etiqueta "Nuevo — sin revisar" en /choferes. No bloquea nada. */
  revisado_at: string | null;
  revisado_por: string | null;
}

/** Estado en Auth de un chofer — email/email_confirmed_at NO están en `choferes` (viven en
 * auth.users); llegan por la RPC `listar_estado_choferes()` (solo service_role), nunca por un
 * `select` directo a auth.users, que no es una tabla accesible desde PostgREST. */
export interface EstadoChoferAuth {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  revisadoAt: string | null;
}

/** Respuesta de GET /api/choferes/estado (Hallazgo #51, criterio 21). */
export interface EstadoChoferesResponse {
  data: EstadoChoferAuth[];
}

/** Body de POST /api/choferes/revisar (criterio 21: "Marcar como revisado"). */
export interface RevisarChoferRequest {
  id: string;
}

export interface RevisarChoferResponse {
  mensaje: string;
  chofer: ChoferRow;
}

/** Body de POST /api/choferes/anular-registro (criterio 20): borra un chofer registrado por
 * invitación pero que nunca confirmó su correo. El backend vuelve a comprobar las dos
 * condiciones (email_confirmed_at IS NULL, sin jornadas) — esto solo lleva el id, nunca "confío
 * en lo que ya filtró la pantalla". */
export interface AnularRegistroRequest {
  id: string;
}

export interface AnularRegistroResponse {
  mensaje: string;
}

/** Estados posibles de una invitación (criterio 20) — "pendiente" es la UX de "válida y sin
 * usar" que ve Administración; `validar_invitacion()` (que ve el chofer) usa "valida" en su
 * lugar porque ahí "pendiente" no tendría sentido (todavía no se registró nadie). */
export type EstadoInvitacion = "pendiente" | "usada" | "vencida" | "revocada";

/** Fila cruda de la tabla public.invitaciones (schema_v19_invitaciones_alta_choferes.sql,
 * Hallazgo #51). Las 6 columnas de datos personales (schema_v21_alta_asistida_dni_atado.sql,
 * ajuste del Hallazgo #51, 2026-10-14) son todas opcionales -- NULL en una invitación "abierta",
 * y se anulan al consumirse, al revocarse y en las vencidas (criterio 29). */
export interface InvitacionRow {
  id: string;
  token: string;
  codigo: string;
  empresa_id: string | null;
  ruta_id: string | null;
  creada_por: string | null;
  created_at: string;
  vence_at: string;
  revocada_at: string | null;
  usada_at: string | null;
  usada_por: string | null;
  dni: string | null;
  nombre: string | null;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
}

/** Fila que de verdad pide `GET /api/invitaciones` (criterio 34, ajuste del Hallazgo #51,
 * 2026-10-14): la LISTA nunca pide dni/telefono/email/fecha_nacimiento -- ni siquiera llegan al
 * servidor del Dashboard, mucho menos al navegador. Solo `nombre`/`apellidos` (para "Para:
 * Apellidos, Nombre"), que no son el dato sensible que el criterio protege. */
export type InvitacionListadoRow = Omit<
  InvitacionRow,
  "dni" | "telefono" | "email" | "fecha_nacimiento"
>;

/** Invitación enriquecida para /choferes: el estado ya calculado (criterio 20) y los nombres de
 * empresa/ruta resueltos (son FK a public.empresas/rutas, nunca el id crudo en pantalla).
 * token/codigo se enmascaran a null cuando estado !== "pendiente" (revisión del Paso 3a): una
 * invitación usada/vencida/revocada no necesita que su token siga viajando por la red -- ya no
 * sirve para registrarse (validar_invitacion() la rechaza igual), así que no hay motivo para
 * seguir exponiéndolo. */
export interface InvitacionConEstado extends Omit<InvitacionRow, "token" | "codigo"> {
  token: string | null;
  codigo: string | null;
  estado: EstadoInvitacion;
  empresaNombre: string | null;
  rutaNombre: string | null;
}

/** Misma idea que InvitacionConEstado, pero para la LISTA (criterio 34, ajuste del Hallazgo #51,
 * 2026-10-14): a propósito no extiende InvitacionRow completo, sino InvitacionListadoRow -- sin
 * dni/telefono/email/fecha_nacimiento. No es que esas 4 claves viajen en `null`: el tipo mismo no
 * las tiene, así que no pueden filtrarse por descuido en ningún cambio futuro de este archivo. */
export interface InvitacionConEstadoListado extends Omit<InvitacionListadoRow, "token" | "codigo"> {
  token: string | null;
  codigo: string | null;
  estado: EstadoInvitacion;
  empresaNombre: string | null;
  rutaNombre: string | null;
}

/** Respuesta de GET /api/invitaciones. */
export interface InvitacionesResponse {
  data: InvitacionConEstadoListado[];
}

/** Body de POST /api/invitaciones ("Invitar chofer", criterio 19) — empresa/ruta opcionales,
 * ambas por id (FK real al catálogo, a diferencia de jornadas.empresa/ruta que son texto libre).
 * Los 6 campos personales (ajuste del Hallazgo #51, 2026-10-14, criterio 31) también son
 * opcionales, uno por uno -- una invitación "con datos" puede traer solo alguno. */
export interface CrearInvitacionRequest {
  empresaId?: string;
  rutaId?: string;
  dni?: string;
  nombre?: string;
  apellidos?: string;
  telefono?: string;
  email?: string;
  fechaNacimiento?: string;
}

/** `mensajeParaCopiar` ya trae el enlace + código + vencimiento armados (criterio 14) — el botón
 * "Copiar" del diálogo copia este texto tal cual, sin volver a armarlo en el cliente. */
export interface CrearInvitacionResponse {
  mensaje: string;
  invitacion: InvitacionConEstado;
  mensajeParaCopiar: string;
}

/** Body de POST /api/invitaciones/revocar. */
export interface RevocarInvitacionRequest {
  id: string;
}

// InvitacionConEstadoListado, no InvitacionConEstado (criterio 34, ajuste del Hallazgo #51,
// 2026-10-14): revocar() anula los 6 datos personales en el mismo UPDATE, pero la respuesta ahora
// pide columnas explícitas (igual que GET /api/invitaciones), no un "*" -- las 4 claves ni
// aparecen en el JSON, en vez de aparecer en null.
export interface RevocarInvitacionResponse {
  mensaje: string;
  invitacion: InvitacionConEstadoListado;
}

/** Respuesta de GET /api/choferes. */
export interface ChoferesResponse {
  data: ChoferRow[];
}

/** Fila cruda de public.empresas (schema_v17_catalogo_empresas_rutas.sql, Hallazgo #48;
 * schema_v26_catalogo_por_chofer.sql, catálogo por chofer) — catálogo compartido con la app móvil,
 * nunca FK de jornadas.empresa (sigue siendo texto libre). */
export interface EmpresaRow {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  /** true si la creó el trigger de una jornada (criterio 6) y nadie la revisó todavía. */
  pendiente_revision: boolean;
  /** NULL si la creó el Dashboard. */
  creada_por_chofer_id: string | null;
  /** Clave generada por la base (mayúsculas, sin acentos, espacios colapsados) — ver
   * claveNormalizada() en lib/catalogo.ts, su equivalente en JavaScript. */
  clave_normalizada: string | null;
}

/** EmpresaRow + si ELLA MISMA o CUALQUIERA de sus rutas está pendiente de revisión (criterio 9,
 * decisión D4) — calculado en el servidor (GET /api/empresas), nunca en el cliente. */
export interface EmpresaConPendiente extends EmpresaRow {
  tienePendiente: boolean;
}

/** Respuesta de GET /api/empresas. */
export interface EmpresasResponse {
  data: EmpresaConPendiente[];
}

/** Fila cruda de public.rutas — depende de una empresa (empresa_id), nunca FK de jornadas.ruta. */
export interface RutaRow {
  id: string;
  empresa_id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  pendiente_revision: boolean;
  creada_por_chofer_id: string | null;
  clave_normalizada: string | null;
}

/** Respuesta de GET /api/rutas. */
export interface RutasResponse {
  data: RutaRow[];
}

/** Origen de un vínculo chofer-empresa/chofer-ruta (schema_v26_catalogo_por_chofer.sql). */
export type OrigenVinculo = "admin" | "chofer" | "invitacion";

/** Fila cruda de public.chofer_empresas. */
export interface ChoferEmpresaRow {
  chofer_id: string;
  empresa_id: string;
  origen: OrigenVinculo;
  created_at: string;
}

/** Fila cruda de public.chofer_rutas. */
export interface ChoferRutaRow {
  chofer_id: string;
  ruta_id: string;
  empresa_id: string;
  origen: OrigenVinculo;
  created_at: string;
}

/** Cuerpo de POST /api/choferes/[id]/vinculos (spec_catalogo_por_chofer.md, Etapa 2, decisión D2):
 * DIFERENCIAS contra el snapshot que cargó el cliente, nunca "el conjunto completo" -- un vínculo
 * origen='chofer' creado por el trigger entre que se abrió el diálogo y se guardó no debe borrarse
 * nunca por esto. El servidor solo aplica lo que se pide explícitamente. */
export interface DiferenciasVinculosChoferRequest {
  empresasAgregar?: string[];
  empresasQuitar?: string[];
  rutasAgregar?: string[];
  rutasQuitar?: string[];
}

/** Vínculo con el nombre ya resuelto -- lo que necesita la UI para mostrar la lista sin una
 * segunda consulta. */
export interface VinculoEmpresaConNombre {
  empresaId: string;
  nombreEmpresa: string;
  activo: boolean;
  origen: OrigenVinculo;
}

export interface VinculoRutaConNombre {
  rutaId: string;
  empresaId: string;
  nombreRuta: string;
  activo: boolean;
  origen: OrigenVinculo;
}

/** Respuesta de GET y POST /api/choferes/[id]/vinculos: snapshot ya actualizado. */
export interface VinculosChoferResponse {
  empresas: VinculoEmpresaConNombre[];
  rutas: VinculoRutaConNombre[];
}

/** Respuesta de POST /api/empresas/[id]/renombrar/previsualizar y /api/rutas/[id]/renombrar/previsualizar
 * (decisión D5): el número previsto de jornadas, siempre con la nota de "coincidencia exacta". */
export interface PrevisualizarRenombrarResponse {
  jornadasAfectadas: number;
  nota: string;
}

/** Respuesta de POST /api/empresas/[id]/renombrar y /api/rutas/[id]/renombrar: el número REAL
 * devuelto por la función SQL (puede diferir del previsto). */
export interface RenombrarResponse {
  jornadasActualizadas: number;
}

/** Respuesta de POST /api/empresas/[id]/fusionar/previsualizar. */
export interface PrevisualizarFusionarEmpresasResponse {
  rutasCombinadas: number;
  rutasMovidas: number;
  choferesVinculados: number;
  jornadasAfectadas: number;
  nota: string;
}

/** Respuesta de POST /api/rutas/[id]/fusionar/previsualizar. */
export interface PrevisualizarFusionarRutasResponse {
  choferesVinculados: number;
  jornadasAfectadas: number;
  nota: string;
}

/** Respuesta de POST /api/empresas/[id]/fusionar y /api/rutas/[id]/fusionar. */
export interface FusionarResponse {
  jornadasActualizadas: number;
}

/** Fila de GET /api/empresas/[id]: detalle con sus rutas y los choferes vinculados (a la empresa y
 * a cada ruta), para armar las casillas agrupadas de la pantalla de detalle. */
export interface ChoferParaAsignacion {
  id: string;
  nombre: string;
  apellidos: string;
  /** Corrección C4: un chofer de baja se muestra atenuado y no se puede marcar de nuevo en las
   * casillas de asignación -- salvo que ya estuviera vinculado (para poder desvincularlo). */
  activo: boolean;
}

export interface RutaConChoferes extends RutaRow {
  choferesVinculados: string[];
}

export interface EmpresaDetalleResponse {
  empresa: EmpresaConPendiente;
  rutas: RutaConChoferes[];
  choferesVinculados: string[];
  todosLosChoferes: ChoferParaAsignacion[];
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
  /** Obligatorio al crear (spec_normalizacion_dni_matricula_telefono.md); al editar es opcional
   * vía EditarChoferRequest (Partial<CamposChofer>) — un chofer ya cargado sin teléfono se puede
   * seguir guardando sin exigírselo retroactivo. */
  telefono: string;
}

export type CrearChoferRequest = CamposChofer;

/** `contrasenaTemporal` se devuelve UNA sola vez acá — nunca se guarda, nunca se vuelve a poder
 * consultar (ni siquiera el propio backend la retiene después de esta respuesta). */
export interface CrearChoferResponse {
  mensaje: string;
  chofer: ChoferRow;
  contrasenaTemporal: string;
}

export interface EditarChoferRequest extends Partial<
  Omit<CamposChofer, "numeroEmpleado" | "sexo" | "paisNacimiento">
> {
  id: string;
  activo?: boolean;
}

export interface EditarChoferResponse {
  mensaje: string;
  chofer: ChoferRow;
}

/** Devuelto con 409 cuando el número de empleado (comparación exacta, sin normalizar — ver
 * spec_alta_choferes_dashboard.md, Fase 1, punto 4) o el DNI (normalizado — ver
 * spec_normalizacion_dni_matricula_telefono.md) ya existen. numeroEmpleado puede ser null desde
 * el Hallazgo #51: el chofer existente puede haberse registrado por invitación, que no lo pide. */
export interface ChoferDuplicadoResponse {
  mensaje: string;
  choferExistente: {
    id: string;
    numeroEmpleado: string | null;
    nombre: string;
    activo: boolean;
  };
}

/** Misma garantía de "se muestra una sola vez" que CrearChoferResponse. */
export interface ResetearContrasenaResponse {
  mensaje: string;
  contrasenaTemporal: string;
}
