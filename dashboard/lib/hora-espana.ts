// Conversión entre componentes de reloj de pared en Europe/Madrid e
// instantes UTC — para LEER lo que un administrador escribe en un
// formulario (el editor de check-out, editar-jornada-dialog.tsx). Mismo
// criterio de fondo que dashboard/lib/rango-fechas-espana.ts (Hallazgo
// #17), pero no se reusa ese módulo ni se lo toca (explícitamente cerrado,
// Hallazgo #20): ese archivo resuelve un problema más angosto (límites de
// UN DÍA para filtrar un rango), y acá hace falta cualquier hora dentro del
// día, en las dos direcciones (leer Y escribir). Se acepta duplicar el
// mecanismo de desfase (~15 líneas, ya verificado en el #17) antes que
// tocar un archivo cerrado.

const ZONA_ESPANA = "Europe/Madrid";

// Desfase (en minutos, +60 o +120 según la época del año) de España
// respecto a UTC en el instante `instante` — nunca un número fijo a mano,
// España alterna horario de verano/invierno. Mismo mecanismo que
// rango-fechas-espana.ts: formatear el instante COMO SI se mostrara en
// España, interpretar esa hora de pared como si fuera UTC, y comparar
// contra el instante original.
// ⚠️ Si cambiás este cálculo, cambialo también en rango-fechas-espana.ts
// (su propia desfaseMinutos, mismo algoritmo) — una divergencia entre las
// dos copias no tira ningún error: da una hora corrida durante parte del
// año, y recién se nota en el cambio de horario de marzo/octubre.
// Pendiente con disparador: extraer a un módulo compartido la próxima vez
// que se toque cualquiera de los dos archivos — cuando eso pase, adoptar la
// firma `(instante, zona)` de rango-fechas-espana.ts (ya es la general).
// Ver contexto_proyecto.md §4.
function desfaseMinutos(instante: Date): number {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_ESPANA,
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

/** Componentes de reloj de pared en España ("YYYY-MM-DD" y "HH:mm" por
 * separado, como los espera un <input type="date"> + un input de texto de
 * hora) de un instante ISO. */
export function componentesEnEspana(iso: string): { fecha: string; hora: string } {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_ESPANA,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const partes = Object.fromEntries(
    formateador.formatToParts(new Date(iso)).map(({ type, value }) => [type, value])
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

/** Instante UTC (ISO 8601) correspondiente a una fecha+hora de reloj de
 * pared en España — "YYYY-MM-DD" + "HH:mm", como los entregan los dos
 * inputs del editor de check-out. */
export function instanteEnEspanaComoUtc(fechaIso: string, horaHHmm: string): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const [hora, minuto] = horaHHmm.split(":").map(Number);
  const primeraAproximacion = Date.UTC(anio, mes - 1, dia, hora, minuto, 0);
  const desfase = desfaseMinutos(new Date(primeraAproximacion));
  return new Date(primeraAproximacion - desfase * 60_000).toISOString();
}
