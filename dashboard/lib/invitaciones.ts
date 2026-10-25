import type { SupabaseClient } from "@supabase/supabase-js";
import { CORREO_VALIDO_REGEX } from "@/lib/correo";
import {
  DNI_VALIDO_REGEX,
  TELEFONO_VALIDO_REGEX,
  edadMinimaCumplida,
  normalizarDni,
} from "@/lib/choferes";
import type { Database } from "@/lib/supabase/database.types";
import type {
  EmpresaRow,
  EstadoInvitacion,
  InvitacionConEstado,
  InvitacionConEstadoListado,
  InvitacionListadoRow,
  InvitacionRow,
  RutaRow,
} from "@/lib/types";

// Columnas EXPLÍCITAS para cualquier respuesta que NO sea la propia creación (criterio 34,
// ajuste del Hallazgo #51, 2026-10-14): nunca dni/telefono/email/fecha_nacimiento -- ni siquiera
// se piden a Supabase. Compartida por GET /api/invitaciones y POST /api/invitaciones/revocar
// (antes cada uno declaraba la suya o, en el caso de revocar, pedía "*"): un solo lugar para no
// repetir la lista ni arriesgar que una copie mal a la otra. Solo nombre/apellidos (para "Para:
// Apellidos, Nombre"), que no son el dato sensible que protege este criterio.
export const COLUMNAS_LISTADO_INVITACIONES =
  "id, token, codigo, empresa_id, ruta_id, creada_por, created_at, vence_at, revocada_at, usada_at, usada_por, nombre, apellidos";

// spec_bloque_b_invitacion_registro_login_correo.md (Hallazgo #51), criterio 20. Mismo criterio
// de prioridad que validar_invitacion() en la base (revocada > usada > vencida), para que
// Administración y el chofer nunca vean un estado distinto de la misma fila — "revocada" gana
// aunque además esté vencida, porque es la acción más reciente y deliberada de las tres. Toma
// solo estas 3 columnas (no el InvitacionRow completo) para que también sirva con
// InvitacionListadoRow, que nunca pide dni/telefono/email/fecha_nacimiento (criterio 34).
export function calcularEstadoInvitacion(
  fila: Pick<InvitacionRow, "revocada_at" | "usada_at" | "vence_at">
): EstadoInvitacion {
  if (fila.revocada_at) return "revocada";
  if (fila.usada_at) return "usada";
  if (new Date(fila.vence_at).getTime() <= Date.now()) return "vencida";
  return "pendiente";
}

/** Enriquece una fila cruda de `invitaciones` con su estado y los nombres de empresa/ruta
 * (ver InvitacionConEstado) -- usado tanto por GET/POST /api/invitaciones como por
 * POST /api/invitaciones/revocar, para que el enmascarado de token/codigo de abajo sea un único
 * lugar, no una regla repetida en cada Route Handler. */
export function enriquecerInvitacion(
  fila: InvitacionRow,
  empresaPorId: Map<string, string>,
  rutaPorId: Map<string, string>
): InvitacionConEstado {
  const estado = calcularEstadoInvitacion(fila);
  return {
    ...fila,
    // token/codigo solo viajan mientras la invitación sigue "pendiente" (revisión del Paso 3a):
    // una vez usada/vencida/revocada ya no sirven para registrarse (validar_invitacion() la
    // rechaza igual), así que no hay motivo para seguir exponiéndolos en cada GET.
    token: estado === "pendiente" ? fila.token : null,
    codigo: estado === "pendiente" ? fila.codigo : null,
    estado,
    empresaNombre: fila.empresa_id ? (empresaPorId.get(fila.empresa_id) ?? null) : null,
    rutaNombre: fila.ruta_id ? (rutaPorId.get(fila.ruta_id) ?? null) : null,
  };
}

export function enriquecerInvitaciones(
  filas: InvitacionRow[],
  empresas: EmpresaRow[],
  rutas: RutaRow[]
): InvitacionConEstado[] {
  const empresaPorId = new Map(empresas.map((e) => [e.id, e.nombre]));
  const rutaPorId = new Map(rutas.map((r) => [r.id, r.nombre]));
  return filas.map((fila) => enriquecerInvitacion(fila, empresaPorId, rutaPorId));
}

/** Misma idea que enriquecerInvitacion(), pero para `GET /api/invitaciones` (criterio 34, ajuste
 * del Hallazgo #51, 2026-10-14): a propósito NO toma un InvitacionRow completo, sino
 * InvitacionListadoRow -- sin dni/telefono/email/fecha_nacimiento, que ni siquiera se pidieron a
 * Supabase. Así el objeto que arma esta función NUNCA tiene esas 4 claves, no es que las tenga
 * en `null`: no pueden "llegar al navegador" columnas que ni están en el tipo de entrada. */
