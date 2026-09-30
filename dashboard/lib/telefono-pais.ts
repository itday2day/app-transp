import { getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import { ISO_POR_PAIS, PAISES } from "@/lib/paises";

// spec_telefono_pais_selector.md: España es donde opera la empresa — arranca acá cuando no hay
// teléfono cargado (alta nueva, o edición de uno de los 5 choferes reales que hoy tienen
// telefono = null).
export const PAIS_TELEFONO_DEFECTO = "España";

/** Código de marcación (sin "+") de un país de PAISES, vía libphonenumber-js/min — solo se usa
 * esta función para eso, nunca para validar ni formatear el número en sí (fuera de alcance).
 * ISO_POR_PAIS es `Record<string, string>` (no `CountryCode`, el tipo específico de la librería)
 * porque son 193 códigos escritos a mano contra una fuente externa (Fase 1) — el cast acá es el
 * único lugar donde se cruza con el tipo de la librería, ya verificado 193/193 sin throw. */
export function codigoMarcacion(pais: string): string {
  const iso = ISO_POR_PAIS[pais];
  return iso ? getCountryCallingCode(iso as CountryCode) : "";
}

// Códigos de marcación únicos entre los 193 países, del más largo al más corto — un código NUNCA
// es prefijo de otro entre los ~206 que expone la librería (verificado programáticamente antes de
// escribir esto: la asignación de códigos de país es libre de prefijos por diseño), pero se ordena
// igual por longitud como pide la spec, defensivo y sin costo.
const CODIGOS_ORDENADOS = [...new Set(PAISES.map(codigoMarcacion))].sort(
  (a, b) => b.length - a.length
);

/** Tres códigos de los 193 son compartidos por más de un país (+1: 13 países del Caribe/NANP,
 * +39: Italia/Ciudad del Vaticano, +7: Rusia/Kazajistán) — sin más contexto (el resto del número)
 * no hay forma de saber cuál exactamente, y desambiguar por prefijo de área está fuera de alcance.
 * Se elige el primero en el orden de PAISES (alfabético) de forma determinística. */
function paisDeCodigoMarcacion(codigo: string): string {
  return PAISES.find((pais) => codigoMarcacion(pais) === codigo) ?? PAIS_TELEFONO_DEFECTO;
}

/** Separa un `telefono` E.164 ya guardado (`+<código><número>`) en el país (de PAISES) y el resto
 * del número, para precargar el formulario al editar. `null`/vacío/sin "+" devuelve el país por
 * defecto con el número vacío — cubre tanto el alta como la edición de un chofer sin teléfono.
 * Si los dígitos no empiezan con ningún código de marcación conocido (dato corrupto o de un país
 * fuera de los 193), no se pierde ningún dígito: quedan enteros en `numero` con el país por
 * defecto preseleccionado — el admin lo nota y corrige a mano antes de guardar, en vez de que el
 * formulario reescriba en silencio un número que no reconoce. */
export function separarTelefono(telefono: string | null | undefined): {
  pais: string;
  numero: string;
} {
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
