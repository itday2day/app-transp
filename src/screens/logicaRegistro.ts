// spec_app_registro_paso5.md, paso 2c-3: lógica PURA de RegistroScreen -- qué hacer con
// validarInvitacion()/registrarChofer() (authCore.ts). Mismo criterio que el resto de la familia
// accionDeResultado*: sin React, sin i18n, se compila con `tsc` puro, se prueba con `node`.

import type {
  ResultadoValidarInvitacion,
  ResultadoRegistro,
  EstadoInvitacion,
  DatosInvitacion,
} from "@/services/authCore";
import type { ClaveErrorRegistro } from "@/utils/validarDatosRegistro";
import type { ClaveTraduccion } from "@/i18n";

/** Las 4 claves de "invitación inválida" comparten el mismo nombre en authCore.ts
 * (ClaveInvitacionInvalida) y en es.json/en.json (namespace `registro`, ya existentes) -- este
 * Record es la única traducción entre los dos. */
const CLAVE_INVITACION_INVALIDA: Record<Exclude<EstadoInvitacion, "valida">, ClaveTraduccion> = {
  no_existe: "registro.invitacionNoExiste",
  revocada: "registro.invitacionRevocada",
  vencida: "registro.invitacionVencida",
  usada: "registro.invitacionUsada",
};

// criterio 1: "Un token que no sean 32 hexadecimales se ignora (la pantalla pide el código a
// mano)" -- el deep link (apptransp://invitacion/:token, RootNavigator.tsx) entrega CUALQUIER
// string como param, sin validar formato; el filtro es esta función, llamada antes de pedir nada
// al servidor.
const TOKEN_VALIDO_REGEX = /^[0-9a-f]{32}$/i;

export function tokenValido(token: string | undefined): string | undefined {
  return token && TOKEN_VALIDO_REGEX.test(token) ? token : undefined;
}

// Criterio 15: el código de invitación ESCRITO A MANO (8 caracteres) es un alfabeto distinto del
// token del deep link (32 hex) -- 32 símbolos, sin I/O/0/1 (schema.sql, generar_codigo_invitacion():
// 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', medido en la Fase 1, punto 8). Mayúsculas automáticas, sin
// espacios ni guiones (mismo criterio de limpieza que usa el propio `validar_invitacion` del
// servidor, schema.sql: `upper(regexp_replace(..., '[\s-]', '', 'g'))`), y cualquier otro
// carácter (incluida la Ñ, los 0/1, o una letra I/O) se descarta en vez de dejarlo pasar.
const ALFABETO_CODIGO_INVITACION = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LONGITUD_CODIGO_INVITACION = 8;

export function normalizarCodigoInvitacion(texto: string): string {
  const limpio = texto.toUpperCase().replace(/[\s-]/g, "");
  let resultado = "";
  for (const caracter of limpio) {
    if (ALFABETO_CODIGO_INVITACION.includes(caracter)) resultado += caracter;
  }
  return resultado.slice(0, LONGITUD_CODIGO_INVITACION);
}

export function codigoInvitacionCompleto(texto: string): boolean {
  return normalizarCodigoInvitacion(texto).length === LONGITUD_CODIGO_INVITACION;
}

/** Criterio 17 (spec_precarga_con_codigo_8_caracteres.md): ¿el valor actual de un campo precargado
 * sigue igual a lo que llegó de la invitación? -- usada por la pantalla (3b) para decidir si se
 * muestra la marca "Cargado por Administración" o si el chofer ya lo editó. Compara ya
 * normalizado (sin espacios de más AL INICIO/FINAL, sin distinguir mayúsculas/minúsculas) --
 * NUNCA el texto crudo. La normalización ESPECÍFICA de cada campo (el DNI ya viene en mayúsculas
 * de normalizarDni(), el teléfono ya combinado a E.164 con su país vía combinarTelefono(), nunca
 * el texto crudo del campo numérico suelto) es responsabilidad del llamador, antes de pasar los
 * dos valores acá -- esta función no sabe nada de países ni de DNIs, solo compara dos strings.
 *
 * ⚠️ Corrección: `trim()` solo quita espacios de los EXTREMOS -- espacios dobles (u otros)
 * DENTRO del valor ("Juan  Carlos" vs "Juan Carlos") NO se colapsan, así que esos dos NO cuentan
 * como iguales a propósito (no es el mismo caso que "un espacio de más al final", que la spec sí
 * pide tratar como igual).
 *
 * `valorPrecargado === null`, o vacío tras recortarlo (""/"   ") -- el campo nunca vino de la
 * invitación con un valor real (abierta, ese dato en particular no estaba atado, o la invitación
 * lo trae como cadena vacía) -- siempre "sin marca", sin importar qué haya tecleado el chofer. */