export function enriquecerInvitacionListado(
  fila: InvitacionListadoRow,
  empresaPorId: Map<string, string>,
  rutaPorId: Map<string, string>
): InvitacionConEstadoListado {
  const estado = calcularEstadoInvitacion(fila);
  return {
    ...fila,
    token: estado === "pendiente" ? fila.token : null,
    codigo: estado === "pendiente" ? fila.codigo : null,
    estado,
    empresaNombre: fila.empresa_id ? (empresaPorId.get(fila.empresa_id) ?? null) : null,
    rutaNombre: fila.ruta_id ? (rutaPorId.get(fila.ruta_id) ?? null) : null,
  };
}

export function enriquecerInvitacionesListado(
  filas: InvitacionListadoRow[],
  empresas: EmpresaRow[],
  rutas: RutaRow[]
): InvitacionConEstadoListado[] {
  const empresaPorId = new Map(empresas.map((e) => [e.id, e.nombre]));
  const rutaPorId = new Map(rutas.map((r) => [r.id, r.nombre]));
  return filas.map((fila) => enriquecerInvitacionListado(fila, empresaPorId, rutaPorId));
}

// Dominio real del Dashboard (spec_cambio_dominio_dashboard.md, 2026-10-25): app.day2day.es, un
// subdominio de day2day.es apuntado por CNAME a app-transp-dashboard.onrender.com y verificado en
// Render (Settings → Custom Domains) antes de este cambio de código -- orden DNS → Render →
// código. app-transp-dashboard.onrender.com SIGUE ACTIVO en paralelo (no se apaga ni se
// redirige): las invitaciones ya enviadas con ese dominio siguen abriendo bien, el token no
// depende del host.
const DOMINIO_DASHBOARD = "https://app.day2day.es";

// ⚠️ `apptransp` es un scheme PROPUESTO, todavía no declarado en app.json (confirmado en la Fase
// 1 de la spec: no existe ningún `scheme` hoy, ni `linking` en RootNavigator.tsx) — ese cambio es
// trabajo de `src/`, posterior en el orden de despliegue del Bloque B. Hasta que exista, este
// enlace no abre nada solo: el chofer sigue teniendo el código de respaldo (criterio 14), que es
// justo el motivo por el que ese código existe. No bloquea el paso 3a: la pantalla pública no
// depende de que el deep link funcione para mostrar el resto de su contenido.
const SCHEME_APP_PROPUESTO = "apptransp";

export function enlaceInvitacion(token: string): string {
  return `${DOMINIO_DASHBOARD}/invitacion/${token}`;
}

export function enlaceProfundoInvitacion(token: string): string {
  return `${SCHEME_APP_PROPUESTO}://invitacion/${encodeURIComponent(token)}`;
}

/** Mensaje listo para copiar desde "Invitar chofer" (criterio 19/33, textos aprobados por el
 * usuario en la "Decisión 1" de la Actualización 5, 2026-10-14) -- dos pasos numerados (descargar
 * + abrir), la fecha de vencimiento en `Europe/Madrid` (quien llama ya la formatea así, ver
 * `app/api/invitaciones/route.ts`, `formatFechaHora()`) y el código de respaldo al final. Si
 * `nombre` viene (invitación "con datos"), la primera línea saluda por el nombre; si no
 * (invitación "abierta"), queda el texto genérico -- el resto de las líneas es IDÉNTICO en los
 * dos casos, literal, tal como se aprobó. */
export function armarMensajeParaCopiar(
  token: string,
  codigo: string,
  venceFormateado: string,
  nombre?: string | null
): string {
  const enlace = enlaceInvitacion(token);
  const primeraLinea = nombre
    ? `Hola ${nombre}, te invitamos a trabajar con la app de Day2Day (por ahora solo para Android).`
    : "Te invitamos a registrarte en la app de Day2Day (por ahora solo para Android).";
  return [
    primeraLinea,
    `1. Abre este enlace desde tu teléfono: ${enlace}`,
    "2. Pulsa «Descargar la app» e instálala. Si el teléfono pregunta, permite instalar desde este navegador.",
    "3. Vuelve al enlace, pulsa «Abrir la app» y sigue los pasos. Te llegará un código por correo.",
    `El enlace vale hasta ${venceFormateado}.`,
    `Si algo falla, abre la app e introduce este código: ${codigo}`,
  ].join("\n");
}

/** «Para:» de la lista de invitaciones (criterio 34 acotado por la Decisión 2 de la
 * Actualización 5): «Apellidos, Nombre» si hay nombre, «Invitación abierta» si no -- nunca el
 * DNI, el teléfono ni el correo, que no se vuelven a mostrar en ningún lado después de crear la
 * invitación. */
export function paraInvitacion(nombre: string | null, apellidos: string | null): string {
  if (!nombre) return "Invitación abierta";
  return apellidos ? `${apellidos}, ${nombre}` : nombre;
}

/** Datos personales OPCIONALES de una invitación "con datos del chofer" (criterio 31, ajuste del
 * Hallazgo #51) -- cada campo puede venir o no; el que SÍ viene se valida. */
