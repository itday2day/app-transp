// Copia LITERAL (mismo criterio que numeroEmpleadoAEmail/correo.ts) de la lógica de
// dashboard/lib/telefono-pais.ts, adaptada a src/data/paises.ts (que ya trae el ISO 3166-1 en
// `codigo`, a diferencia del Dashboard que necesita un ISO_POR_PAIS aparte). Si se toca un lado,
// tocar el otro -- EXCEPCIÓN de esta ronda (spec_ajustes_pantalla_registro_limites_campos.md,
// criterio 22): el commit del Dashboard va aparte a propósito, aunque la lógica se mantenga
// equivalente entre los dos archivos.
//
// Ajuste a 13 de la spec: las longitudes de `possibleLengths()` NO cuentan el prefijo nacional
// (ej. GB: "07911123456" tiene 11 dígitos pero el máximo nacional es 10) -- por eso
// `combinarTelefono()` ahora compone el E.164 con `parsePhoneNumberFromString()` (que sí lo
// quita) en vez de concatenar `+código+dígitos` a pelo, y las funciones nuevas de este archivo
// (`limiteDigitosDelPais`, `siguienteNumeroTelefono`, `telefonoEsValido`) trabajan todas sobre
// esa misma función de la librería, nunca sobre los dígitos crudos.
//
// ⚠️ Para "¿de qué país es este E.164?" (el aviso P3) se usa `separarTelefono()` (más abajo, sin
// cambios), NUNCA `parsePhoneNumberFromString(e164).country` -- medido: para un E.164 "+44...",
// la librería puede devolver "GG" (Guernsey, un territorio que comparte el +44 con el Reino
// Unido) en vez de "GB", y "GG" no está en PAISES -- una función `paisDelTelefono()` basada en
// `.country` llegó a mostrar "España" (el país por defecto) para un número real de Reino Unido.
// `separarTelefono()` no tiene este problema: solo compara contra los códigos de marcación que
// de verdad están en PAISES (que no incluye Guernsey), así que nunca es ambiguo entre dos países
// de esta lista.

import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  Metadata,
  type CountryCode,
} from "libphonenumber-js/min";
// Import RELATIVO (no "@/"): PAISES es un valor real usado en tiempo de ejecución por varias
// funciones de este archivo -- el runner de pruebas compila este archivo aislado con
// --ignoreConfig, que no resuelve el alias "@/" (mismo motivo que logicaRecuperarContrasena.ts).
import { PAISES } from "../data/paises";

export const PAIS_TELEFONO_DEFECTO = "España";

// Techo absoluto E.164 (decisión 1 de la spec) -- ningún país puede pedir más que esto, aunque su
// possibleLengths() diera un número mayor.
const TOPE_ABSOLUTO_DIGITOS = 15;

function isoDePais(pais: string): CountryCode | null {
  const encontrado = PAISES.find((p) => p.nombre === pais);
  return (encontrado?.codigo as CountryCode) ?? null;
}

export function codigoMarcacion(pais: string): string {
  const iso = isoDePais(pais);
  return iso ? getCountryCallingCode(iso) : "";
}

// El build "/min" ya trae su propia metadata embebida -- a diferencia del script de medición de
// la Fase 1b/1c (que la pasaba a mano para poder probar el "/min" contra el "/max" del Dashboard
// desde el mismo proceso de Node), el constructor de este módulo NO acepta argumento.
const metadata = new Metadata();

/** Máximo de dígitos del NÚMERO NACIONAL (sin el código de país) según `possibleLengths()` de la
 * metadata `min` -- con el techo absoluto de 15 (decisión 1) como tope. `null` si el país no
 * resuelve ISO (dato corrupto). */
export function limiteDigitosDelPais(pais: string): number | null {
  const iso = isoDePais(pais);
  if (!iso) return null;
  metadata.selectNumberingPlan(iso);
  const plan = metadata.numberingPlan;
  if (!plan) return null;
  return Math.min(TOPE_ABSOLUTO_DIGITOS, Math.max(...plan.possibleLengths()));
}

