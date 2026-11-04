// spec_enviado_visible_y_aviso_al_salir.md (Hallazgo #82), Fase 2 (criterios 3, 4, 12, 13, 15):
// lógica PURA de qué estado debe mostrar la franja de envío -- sin React Native, se compila con
// `tsc` puro y se prueba con `node --test` (mismo criterio que avisoVersionCore.ts/
// logicaPortapapeles.ts: separar la decisión de la lectura real a SQLite, que el llamador hace).

import type { Jornada } from "@/types";

export type EstadoFranjaEnvio = "oculta" | "enviando" | "enviado" | "error";

type JornadaParaFranja = Pick<Jornada, "sincronizacion" | "intentosSincronizacion">;

// `maxIntentos` llega como parámetro (no se importa MAX_INTENTOS de syncService.ts): ese archivo
// instancia el cliente Supabase y registra un listener de AppState en su propio módulo (ver
// src/lib/supabase.ts) -- importarlo (aunque sea solo por una constante) rompe `node --test` fuera
// del runtime de React Native. El llamador real (FranjaEnvio.tsx, dentro de la app) sí importa
// MAX_INTENTOS de syncService.ts con normalidad y lo pasa acá.
//
/** Criterio 12: cuenta lo que NO está sincronizado todavía -- el llamador debe pasar el
 * resultado de una lectura que incluya 'pendiente', 'sincronizando' Y 'error' (ver
 * `obtenerNoSincronizadasDeChofer` en jornadasRepo.ts). `obtenerPendientesSincronizacion()`
 * (la del reclamo atómico, #81) NO sirve acá: su condición "reclamable" excluye a propósito una
 * fila 'sincronizando' con reserva vigente (se está subiendo en este momento) -- usarla haría que
 * la franja dijera "Enviado" mientras la jornada todavía está subiendo. */
function hayErrorAgotado(jornadas: JornadaParaFranja[], maxIntentos: number): boolean {
  return jornadas.some((j) => j.sincronizacion === "error" && j.intentosSincronizacion >= maxIntentos);
}

/** Reductor puro: dado el estado que el chofer está viendo AHORA MISMO y la lista de jornadas no
 * sincronizadas, decide el PRÓXIMO estado. Determinista, sin variables de módulo ni temporizadores
 * -- el "retraso mínimo" (criterio 6) y el auto-ocultado de "enviado" (criterio 3, "desaparece
 * sola a los pocos segundos") son responsabilidad del componente (temporizadores reales), no de
 * esta función.
 *
 * Criterio 15 ("Enviado" solo si la franja ya estuvo visible este arranque): acá "ya estuvo
 * visible" se expresa como `estadoActual === "enviando" || estadoActual === "error"` -- la ÚNICA
 * forma de llegar a "enviado" es viniendo de un estado en el que el chofer ya vio la franja. Si
 * `estadoActual` es "oculta" (nunca hubo nada pendiente este arranque, o ya se auto-ocultó un
 * "enviado" anterior) y ahora no hay nada pendiente, el resultado es "oculta" -- nunca aparece un
 * "Enviado" de la nada. */
export function siguienteEstadoFranjaEnvio(
  estadoActual: EstadoFranjaEnvio,
  jornadas: JornadaParaFranja[],
  maxIntentos: number
): EstadoFranjaEnvio {
  if (hayErrorAgotado(jornadas, maxIntentos)) return "error";
  if (jornadas.length > 0) return "enviando";

  // Nada pendiente ahora mismo (ni con error agotado).
  if (estadoActual === "enviando" || estadoActual === "error") return "enviado";
  return estadoActual;
}