export interface DatosPersonalesInvitacion {
  dni?: string;
  nombre?: string;
  apellidos?: string;
  telefono?: string;
  email?: string;
  fechaNacimiento?: string;
}

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Mismo motivo que el comentario de v_fecha_nacimiento_texto en crear_chofer_desde_invitacion()
// (supabase/schema.sql): el constructor Date de JS acepta fechas de calendario que NO EXISTEN
// ("2000-02-31") y las "corrige" en silencio a otra fecha (acá, 2 de marzo de 2000) en vez de
// rechazarlas -- confirmado real: sin este chequeo, ese valor pasaba la validación de edad acá
// y recién fallaba contra el `date` de Postgres (que sí valida el calendario), como un 500
// genérico en vez de un 400 claro. Reconstruir por componentes y comparar cada uno contra lo que
// se pidió es lo que detecta el redondeo silencioso.
function esFechaCalendarioValida(fechaIso: string): boolean {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/** Mismas validaciones que el trigger `crear_chofer_desde_invitacion()` (criterio 31) -- reusa
 * los mismos helpers que ya usa `/choferes` (DNI_VALIDO_REGEX/normalizarDni, TELEFONO_VALIDO_REGEX,
 * edadMinimaCumplida de `lib/choferes.ts`), no una copia nueva de esas reglas. Solo valida los
 * campos que vinieron -- el resto quedan opcionales de verdad (una invitación "con datos" puede
 * traer solo el DNI, por ejemplo). Devuelve el primer mensaje de error, o `null` si todo lo que
 * vino es válido -- así el encargado ve el error ANTES de generar nada, no recién cuando el
 * chofer intente registrarse. */
export function validarDatosInvitacion(datos: DatosPersonalesInvitacion): string | null {
  if (datos.dni?.trim()) {
    if (!DNI_VALIDO_REGEX.test(normalizarDni(datos.dni))) {
      return "El DNI/NIE debe tener 9 caracteres.";
    }
  }
  if (datos.fechaNacimiento?.trim()) {
    const fecha = datos.fechaNacimiento.trim();
    // Mismo orden y mismos tres chequeos que el trigger: formato ISO estricto, calendario real
    // (rechaza "2000-02-31"), y no antes de 1900 -- todo bajo el mismo mensaje, como hace la
    // base (un solo "fecha_nacimiento_invalida" para los tres casos).
    if (!FECHA_ISO_REGEX.test(fecha) || !esFechaCalendarioValida(fecha) || fecha < "1900-01-01") {
      return "La fecha de nacimiento no es válida.";
    }
    if (!edadMinimaCumplida(fecha)) {
      return "El chofer debe ser mayor de 18 años.";
    }
  }
  if (datos.telefono?.trim() && !TELEFONO_VALIDO_REGEX.test(datos.telefono.trim())) {
    return "El teléfono debe tener formato internacional (ej. +34600000000).";
  }
  if (datos.email?.trim() && !CORREO_VALIDO_REGEX.test(datos.email.trim().toLowerCase())) {
    return "El correo no tiene un formato válido.";
  }
  return null;
}

// 7 días, en milisegundos -- criterio de borrado de la Fase 1 (punto 3) aprobado por el usuario:
// las invitaciones vencidas hace más de esto, si todavía tienen datos personales, los pierden.
const MS_SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

/** Anula los datos personales de las invitaciones vencidas hace más de 7 días (criterio 29,
 * tercera de las tres rutas de borrado -- al consumirse y al revocarse lo hacen la base/el propio
 * Route Handler de revocar). Sin `pg_cron` (no está instalado): corre como efecto lateral de
 * `GET` y `POST /api/invitaciones`, cada vez que alguien abre o usa el Dashboard -- aceptable en
 * un piloto, documentado así (Fase 1, punto 3). Devuelve cuántas filas tocó; quien llama la
 * envuelve en `try/catch` y registra SOLO ese número, nunca los datos (criterio 29). */
export async function limpiarDatosVencidos(supabase: SupabaseClient<Database>): Promise<number> {
  const limite = new Date(Date.now() - MS_SIETE_DIAS).toISOString();
  const { data, error } = await supabase
    .from("invitaciones")
    .update({
      dni: null,
      nombre: null,
      apellidos: null,
      telefono: null,
      email: null,
      fecha_nacimiento: null,
    })
    .lt("vence_at", limite)
    .is("usada_at", null)
    .is("revocada_at", null)
    // Solo las filas que TODAVÍA tienen algo que anular (Fase 1, punto 3) -- sin esto, cada
    // GET/POST reescribiría de nuevo (con el mismo NULL) cualquier vencida ya limpiada antes, y
    // el recuento que se registra dejaría de significar "cuántas se anularon de verdad" para
    // pasar a ser "cuántas vencidas hay en total", aunque no hubiera nada para borrar en ellas.
    .or(
      "dni.not.is.null,nombre.not.is.null,apellidos.not.is.null,telefono.not.is.null,email.not.is.null,fecha_nacimiento.not.is.null"
    )
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
