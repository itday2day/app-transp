// spec_app_registro_paso5.md, cierre de 2c (Parte 2 de esta ronda): decisión PURA de qué hace
// RecuperarContrasenaScreen al pulsar "Enviar" -- sin React, se compila con `tsc` puro y se
// prueba con `node`, mismo criterio que accionDeResultadoLogin.ts/logicaRegistro.ts.

// Import RELATIVO (no el alias "@/") a propósito: a diferencia del resto de la familia
// accionDeResultado*/logica*.ts, que solo importan TIPOS (import type, erasados al compilar y
// nunca convertidos en un require() real), sugerirCorreo() es una función de verdad que SÍ hace
// falta en tiempo de ejecución -- el runner de pruebas (specs/pruebas_auth/ejecutar_todo.js)
// compila este archivo aislado con `--ignoreConfig`, que NO resuelve el alias "@/" (confirmado:
// un require("@/utils/sugerirCorreo") en el .js generado rompe con MODULE_NOT_FOUND). Una ruta
// relativa sí la resuelve node directamente, sin tocar la configuración del runner.
import { sugerirCorreo } from "../utils/sugerirCorreo";

export type AccionAlEnviarRecuperacion =
  { tipo: "preguntarSugerencia"; sugerencia: string } | { tipo: "enviar" };

/**
 * "Solo se pregunta una vez por valor de correo" -- `correoYaDecidido` es el último correo (ya
 * recortado) para el que el chofer ya contestó la pregunta de la sugerencia (aceptándola o
 * manteniendo el suyo), o `null` si todavía no contestó ninguna. Si el correo actual coincide con
 * `correoYaDecidido`, no se vuelve a preguntar aunque sugerirCorreo() siga devolviendo algo (la
 * decisión ya está tomada para ESE valor exacto) -- si el chofer edita el campo después, el nuevo
 * valor ya no coincide y la pregunta puede volver a aparecer si corresponde.
 */
export function accionAlEnviarRecuperacion(
  correo: string,
  correoYaDecidido: string | null
): AccionAlEnviarRecuperacion {
  const correoLimpio = correo.trim();
  if (correoLimpio !== correoYaDecidido) {
    const sugerencia = sugerirCorreo(correoLimpio);
    if (sugerencia) return { tipo: "preguntarSugerencia", sugerencia };
  }
  return { tipo: "enviar" };
}
