// spec_catalogo_por_chofer.md (criterios 16-19): unión pura de lo que bajó de Supabase
// (catalogoEmpresas/catalogoRutas, vía catalogoRepo.ts) con lo que el chofer agregó localmente
// (catalogoLocalPendiente) -- la grafía del servidor siempre gana si el mismo nombre ya está ahí
// bajo otra grafía. "El mismo nombre" lo decide normalizarParaCompararCatalogo() (mayúsculas
// es-ES, SIN acentos, espacios colapsados/recortados) -- NO normalizar() de catalogoConDefecto.ts,
// que no quita acentos ni colapsa espacios y por eso dejaba dos filas ("ÁLAMO" del servidor y
// "ALAMO" agregado localmente) sin unirse nunca (Corrección 1, 2026-10-26). normalizar() de
// catalogoConDefecto.ts NO se tocó -- otras funciones (listaConDefecto/grafiaDeLista/
// aplicarDefectosCheckIn) dependen de su comportamiento actual. Sin imports de React ni de Expo,
// para poder probarse con node:sqlite/Node puro, mismo criterio que catalogoSql.ts.
import { normalizarParaCompararCatalogo } from "./agregarCatalogoTexto";
import type { ParEmpresaRuta, FilaCatalogoLocalPendiente } from "@/db/catalogoSql";

/** Lista del servidor + lo agregado localmente que todavía no esté ahí (comparación sin acentos
 * ni espacios de más, la grafía del servidor gana). Usado tanto para empresas como para la lista
 * de rutas de una empresa puntual. */
export function unirListaConPendientes(servidor: string[], pendientes: string[]): string[] {
  const normalizadosServidor = new Set(servidor.map(normalizarParaCompararCatalogo));
  const resultado = [...servidor];
  const yaAgregados = new Set<string>();
  for (const nombre of pendientes) {
    const clave = normalizarParaCompararCatalogo(nombre);
    if (normalizadosServidor.has(clave) || yaAgregados.has(clave)) continue;
    yaAgregados.add(clave);
    resultado.push(nombre);
  }
  return resultado;
}

/** Igual que unirListaConPendientes, pero agrupado por empresa -- las rutas pendientes de una
 * empresa que YA existe en el servidor (aunque con otra grafía) se agregan bajo la grafía del
 * servidor; las de una empresa que todavía no existe en ningún catálogo descargado (recién creada
 * por el chofer, junto con su ruta) abren su propia clave, con la grafía tal cual quedó guardada. */
export function unirRutasPorEmpresaConPendientes(
  servidorPorEmpresa: Record<string, string[]>,
  pendientesRutas: FilaCatalogoLocalPendiente[]
): Record<string, string[]> {
  const resultado: Record<string, string[]> = {};
  for (const [empresa, rutas] of Object.entries(servidorPorEmpresa)) {
    resultado[empresa] = [...rutas];
  }

  const grafiaServidorPorClave = new Map<string, string>();
  for (const empresa of Object.keys(servidorPorEmpresa)) {
    grafiaServidorPorClave.set(normalizarParaCompararCatalogo(empresa), empresa);
  }

  for (const fila of pendientesRutas) {
    if (fila.tipo !== "ruta") continue;
    const empresaDestino =
      grafiaServidorPorClave.get(normalizarParaCompararCatalogo(fila.empresa)) ?? fila.empresa;
    const listaActual = resultado[empresaDestino] ?? [];
    const yaEsta = listaActual.some(
      (nombre) => normalizarParaCompararCatalogo(nombre) === normalizarParaCompararCatalogo(fila.nombre)
    );
    resultado[empresaDestino] = yaEsta ? listaActual : [...listaActual, fila.nombre];
  }

  return resultado;
}

/** Criterio 19 (diagnóstico 7): filas de catalogoLocalPendiente cuyo nombre normalizado (y, para
 * rutas, la empresa normalizada) ya aparece en el catálogo recién descargado -- esas ya cumplieron
 * su propósito (hacer que el nombre fuera seleccionable mientras el servidor no lo tenía todavía) y
 * se pueden borrar sin perder nada: de ahora en más esa fila la trae el propio catalogoEmpresas/
 * catalogoRutas. Pura: el llamador (catalogoRepo.ts) hace la lectura real de `pendientes` antes de
 * abrir la transacción atómica y pasa el resultado de esta función como el tercer parámetro de
 * construirSqlReemplazoCatalogo(). */
export function filasPendientesAEliminar(
  pendientes: FilaCatalogoLocalPendiente[],
  empresas: string[],
  rutas: ParEmpresaRuta[]
): FilaCatalogoLocalPendiente[] {
  const empresasNormalizadas = new Set(empresas.map(normalizarParaCompararCatalogo));
  const rutasNormalizadas = new Set(
    rutas.map(
      (r) => `${normalizarParaCompararCatalogo(r.empresa)}\u0000${normalizarParaCompararCatalogo(r.nombre)}`
    )
  );

  return pendientes.filter((fila) =>
    fila.tipo === "empresa"
      ? empresasNormalizadas.has(normalizarParaCompararCatalogo(fila.nombre))
      : rutasNormalizadas.has(
          `${normalizarParaCompararCatalogo(fila.empresa)}\u0000${normalizarParaCompararCatalogo(fila.nombre)}`
        )
  );
}
