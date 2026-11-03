/** SQL del reclamo atómico de una jornada al sincronizar (spec_reclamo_atomico_sincronizacion.md,
 * Hallazgo #81) -- sin imports de React ni de expo, para poder probarse con node:sqlite contra el
 * esquema literal de database.ts, mismo criterio que catalogoSql.ts.
 *
 * Una jornada en 'sincronizando' lleva en `sincronizandoDesde` (milisegundos) la hora en que la
 * reclamó la ejecución que la está subiendo. Pasado PLAZO_RESERVA_SINCRONIZACION_MS se da por
 * abandonada (proceso muerto a mitad de la subida) y cualquier ejecución puede volver a
 * reclamarla, sin sumar intento. Una 'sincronizando' sin hora (huérfana de antes de esta columna)
 * cuenta como vencida desde el primer ciclo. */

// 5 minutos, decidido por César (2026-11-03): más de 100 veces la subida típica medida (unos
// pocos segundos) y muy por debajo de los 60 minutos del criterio de la tarea 3.7.
export const PLAZO_RESERVA_SINCRONIZACION_MS = 5 * 60 * 1000;

// Lo que el ciclo puede (re)tomar: pendiente, error, o una reserva vencida/huérfana. Un solo `?`:
// el límite (ahora - plazo), por debajo del cual una reserva ya no está viva.
const CONDICION_RECLAMABLE = `(sincronizacion IN ('pendiente', 'error')
  OR (sincronizacion = 'sincronizando' AND (sincronizandoDesde IS NULL OR sincronizandoDesde < ?)))`;

/** Parámetros: [limiteReserva(ahora)]. */
export const SQL_PENDIENTES_SINCRONIZACION = `SELECT * FROM jornadas WHERE ${CONDICION_RECLAMABLE}
  ORDER BY fechaCheckIn ASC`;

/** Una sola sentencia: solo la ejecución que obtiene `changes === 1` sube la jornada.
 * Parámetros: [ahora, id, limiteReserva(ahora)]. No toca `intentosSincronizacion`: una reserva
 * vencida no cuenta como intento. */
export const SQL_RECLAMAR_JORNADA = `UPDATE jornadas SET sincronizacion = 'sincronizando', sincronizandoDesde = ?
  WHERE id = ? AND ${CONDICION_RECLAMABLE}`;

// Cierre condicional: solo si la fila sigue reservada por ESTA ejecución (misma hora de reserva).
// Una ejecución lenta cuya reserva venció y otra reclamó no pisa nada, ni un 'sincronizado' ya
// escrito ni el intento que cuente la otra. Parámetros de los tres: [id, reservadaDesde].
const CONDICION_RESERVA_PROPIA = `id = ? AND sincronizacion = 'sincronizando' AND sincronizandoDesde = ?`;

export const SQL_MARCAR_SINCRONIZADO = `UPDATE jornadas SET sincronizacion = 'sincronizado', sincronizandoDesde = NULL
  WHERE ${CONDICION_RESERVA_PROPIA}`;

export const SQL_MARCAR_ERROR = `UPDATE jornadas
  SET sincronizacion = 'error', intentosSincronizacion = intentosSincronizacion + 1, sincronizandoDesde = NULL
  WHERE ${CONDICION_RESERVA_PROPIA}`;

export const SQL_MARCAR_PENDIENTE_SIN_CONTAR = `UPDATE jornadas SET sincronizacion = 'pendiente', sincronizandoDesde = NULL
  WHERE ${CONDICION_RESERVA_PROPIA}`;

export function limiteReserva(ahora: number): number {
  return ahora - PLAZO_RESERVA_SINCRONIZACION_MS;
}
