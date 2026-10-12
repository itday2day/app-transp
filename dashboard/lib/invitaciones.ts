import type {
  EmpresaRow,
  EstadoInvitacion,
  InvitacionConEstado,
  InvitacionRow,
  RutaRow,
} from "@/lib/types";

// spec_bloque_b_invitacion_registro_login_correo.md (Hallazgo #51), criterio 20. Mismo criterio
// de prioridad que validar_invitacion() en la base (revocada > usada > vencida), para que
// Administración y el chofer nunca vean un estado distinto de la misma fila — "revocada" gana
// aunque además esté vencida, porque es la acción más reciente y deliberada de las tres.
export function calcularEstadoInvitacion(fila: InvitacionRow): EstadoInvitacion {
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

// Dominio real del Dashboard (confirmado contra el servicio de Render, srv-daf8j6tbedkc73889bo0).
const DOMINIO_DASHBOARD = "https://app-transp-dashboard.onrender.com";

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

/** Mensaje listo para copiar desde "Invitar chofer" (criterio 19): enlace + código + vencimiento
 * en Europe/Madrid. `vence_at` como Date, no string crudo -- quien llama ya tiene el valor ISO y
 * decide el formato de fecha (ver app/api/invitaciones/route.ts, usa formatFechaHora()). */
export function armarMensajeParaCopiar(
  token: string,
  codigo: string,
  venceFormateado: string
): string {
  return [
    "Te invitamos a registrarte en la app de Day2Day.",
    `Enlace: ${enlaceInvitacion(token)}`,
    `Código de respaldo (si el enlace no abre la app): ${codigo}`,
    `Válido hasta: ${venceFormateado}`,
  ].join("\n");
}