export function sigueIgualAPrecargado(valorActual: string, valorPrecargado: string | null): boolean {
  if (valorPrecargado === null || valorPrecargado.trim() === "") return false;
  return valorActual.trim().toUpperCase() === valorPrecargado.trim().toUpperCase();
}

/** Lo que el formulario necesita comparar para decidir las marcas -- los mismos 5 campos de
 * DatosInvitacion menos `dni` (criterio 13: el DNI atado NUNCA lleva esta marca, conserva su
 * propio aviso de siempre, registro.dniBloqueadoAviso). */
export interface ValoresActualesFormulario {
  nombre: string;
  apellidos: string;
  telefono: string;
  fechaNacimiento: string | null;
  correo: string;
}

export interface MarcasPrecargadas {
  nombre: boolean;
  apellidos: boolean;
  telefono: boolean;
  fechaNacimiento: boolean;
  correo: boolean;
}

/** Criterio 17: un booleano por campo, "¿sigue igual a lo precargado?" -- `precargado` es el
 * `DatosInvitacion` tal cual llegó de resolverInvitacion()/aplicarDatosInvitacion() (RegistroScreen.tsx),
 * sin volver a tocarlo. `precargado === null` (nunca se llegó a aplicar nada, p. ej. la
 * invitación todavía no resolvió o no es válida) -> ningún campo lleva marca, igual que una
 * invitación abierta (los 6 campos en `null`) -- los dos casos pasan por el mismo
 * sigueIgualAPrecargado(), que ya trata `null` como "sin marca".
 *
 * Formatos ya confirmados contra RegistroScreen.tsx antes de escribir esto (mismo lado en los
 * dos valores de cada comparación, nunca el texto crudo de un campo numérico suelto):
 * - telefono: E.164 en los dos lados -- el estado `telefono` del formulario SIEMPRE lo guarda ya
 *   combinado con el país (CampoTelefono.tsx, onCambiar -> combinarTelefono()), y `datos.telefono`
 *   llega igual de la base (el Dashboard también lo combina con combinarTelefono() antes de
 *   guardar). Nunca el número suelto sin el prefijo.
 * - fechaNacimiento: "YYYY-MM-DD" en los dos lados -- SelectorFecha.tsx arma la misma fechaIso al
 *   elegir, y `datos.fecha_nacimiento` llega así de la columna `date` (confirmado en el Paso 2,
 *   HTTP real: "1996-06-06"), nunca un formato de pantalla ("05/05/1995").
 * - nombre/apellidos/correo: texto simple, se comparan recortados (sigueIgualAPrecargado ya lo
 *   hace) -- correo no necesita ninguna normalización extra del llamador: el formulario no lo
 *   normaliza más que un `.trim()` propio al enviar (RegistroScreen.tsx, correoValido), lo mismo
 *   que ya hace esta función. */
export function marcasPrecargadas(
  precargado: DatosInvitacion | null,
  actual: ValoresActualesFormulario
): MarcasPrecargadas {
  return {
    nombre: sigueIgualAPrecargado(actual.nombre, precargado?.nombre ?? null),
    apellidos: sigueIgualAPrecargado(actual.apellidos, precargado?.apellidos ?? null),
    telefono: sigueIgualAPrecargado(actual.telefono, precargado?.telefono ?? null),
    fechaNacimiento: sigueIgualAPrecargado(
      actual.fechaNacimiento ?? "",
      precargado?.fecha_nacimiento ?? null
    ),
    correo: sigueIgualAPrecargado(actual.correo, precargado?.email ?? null),
  };
}

export interface FechaIsoDescompuesta {
  dia: string;
  /** 0-based (0 = enero) -- el mismo índice que ya usa MESES.indexOf()/MESES[...] en
   * SelectorFecha.tsx. Esta función nunca devuelve el NOMBRE del mes: necesitaría las 12
   * traducciones de `MESES` (i18n), y este archivo se mantiene sin React, sin i18n -- el
   * llamador (que ya tiene `MESES` en su propio scope) hace `MESES[mesIndice]`. */
  mesIndice: number;
  anio: string;
}