/** `isPossible()` de la librería, partiendo del E.164 completo -- la validez real del número
 * (criterio "Aviso/validez" del Ajuste a 13), distinta del regex de validarDatosRegistro.ts
 * (ese sigue siendo el filtro previo de la capa 1, sin cambios). Vacío -> inválido (campo
 * obligatorio, lo distingue el llamador). */
export function telefonoEsValido(e164: string): boolean {
  if (!e164) return false;
  return parsePhoneNumberFromString(e164)?.isPossible() ?? false;
}

const CODIGOS_ORDENADOS = [...new Set(PAISES.map((p) => codigoMarcacion(p.nombre)))]
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

function paisDeCodigoMarcacion(codigo: string): string {
  return PAISES.find((p) => codigoMarcacion(p.nombre) === codigo)?.nombre ?? PAIS_TELEFONO_DEFECTO;
}

/** `null`/vacío/sin "+" -> país por defecto con número vacío. Dígitos sin ningún código de
 * marcación conocido -> quedan enteros en `numero`, país por defecto (nunca se pierde un dígito). */
export function separarTelefono(telefono: string | null | undefined): { pais: string; numero: string } {
  if (!telefono || !telefono.startsWith("+")) {
    return { pais: PAIS_TELEFONO_DEFECTO, numero: "" };
  }
  const digitos = telefono.slice(1);
  const codigo = CODIGOS_ORDENADOS.find((c) => digitos.startsWith(c));
  if (!codigo) {
    return { pais: PAIS_TELEFONO_DEFECTO, numero: digitos };
  }
  return { pais: paisDeCodigoMarcacion(codigo), numero: digitos.slice(codigo.length) };
}

/** Inverso de separarTelefono() -- combina país + número suelto en un E.164 completo. Si el país
 * no tiene código de marcación resuelto (dato corrupto), devuelve "" en vez de un E.164 roto --
 * validarDatosRegistro() lo rechaza igual que cualquier teléfono vacío.
 *
 * Ajuste a 13: intenta primero `parsePhoneNumberFromString()` -- si el número ya trae el prefijo
 * nacional tecleado (ej. GB "07911123456"), la librería lo reconoce y lo quita, componiendo
 * "+447911123456" (no "+4407911123456", que no se puede marcar). Si la librería todavía no
 * reconoce nada (número muy corto, en pleno tecleo) cae al armado literal `+código+dígitos`, SIN
 * perder ningún dígito -- nunca recorta en silencio. */
export function combinarTelefono(pais: string, numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (!digitos) return "";

  const iso = isoDePais(pais);
  if (iso) {
    const resultado = parsePhoneNumberFromString(digitos, iso);
    if (resultado) return resultado.number;
  }

  const codigo = codigoMarcacion(pais);
  return codigo ? `+${codigo}${digitos}` : "";
}

/** Ajuste a 13, "tope al teclear": decide si un dígito nuevo entra. Parsea el E.164 que resultaría
 * de `numeroPropuesto` (vía combinarTelefono(), que ya quita el prefijo nacional) y compara el
 * `nationalNumber` resultante contra `limiteDigitosDelPais()`. Si el parseo todavía no devuelve
 * nada (número muy corto para que la librería decida), se acepta -- nunca bloquea mientras el
 * chofer recién empieza a escribir. Nunca RECORTA: o acepta `numeroPropuesto` completo, o
 * devuelve `numeroActual` sin cambios (el dígito de más simplemente no entra). */
export function siguienteNumeroTelefono(pais: string, numeroActual: string, numeroPropuesto: string): string {
  const digitosPropuestos = numeroPropuesto.replace(/\D/g, "");
  if (digitosPropuestos.length <= numeroActual.replace(/\D/g, "").length) {
    // Se está borrando (o no cambió la cantidad de dígitos) -- nunca hay nada que rechazar al
    // borrar, solo al agregar.
    return digitosPropuestos;
  }

  const iso = isoDePais(pais);
  const resultado = iso ? parsePhoneNumberFromString(digitosPropuestos, iso) : undefined;
  if (!resultado) return digitosPropuestos;

  const limite = limiteDigitosDelPais(pais);
  if (limite === null) return digitosPropuestos;

  return resultado.nationalNumber.length <= limite ? digitosPropuestos : numeroActual;
}
