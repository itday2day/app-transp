// spec_app_registro_paso5.md, cierre de 2c (Parte 2 de esta ronda): sugerencia de corrección de
// correo para RecuperarContrasenaScreen -- función PROPIA, no reusa sugerirCorreccionCorreo()
// (correo.ts), que tiene otra lista de dominios y otro criterio de empate (ahí, un empate entre
// dos o más dominios a la misma distancia no sugiere nada; acá, se elige el primero de la lista en
// un empate -- pedido explícito de esta ronda, no un descuido).
//
// Regla de seguridad (criterio 12 de la spec): esta función NUNCA puede usarse para decir si un
// correo existe o no en el sistema -- solo compara el DOMINIO contra una lista de dominios
// populares, nunca llama a nada que consulte el backend. RecuperarContrasenaScreen.tsx, que es su
// único llamador, no debe (y no puede, con esta función) mostrar ningún mensaje del tipo "este
// correo no existe".

import { distanciaEdicion } from "./correo";

export const DOMINIOS_COMUNES = [
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.com",
  "outlook.es",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "live.com",
] as const;

/** Compara un dominio YA normalizado (o no -- normaliza internamente para poder probarse solo,
 * sin pasar por sugerirCorreo()) contra DOMINIOS_COMUNES. `null` si ya es exactamente uno de la
 * lista o si el más cercano queda a más de 2 ediciones. En un empate, el PRIMERO de la lista en
 * alcanzar la distancia mínima (orden de declaración de DOMINIOS_COMUNES) -- a diferencia de
 * sugerirCorreccionCorreo() (correo.ts), que en un empate no sugiere nada. */
export function mejorDominioComun(dominio: string): string | null {
  const limpio = dominio.trim().toLowerCase();
  if ((DOMINIOS_COMUNES as readonly string[]).includes(limpio)) return null;

  let mejor: string | null = null;
  let mejorDistancia = Infinity;
  for (const candidato of DOMINIOS_COMUNES) {
    const distancia = distanciaEdicion(limpio, candidato);
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejor = candidato;
    }
  }
  return mejorDistancia <= 2 ? mejor : null;
}

/** `null` si: no tiene EXACTAMENTE una "@"; falta la parte local o el dominio; el dominio ya es
 * uno de DOMINIOS_COMUNES; o ningún dominio de la lista queda a 2 ediciones o menos. Nunca lanza,
 * nunca bloquea -- es una sugerencia, la pantalla decide qué hacer con ella. */
export function sugerirCorreo(correo: string): string | null {
  const limpio = correo.trim().toLowerCase();
  const partes = limpio.split("@");
  if (partes.length !== 2) return null;

  const [parteLocal, dominio] = partes;
  if (!parteLocal || !dominio) return null;

  const sugerido = mejorDominioComun(dominio);
  return sugerido ? `${parteLocal}@${sugerido}` : null;
}
