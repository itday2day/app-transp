// spec_app_registro_paso5.md, paso 2c-0, punto P5: cuenta regresiva de 60s (reenvío de código,
// reenviarCodigo()/pedirRecuperacion()) basada en MARCA DE TIEMPO, no en un contador que se
// decrementa -- un contador propio se desfasa si la pantalla pasa a segundo plano (Android/iOS
// puede pausar temporizadores JS, pero el reloj del sistema sigue andando). Sin dependencias de
// RN/React -- igual que authCore.ts/restaurarSesion.ts, se compila con `tsc` puro y se prueba con
// `node`.

/**
 * Pura: segundos restantes (entero, siempre >= 0, redondeado hacia ARRIBA -- "quedan 2s" sigue
 * siendo true en el segundo 58.3, no se muestra "quedan 1s" hasta que de verdad falta 1 o menos)
 * entre `inicioMs` y `ahoraMs`, dados `duracionSegundos` totales. `ahoraMs` es un parámetro, no
 * `Date.now()` leído acá dentro -- así la prueba pasa casos literales fijos sin esperar segundos
 * de verdad, y el hook (useCuentaRegresiva.ts) es el único que le pasa el reloj real.
 */
export function segundosRestantes(inicioMs: number, duracionSegundos: number, ahoraMs: number): number {
  // Math.max(0, ...): si `ahoraMs` llega ANTES de `inicioMs` (reloj del dispositivo retrocedido,
  // o un valor de prueba fuera de orden), el tiempo transcurrido nunca es negativo -- sin esto,
  // un transcurrido negativo SUMABA tiempo de más (más que `duracionSegundos`) en vez de devolver,
  // como mucho, la duración completa.
  const transcurridoMs = Math.max(0, ahoraMs - inicioMs);
  const restanteMs = duracionSegundos * 1000 - transcurridoMs;
  if (restanteMs <= 0) return 0;
  return Math.ceil(restanteMs / 1000);
}
