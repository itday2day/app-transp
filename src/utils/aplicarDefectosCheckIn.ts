// Ronda de revisión (bug real encontrado en CheckInForm.tsx, paso 2c-4): decisión PURA de qué
// `empresa`/`ruta` debería tener el formulario dado Usuario.empresaDefecto/rutaDefecto -- antes
// vivía partida en DOS bloques de ajuste de estado durante el render, cada uno con su propio
// `useState` de "procesado". Dos bugs reales de esa versión, los dos arreglados acá:
//
// (a) Cuando empresaDefecto Y rutaDefecto llegaban juntos, en el MISMO render, con `empresa`
//     todavía en null: el bloque de empresa llamaba a `setEmpresa(...)`, pero la variable local
//     `empresa` seguía en null DURANTE ese mismo render (setState no muta la variable ya leída).
//     El bloque de ruta, que corría justo después, comparaba `empresa === empresaDefecto` contra
//     ese `empresa` todavía viejo -> la comparación daba `false` aunque la empresa SÍ se acababa
//     de resolver -- y aun así marcaba `rutaDefecto` como "procesado". En el siguiente render ya
//     no había ninguna condición que lo volviera a intentar: la ruta por defecto se perdía para
//     siempre. Acá los dos se calculan EN ORDEN dentro de la misma función: `ruta` usa el
//     `empresa` ya resuelto en esta misma llamada, nunca un estado de React potencialmente viejo.
//
// (b) El estado inicial (y la comparación de la ruta) usaban empresaDefecto/rutaDefecto EN CRUDO,
//     sin pasar por grafiaDeLista()/normalizar() (catalogoConDefecto.ts) -- si la fila de
//     Usuario.empresaDefecto (construirUsuarioDesdeChofer(), authCore.ts, lee `empresas.nombre`
//     vía el embed de la FK `empresa_defecto_id`) difiere en mayúsculas/espacios de la grafía que
//     trae el catálogo local (empresasDisponibles -- spec_catalogo_por_chofer.md, criterio 16:
//     ya no hay bundle de respaldo, arranca vacío hasta que SQLite responde con la unión real del
//     servidor y catalogoLocalPendiente), `rutasPorEmpresa[empresa]` (clave EXACTA) no
//     encontraba nada, y rutasPorEmpresaConDefecto creaba una clave NUEVA con solo esa ruta en vez
//     de reusar la lista completa de la empresa real. Acá toda comparación usa normalizar(), y
//     `empresa`/`ruta` resueltos siempre terminan con la grafía del catálogo cuando existe ahí.

import { listaConDefecto, grafiaDeLista, normalizar } from "./catalogoConDefecto";

export interface ParametrosAplicarDefectosCheckIn {
  empresa: string | null;
  ruta: string;
  /** true en cuanto el chofer tocó empresa o ruta a mano -- ningún defecto se aplica. */
  tocada: boolean;
  empresaDefecto: string | null;
  rutaDefecto: string | null;
  empresasDisponibles: string[];
  rutasPorEmpresa: Record<string, string[]>;
}

export interface ResultadoAplicarDefectosCheckIn {
  empresa: string | null;
  ruta: string;
}

export function aplicarDefectosCheckIn(
  parametros: ParametrosAplicarDefectosCheckIn
): ResultadoAplicarDefectosCheckIn {
  const { tocada, empresaDefecto, rutaDefecto, empresasDisponibles, rutasPorEmpresa } = parametros;

  // El chofer ya eligió algo a mano -- ningún defecto pisa esa elección, nunca.
  if (tocada) return { empresa: parametros.empresa, ruta: parametros.ruta };

  // 1) Empresa primero -- nunca se pisa una ya elegida (por el chofer o por una resolución previa).
  let empresa = parametros.empresa;
  if (empresa === null && empresaDefecto) {
    const empresasConDefecto = listaConDefecto(empresasDisponibles, empresaDefecto);
    empresa = grafiaDeLista(empresasConDefecto, empresaDefecto);
  }

  // 2) Ruta DESPUÉS, usando el `empresa` YA resuelto arriba en esta misma llamada -- nunca el
  // valor de un render anterior. Comparación normalizada (bug b): `empresa` puede llevar la
  // grafía del catálogo, distinta de `empresaDefecto` en crudo, y aun así ser "la misma" empresa.
  let ruta = parametros.ruta;
  const empresaCoincideConDefecto =
    empresa !== null && empresaDefecto !== null && normalizar(empresa) === normalizar(empresaDefecto);
  if (ruta === "" && rutaDefecto && empresaCoincideConDefecto) {
    const rutasDeEstaEmpresa = listaConDefecto(rutasPorEmpresa[empresa as string] ?? [], rutaDefecto);
    ruta = grafiaDeLista(rutasDeEstaEmpresa, rutaDefecto) ?? rutaDefecto;
  }

  return { empresa, ruta };
}
