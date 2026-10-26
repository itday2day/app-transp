// spec_catalogo_por_chofer.md (criterio 18): reglas de texto de la ventana "Agregar..." de
// CheckInForm.tsx -- extraídas de VentanaAgregarCatalogo.tsx a un módulo puro (sin imports de
// React ni de Expo) para poder probarse con Node puro, mismo criterio que catalogoUnion.ts/
// catalogoSql.ts. El límite de 60 caracteres lo aplica el propio `maxLength` del TextInput (UI,
// no probable sin RNTL -- este repo no tiene ese setup); lo de acá es lo que SÍ es Node-testable.
const DIACRITICOS = /[̀-ͯ]/g;

export const LARGO_MAXIMO_CATALOGO = 60;
export const LARGO_MINIMO_CATALOGO = 2;

/** Mayúsculas es-ES, espacios colapsados (varios espacios seguidos -> uno) y recortados. */
export function formatearEntradaCatalogo(texto: string): string {
  return texto.toLocaleUpperCase("es-ES").replace(/\s+/g, " ").trim();
}

/** Sin distinguir acentos (criterio 18 lo exige explícitamente para el chequeo de duplicado), con
 * espacios colapsados y recortados -- deliberadamente SEPARADA de normalizar() de
 * catalogoConDefecto.ts (que no quita acentos ni colapsa espacios -- ver la discrepancia
 * documentada en catalogoUnion.ts/el informe final, Corrección 1: "ÁLAMO" del servidor y "ALAMO"
 * agregado localmente son el mismo nombre para esta comparación, pero NO para normalizar()).
 * Trim+colapso de espacios ANTES de comparar hace que esta función sirva igual para texto ya
 * formateado (formatearEntradaCatalogo) o para texto crudo de la base (catalogoUnion.ts), sin
 * depender de que el llamador ya lo haya limpiado. Mismo patrón que el normalizar() local de
 * SelectorBuscable.tsx (su propio filtro de búsqueda), ampliado con el colapso de espacios. */
export function normalizarParaCompararCatalogo(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

export function habilitadoParaAgregarCatalogo(textoFormateado: string): boolean {
  return textoFormateado.length >= LARGO_MINIMO_CATALOGO;
}

export interface ResultadoAgregarCatalogo {
  /** La grafía a usar: la de `opcionesVisibles` si ya estaba (esNuevo=false), o la recién tipeada
   * (ya formateada) si no (esNuevo=true). */
  nombre: string;
  esNuevo: boolean;
}

/** Decide si `textoFormateado` ya está en `opcionesVisibles` (comparación sin acentos, criterio
 * 18) -- si está, no duplica: devuelve la grafía YA existente. Si no, lo da como nuevo. */
export function resolverAgregarCatalogo(
  textoFormateado: string,
  opcionesVisibles: string[]
): ResultadoAgregarCatalogo {
  const claveNueva = normalizarParaCompararCatalogo(textoFormateado);
  const existente = opcionesVisibles.find((item) => normalizarParaCompararCatalogo(item) === claveNueva);
  return existente ? { nombre: existente, esNuevo: false } : { nombre: textoFormateado, esNuevo: true };
}