/** Corrección (spec_precarga_con_codigo_8_caracteres.md, Paso 3c): descompone un ISO
 * "YYYY-MM-DD" en las piezas que SelectorFecha.tsx necesita para su estado inicial -- SIN `Date`
 * ni husos horarios (un `Date` interpreta el string en UTC o en la zona local según el motor, con
 * riesgo real de correr un día para fechas cercanas a medianoche). Partir el string a mano y
 * validar cada parte como entero es determinista en cualquier huso.
 *
 * `dia` y `anio` ya van en el MISMO formato que usan las opciones de los desplegables de
 * SelectorFecha.tsx (confirmado leyendo ese archivo antes de escribir esto): día de 2 cifras con
 * cero a la izquierda (`diasDisponibles`: `.padStart(2, "0")`), año como string SIN padding
 * (`aniosDisponibles`: `String(anio)`) -- si no coinciden exactamente, el desplegable no
 * reconoce el valor como ninguna de sus opciones y se ve vacío (justo el síntoma medido en el
 * iPhone antes de esta corrección).
 *
 * Tolera mes/día de 1 o 2 cifras en la ENTRADA (por si algún dato llegara sin el cero, aunque lo
 * medido contra la base real en el Paso 2 siempre lo trae con 2 cifras) y SIEMPRE devuelve `dia`
 * ya con 2 cifras -- el formato de salida es el único que le importa al desplegable.
 *
 * ⚠️ No valida que el día exista en ese mes (ej. "2021-04-31", abril solo tiene 30) -- esa
 * garantía sigue siendo de `validarDatosRegistro()`/el trigger; esta función solo decide qué
 * mostrar en los tres desplegables, nunca si la fecha es válida para registrarse.
 *
 * Vacío, `null`, o mal formado (incluido un mes o día fuera de 1-12/1-31) -> `null` --
 * SelectorFecha.tsx queda con los tres desplegables en blanco, igual que hoy sin este valor. */
export function descomponerFechaIso(valor: string | null): FechaIsoDescompuesta | null {
  if (!valor) return null;
  const partes = valor.split("-");
  if (partes.length !== 3) return null;
  const [anioTexto, mesTexto, diaTexto] = partes;
  if (!/^\d{4}$/.test(anioTexto) || !/^\d{1,2}$/.test(mesTexto) || !/^\d{1,2}$/.test(diaTexto)) {
    return null;
  }
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    dia: String(dia).padStart(2, "0"),
    mesIndice: mes - 1,
    anio: anioTexto,
  };
}

export type AccionValidarInvitacion = { tipo: "valida" } | { tipo: "error"; textoClave: ClaveTraduccion };

/** R3: un fallo de red/servidor (`motivo: "sinConexion"|"error"`) NUNCA se traduce como "la
 * invitación no existe" -- siempre comun.sinConexion/comun.errorGenerico, reintentables. Solo un
 * `estado` real (la invitación SÍ se pudo leer) puede dar una de las 4 claves de
 * CLAVE_INVITACION_INVALIDA. */
export function accionDeResultadoValidarInvitacion(
  resultado: ResultadoValidarInvitacion
): AccionValidarInvitacion {
  if (!resultado.ok) {
    return {
      tipo: "error",
      textoClave: resultado.motivo === "sinConexion" ? "comun.sinConexion" : "comun.errorGenerico",
    };
  }
  if (resultado.fila.estado === "valida") return { tipo: "valida" };
  return { tipo: "error", textoClave: CLAVE_INVITACION_INVALIDA[resultado.fila.estado] };
}

/** Hallazgo #68: qué única acción mostrar en la pantalla de invitación no válida cuando el
 * token viene del ENLACE (nunca del código de 8 escrito a mano -- manejarValidarInvitacionManual()
 * en RegistroScreen.tsx no cambia, ver criterio 6 corregido). `resultado.fila.estado === "valida"`
 * nunca debería llegar acá -- el llamador ya lo desvía a la fase "formulario" antes de llamar a
 * esta función (ver accionDeResultadoValidarInvitacion). */
export type AccionInvitacionNoValida = "iniciarSesion" | "otroCodigo" | "reintentar";

const ACCION_POR_ESTADO_INVITACION: Record<Exclude<EstadoInvitacion, "valida">, AccionInvitacionNoValida> = {
  usada: "iniciarSesion",
  vencida: "otroCodigo",
  revocada: "otroCodigo",
  no_existe: "otroCodigo",
};

