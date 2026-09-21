import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Las tres cosas se declaran explícito, no solo la zona: timeZone fija QUÉ
// instante de reloj de pared se muestra (sin esto, cada navegador usa la
// zona de su propio dispositivo — el mismo bug de fondo que los Hallazgos
// #17/#18, ahora en la presentación); locale fija el ORDEN de la fecha (sin
// esto, un navegador en inglés puede mostrar mes antes que día — "09/10"
// sin poder saber si es 9 de octubre o 10 de septiembre, en una pantalla
// que sustenta pagos); hour12 fija 12 vs. 24 horas (sin esto, un locale
// distinto puede mostrar AM/PM). Los tres dependen de un valor AMBIENTE del
// entorno si no se declaran — mismo criterio que ya se aplicó en el
// Hallazgo #18 del lado del servidor (Excel), acá del lado del cliente.
const ZONA_ESPANA_PRESENTACION = "Europe/Madrid";
const LOCALE_ESPANA = "es-ES";

/** Formatea un ISO 8601 a fecha+hora corta, siempre en hora de España. */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString(LOCALE_ESPANA, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_ESPANA_PRESENTACION,
  });
}

/** Formatea un ISO 8601 a fecha corta (sin hora), siempre en el día de calendario de España. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString(LOCALE_ESPANA, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_ESPANA_PRESENTACION,
  });
}

/** "hace X s/min/h" a partir de un ISO 8601, para el panel de choferes activos. */
export function formatHaceTiempo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const entonces = new Date(iso).getTime();
  if (Number.isNaN(entonces)) return "—";
  const segundos = Math.max(0, Math.floor((Date.now() - entonces) / 1000));
  if (segundos < 5) return "justo ahora";
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

const ZONA_ESPANA = "Europe/Madrid";

// Día de calendario "YYYY-MM-DD" tal como se ve en España — el locale sv-SE
// de Intl ya formatea en ese orden, así que alcanza con fijar `timeZone`.
// Funciona igual sin importar la zona horaria del dispositivo (Intl aplica
// `timeZone` explícito, no la zona del sistema) — a propósito NO se usa
// `toISOString()` (UTC): cerca de medianoche en España eso devuelve el día
// siguiente o anterior al real (Hallazgo #17). Los rangos de fecha de
// reportes siempre son días de calendario de España, nunca UTC ni la zona
// del dispositivo del administrador — ver contexto_proyecto.md §4.
function fechaEnEspana(fecha: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA_ESPANA }).format(fecha);
}

export function todayIsoDate(): string {
  return fechaEnEspana(new Date());
}

// setUTCDate (no setDate): resta los días en el calendario UTC, que no tiene
// horario de verano — evita que el resultado dependa de en qué zona horaria
// esté el navegador del administrador, antes de reformatear en España.
export function daysAgoIsoDate(days: number): string {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() - days);
  return fechaEnEspana(fecha);
}

/** Primer día del mes actual, en España — "YYYY-MM-01". */
export function firstDayOfMonthIsoDate(): string {
  return `${todayIsoDate().slice(0, 7)}-01`;
}
