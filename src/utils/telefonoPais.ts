// Copia LITERAL (mismo criterio que numeroEmpleadoAEmail/correo.ts) de la lógica de
// dashboard/lib/telefono-pais.ts, adaptada a src/data/paises.ts (que ya trae el ISO 3166-1 en
// `codigo`, a diferencia del Dashboard que necesita un ISO_POR_PAIS aparte). Si se toca un lado,
// tocar el otro en el mismo commit.

import { getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import { PAISES } from "@/data/paises";

export const PAIS_TELEFONO_DEFECTO = "España";

export function codigoMarcacion(pais: string): string {
  const encontrado = PAISES.find((p) => p.nombre === pais);
  return encontrado ? getCountryCallingCode(encontrado.codigo as CountryCode) : "";
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
 * validarDatosRegistro() lo rechaza igual que cualquier teléfono vacío. */
export function combinarTelefono(pais: string, numero: string): string {
  const codigo = codigoMarcacion(pais);
  const digitos = numero.replace(/\D/g, "");
  return codigo && digitos ? `+${codigo}${digitos}` : "";
}