/** Hallazgo #68, corrección tras la prueba real (2026-10-23): qué debe valer el estado
 * `invitacion` de RegistroScreen.tsx después de resolver el token del ENLACE -- `invitacion` es
 * justo lo que `manejarRegistrar()` manda en `registrarChofer()`/`signUp`. Con `""` ahí (el bug
 * real: el efecto de montaje vaciaba el campo SIEMPRE, sin importar el resultado) el trigger
 * rechaza y la revalidación da "no_existe", aunque la invitación siga vigente. Válida -> el
 * propio token (es el valor que necesita el signUp); cualquier otro resultado -> "" (para que
 * "Tengo otro código" abra el campo realmente vacío). */
export function invitacionTrasResolverEnlace(token: string, resultado: ResultadoValidarInvitacion): string {
  return resultado.ok && resultado.fila.estado === "valida" ? token : "";
}

export function accionParaEstadoInvitacion(resultado: ResultadoValidarInvitacion): AccionInvitacionNoValida {
  if (!resultado.ok) return "reintentar";
  // Defensivo: "valida" no debería llegar acá (ver comentario de arriba) -- si pasara, no hay
  // acción de "invitación no válida" que mostrar; "reintentar" es el fallback menos dañino.
  if (resultado.fila.estado === "valida") return "reintentar";
  return ACCION_POR_ESTADO_INVITACION[resultado.fila.estado];
}

export type AccionResultadoRegistro =
  | { tipo: "pantallaCodigo" }
  // criterio 5: identities:[] -- ya existe una cuenta CONFIRMADA con ese correo. Tipo propio (no
  // "error" genérico) porque la spec pide DOS botones acá ("Iniciar sesión" y "Recuperar
  // contraseña"), no solo un texto -- la pantalla decide qué pintar según el tipo.
  | { tipo: "correoYaRegistrado" }
  | { tipo: "error"; textoClave: ClaveTraduccion }
  | { tipo: "esperar"; segundos: number; textoClave: ClaveTraduccion };

/** Todas las claves de error ya existen en es.json/en.json (namespace `registro` + `comun.*`),
 * confirmado por grep antes de escribir esto -- ninguna clave nueva. */
export function accionDeResultadoRegistro(resultado: ResultadoRegistro): AccionResultadoRegistro {
  switch (resultado.clave) {
    case "pantallaCodigo":
      return { tipo: "pantallaCodigo" };
    case "correoYaRegistrado":
      return { tipo: "correoYaRegistrado" };
    case "esperar":
      return { tipo: "esperar", segundos: resultado.segundos, textoClave: "comun.esperarCodigo" };
    case "sinConexion":
      return { tipo: "error", textoClave: "comun.sinConexion" };
    case "contrasenaDebil":
      return { tipo: "error", textoClave: "comun.contrasenaDebil" };
    case "invitacionNoExiste":
      return { tipo: "error", textoClave: "registro.invitacionNoExiste" };
    case "invitacionRevocada":
      return { tipo: "error", textoClave: "registro.invitacionRevocada" };
    case "invitacionVencida":
      return { tipo: "error", textoClave: "registro.invitacionVencida" };
    case "invitacionUsada":
      return { tipo: "error", textoClave: "registro.invitacionUsada" };
    case "genericoConPista":
      return { tipo: "error", textoClave: "registro.genericoConPista" };
    case "generico":
      return { tipo: "error", textoClave: "comun.errorGenerico" };
    default: {
      const _nunca: never = resultado;
      return _nunca;
    }
  }
}

/** Traduce una clave de ErroresRegistro (validarDatosRegistro(), ya existente) a su clave de
 * i18n -- mismo namespace `registro`, mismo nombre, ya existentes. */
const CLAVE_ERROR_CAMPO: Record<ClaveErrorRegistro, ClaveTraduccion> = {
  dniInvalido: "registro.dniInvalido",
  nombreVacio: "registro.nombreVacio",
  apellidosVacio: "registro.apellidosVacio",
  fechaInvalida: "registro.fechaInvalida",
  edadMinima: "registro.edadMinima",
  telefonoInvalido: "registro.telefonoInvalido",
};

export function claveErrorCampo(clave: ClaveErrorRegistro): ClaveTraduccion {
  return CLAVE_ERROR_CAMPO[clave];
}
