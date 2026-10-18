// spec_app_registro_paso5.md, «Resultados de la Fase 1b», sección 3 (capa 1): replica, SOLO del
// lado del cliente, las reglas que supabase/schema.sql hace cumplir en
// crear_chofer_desde_invitacion() (el trigger on_auth_user_created que corre en el signUp) -- nunca
// las inventa. Da un mensaje útil ANTES del signUp porque, si el trigger rechaza, el signUp real
// siempre devuelve el mismo 500 genérico sin motivo (medido en la Fase 1b: supabase-js no
// entrega el código del error). El trigger sigue siendo la única garantía real -- esto es ayuda
// de UX, no una validación de seguridad; si esta función y el trigger alguna vez divergen, manda
// el trigger.
//
// Reglas copiadas LITERAL de supabase/schema.sql (función crear_chofer_desde_invitacion,
// medidas el 2026-10-18):
//   - DNI: se normaliza igual que dashboard/lib/choferes.ts:149-151 normalizarDni() (mayúsculas,
//     se quita todo lo que no sea A-Z/0-9) y debe quedar en exactamente 9 caracteres
//     (`length(v_dni) <> 9`, schema.sql:667 -- mismo criterio que el CHECK de la columna
//     choferes.dni, schema.sql:66). El trigger normaliza más flojo (solo espacios y guiones,
//     schema.sql:625); normalizar más fuerte del lado del cliente nunca deja pasar un DNI que el
//     trigger hubiera rechazado.
//   - nombre/apellidos: no vacíos tras recortar espacios (`v_nombre = '' or v_apellidos = ''`,
//     schema.sql:677). Acá se devuelven como dos claves separadas (no una sola "datos
//     incompletos") para que el formulario marque el campo exacto.
//   - fecha de nacimiento: el texto tiene que matchear `^\d{4}-\d{2}-\d{2}$` (schema.sql:681),
//     tiene que ser una fecha de calendario real (el cast de Postgres a `date` rechaza un
//     "2026-02-30"; acá se verifica reconstruyendo la fecha), y no puede ser anterior a
//     1900-01-01 (schema.sql:691).
//   - edad mínima: 18 años cumplidos, calculados contra el día de HOY en Europe/Madrid, nunca en
//     la zona horaria del dispositivo (schema.sql:698: `(now() at time zone 'Europe/Madrid')
//     ::date - interval '18 years'`). El trigger solo rechaza si la fecha de nacimiento es
//     POSTERIOR a ese límite: cumplir 18 exactamente hoy ya es válido.
//   - teléfono: debe matchear `^\+[1-9]\d{7,14}$` (schema.sql:702) -- el mismo regex E.164 que ya
//     usa el Dashboard (TELEFONO_VALIDO_REGEX, dashboard/lib/choferes.ts:155). No hace falta
//     libphonenumber-js para esto: la regla del trigger es un regex de formato, no una
//     validación de número real -- la decisión 3 de la Fase 1c solo aprobó la librería para el
//     selector de país de CampoTelefono, un componente distinto.
//
// El orden de las comprobaciones de abajo no importa (a diferencia del trigger, que corre en
// secuencia y para en la primera que falla): se devuelven TODOS los campos con problema a la
// vez, para que el formulario los marque juntos en un solo intento.

const ZONA_MADRID = "Europe/Madrid";
const EDAD_MINIMA = 18;
const FECHA_MINIMA_ISO = "1900-01-01";

export type ClaveErrorRegistro =
  "dniInvalido" | "nombreVacio" | "apellidosVacio" | "fechaInvalida" | "edadMinima" | "telefonoInvalido";

export interface DatosRegistro {
  dni: string;
  nombre: string;
  apellidos: string;
  fechaNacimiento: string; // "AAAA-MM-DD"
  telefono: string;
}

export type ErroresRegistro = Partial<Record<keyof DatosRegistro, ClaveErrorRegistro>>;

/** Mismo criterio que dashboard/lib/choferes.ts:149-151 -- mayúsculas y se quita todo lo que no
 * sea A-Z/0-9. */
