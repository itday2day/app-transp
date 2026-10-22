// Hallazgo #69: lógica PURA de qué hacer con un texto leído del portapapeles -- sin
// expo-clipboard, sin React Native, se compila con `tsc` puro, se prueba con `node`. Dos
// funciones separadas (mismo criterio que tokenValido/codigoInvitacionCompleto en
// logicaRegistro.ts): una decide el FORMATO (sin tocar la red), la otra decide la ACCIÓN según el
// resultado YA resuelto de resolverInvitacion() (el llamador hace la llamada real, nunca esta
// función).

import type { ResultadoValidarInvitacion } from "./authCore";

const PREFIJO = "d2d-inv:";
// Criterio 5: formato estricto, tras recortar espacios -- 32 hex en MINÚSCULA, nunca
// insensible a mayúsculas (a diferencia de tokenValido() en logicaRegistro.ts, que sí acepta
// mayúsculas para el token del enlace -- acá es a propósito más estricto: la página pública
// siempre copia en minúscula, así que cualquier otra cosa no es una invitación copiada por la
// propia página).
const FORMATO_REGEX = /^d2d-inv:[0-9a-f]{32}$/;

/** `null` si el texto no cumple el formato exacto -- en ese caso el llamador NO debe tocar el
 * portapapeles ni llamar a resolverInvitacion() (criterio 5: puede ser algo que el chofer copió
 * a propósito, por otro motivo). */
export function tokenDeTextoPortapapeles(texto: string): string | null {
  const recortado = texto.trim();
  if (!FORMATO_REGEX.test(recortado)) return null;
  return recortado.slice(PREFIJO.length);
}

export type AccionPortapapeles = "ofrecer" | "ignorarYVaciar" | "ignorarYConservar";

/** Solo se llama cuando `tokenDeTextoPortapapeles` ya devolvió un token (formato correcto) --
 * decide qué hacer según el resultado YA resuelto de resolverInvitacion() para ese token.
 * Criterio 6: válida -> ofrecer; usada/vencida/revocada/no_existe -> vaciar (ya no sirve);
 * sin conexión/error -> conservar (se reintenta en el próximo arranque). */
export function decidirAccionPortapapeles(resultado: ResultadoValidarInvitacion): AccionPortapapeles {
  if (!resultado.ok) return "ignorarYConservar";
  return resultado.fila.estado === "valida" ? "ofrecer" : "ignorarYVaciar";
}

// "Una vez por arranque" (Resultados de la Fase 1, #69): variable de módulo, nunca persistida,
// nunca con el token -- se restablece sola con cada reinicio real del proceso (nunca con un fast
// refresh de Metro en desarrollo, que no reevalúa el módulo si no cambió; a probar con el .apk).
let yaRevisadoEnEsteArranque = false;

/** `true` la primera vez que se llama en este arranque (y marca que ya se consumió); `false`
 * cualquier llamada posterior, hasta el próximo reinicio real del proceso. */
export function debeRevisarPortapapelesEsteArranque(): boolean {
  if (yaRevisadoEnEsteArranque) return false;
  yaRevisadoEnEsteArranque = true;
  return true;
}
