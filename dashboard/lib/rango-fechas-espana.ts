// Convierte un día de calendario de España ("YYYY-MM-DD", tal como lo
// entrega un <input type="date">) al instante UTC que hay que comparar
// contra una columna `timestamptz` de Postgres — único lugar de esta
// conversión, usado desde los Route Handlers que filtran/exportan jornadas
// por rango de fechas (Hallazgo #17, ver contexto_proyecto.md §4).
//
// Por qué hace falta esto y no alcanza con `${fecha}T00:00:00`: esa cadena,
// sin offset, la interpreta Postgres en la zona horaria de la SESIÓN (la de
// Supabase, UTC) — no en la de España. Una jornada que arrancó a las 00:30
// de Madrid (22:30 o 23:30 UTC del día anterior, según la época del año)
// quedaba fuera de su propio día de calendario español.

const ZONA_ESPANA = "Europe/Madrid";

// Desfase (en minutos, +60 o +120 según la época del año — España nunca usa
// un número fijo) de España respecto a UTC en el instante `instante`.
// Formatea ese instante COMO SI se mostrara en España, interpreta esa hora
// de pared como si fuera UTC, y compara contra el instante original — la
// diferencia es el desfase vigente ese día. Evita sumar/restar horas a
// mano, que falla la mitad del año con el horario de verano.
function desfaseMinutos(instante: Date, zona: string): number {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes = Object.fromEntries(
    formateador.formatToParts(instante).map(({ type, value }) => [type, value])
  );
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second)
  );
  return (comoUtc - instante.getTime()) / 60_000;
}

function medianocheEspanaComoUtc(fechaIso: string): Date {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const primeraAproximacion = Date.UTC(anio, mes - 1, dia, 0, 0, 0);
  const desfase = desfaseMinutos(new Date(primeraAproximacion), ZONA_ESPANA);
  return new Date(primeraAproximacion - desfase * 60_000);
}

// Date.UTC normaliza automáticamente un `día` que se pasa de fin de mes
// (ej. día 32 de enero -> 1 de febrero), así que sumar 1 acá no necesita
// ningún caso especial de fin de mes/año.
function siguienteDiaIso(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

/** Instante UTC (ISO 8601) del inicio de `fechaIso` en España — el límite
 * inferior (inclusive, `.gte()`) de ese día de calendario. */
export function inicioDiaEspanaUtc(fechaIso: string): string {
  return medianocheEspanaComoUtc(fechaIso).toISOString();
}

/** Instante UTC (ISO 8601) del inicio del día SIGUIENTE a `fechaIso` en
 * España — el límite superior exclusivo (`.lt()`) de ese día de calendario.
 * Intervalo semiabierto a propósito: `<= 23:59:59` (o `.999`) pierde la
 * última fracción de segundo del día si algún timestamp tiene más
 * precisión; con un límite exclusivo no hay ese borde. */
export function finDiaEspanaUtcExclusivo(fechaIso: string): string {
  return medianocheEspanaComoUtc(siguienteDiaIso(fechaIso)).toISOString();
}