export function normalizarDni(dni: string): string {
  return dni.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const TELEFONO_VALIDO_REGEX = /^\+[1-9]\d{7,14}$/;

// Mismo truco que dashboard/lib/utils.ts:85-87 (fechaEnEspana/todayIsoDate) -- "timeZone" fija
// Europe/Madrid sin depender de la zona horaria del dispositivo, usando "formatToParts" (no
// "format" con el locale "sv-SE": nada garantiza que ese locale exista en el ICU reducido de un
// motor móvil, aunque sí exista "timeZone" -- "formatToParts" con "en-US" y campos explícitos
// arma el AAAA-MM-DD a mano, sin depender del ORDEN ni del SEPARADOR que imprima un locale).
// ⚠️ No medido todavía en el dispositivo real (sin pantallas que lo ejerzan): grep de
// "Intl.DateTimeFormat"/"toLocaleString(...timeZone" en src/ (2026-10-18) no encontró ningún otro
// uso ya probado en Hermes -- esta es la primera vez que el proyecto depende de Intl con
// "timeZone" en la app móvil (el único precedente, dashboard/lib/utils.ts, corre en el servidor/
// navegador, no en Hermes). Se verifica en el iPhone en la Fase 3 (Verificación) de
// spec_app_registro_paso5.md, cuando haya una pantalla que la ejerza.
function fechaHoyEnMadrid(): string {
  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_MADRID,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const anio = partes.find((p) => p.type === "year")?.value;
    const mes = partes.find((p) => p.type === "month")?.value;
    const dia = partes.find((p) => p.type === "day")?.value;
    if (!anio || !mes || !dia) throw new Error("formatToParts no devolvió año/mes/día");
    return `${anio}-${mes}-${dia}`;
  } catch {
    // Respaldo si Intl con "timeZone" no existe o lanza en el motor del dispositivo (Hermes
    // viejo, sin ICU completo): NUNCA se usa la zona horaria LOCAL del teléfono en silencio (que
    // podría ser cualquiera) -- se usa la fecha en UTC, documentada como respaldo, nunca como el
    // cálculo normal. Madrid va SIEMPRE por delante de UTC (+1 o +2 horas según el horario de
    // verano), así que la fecha de "hoy" en UTC es igual o ANTERIOR a la de Madrid -- nunca
    // posterior. El límite de 18 años calculado con ese "hoy" sale igual o más temprano, nunca
    // más tarde, así que este respaldo solo puede volver el chequeo MÁS estricto: el peor caso es
    // un falso "no cumple" (edad_minima) para quien cumple 18 justo ese día cerca de medianoche
    // en España -- el chofer reintenta al día siguiente. Nunca deja pasar a un menor de edad real
    // (y el trigger, además, es la garantía final de todos modos). Prueba que lo cubre: A12 (o la
    // que se agregue) en el iPhone real, un día cercano a medianoche en España, comparando contra
    // la fecha real.
    const ahora = new Date();
    const anio = ahora.getUTCFullYear();
    const mes = String(ahora.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(ahora.getUTCDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

// Resta años en el componente "año" de la fecha, igual que el INTERVAL de Postgres -- a mano,
// SIN Date.UTC: `date '2028-02-29' - interval '18 years'` en Postgres da '2010-02-28' (recorta al
// 28 de febrero si el año resultante no es bisiesto), pero `new Date(Date.UTC(2010, 1, 29))`
// "rueda" solo al 1 de marzo -- hay que replicar el recorte de Postgres a mano, no se puede
// confiar en que Date.UTC lo haga.
function restarAnios(fechaIso: string, anios: number): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const anioResultado = anio - anios;
  const diaResultado = mes === 2 && dia === 29 && !esBisiesto(anioResultado) ? 28 : dia;
  return `${anioResultado}-${String(mes).padStart(2, "0")}-${String(diaResultado).padStart(2, "0")}`;
}

// Reconstruye la fecha con Date.UTC y compara los componentes contra lo pedido -- si no coinciden
// (ej. "2026-02-30", que Date.UTC "rueda" a marzo), no es una fecha de calendario real.
function esFechaDeCalendarioReal(fechaIso: string): boolean {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

// "hoyIso" es opcional (por defecto, fechaHoyEnMadrid()) -- SOLO para que la tabla de casos
// pueda inyectar un "hoy" fijo y probar los bordes de 18 años (29 de febrero, etc.) sin depender
// de en qué fecha real se corra la prueba. La app nunca lo pasa.
export function validarDatosRegistro(
  datos: DatosRegistro,
  hoyIso: string = fechaHoyEnMadrid()
): ErroresRegistro {
  const errores: ErroresRegistro = {};

  if (normalizarDni(datos.dni).length !== 9) {
    errores.dni = "dniInvalido";
  }

  if (datos.nombre.trim() === "") {
    errores.nombre = "nombreVacio";
  }

  if (datos.apellidos.trim() === "") {
    errores.apellidos = "apellidosVacio";
  }

  const fechaTexto = datos.fechaNacimiento.trim();
  const formatoValido = /^\d{4}-\d{2}-\d{2}$/.test(fechaTexto);
  if (!formatoValido || !esFechaDeCalendarioReal(fechaTexto) || fechaTexto < FECHA_MINIMA_ISO) {
    errores.fechaNacimiento = "fechaInvalida";
  } else {
    const limiteEdadMinima = restarAnios(hoyIso, EDAD_MINIMA);
    if (fechaTexto > limiteEdadMinima) {
      errores.fechaNacimiento = "edadMinima";
    }
  }

  if (!TELEFONO_VALIDO_REGEX.test(datos.telefono.trim())) {
    errores.telefono = "telefonoInvalido";
  }

  return errores;
}
