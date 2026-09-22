import { finDiaEspanaUtcExclusivo, inicioDiaEspanaUtc } from "@/lib/rango-fechas-espana";
import type { EstadoJornada } from "@/lib/types";

// Una sola fuente de verdad sobre qué jornadas entran en un filtro por
// empresa/chofer/estado/rango de fechas — GET /api/jornadas (la tabla) y
// POST /api/reportes/exportar (el reporte) armaban cada uno su propia
// consulta con la misma lógica repetida en paralelo; eso fue lo que produjo
// que un reporte pudiera traer menos jornadas de las que mostraba la tabla
// sin que nada lo avisara (Hallazgo #21, ver contexto_proyecto.md §4). De
// acá en más, cualquier lugar que necesite este filtro pasa por esta misma
// función — dos implementaciones del mismo criterio es exactamente lo que
// hay que evitar.

/** Tope de jornadas que un reporte puede traer en un solo envío — un solo
 * valor, usado tanto por `POST /api/reportes/exportar` (server, para el
 * `.limit()` de la consulta y para detectar truncamiento) como por el
 * diálogo de exportar (client, para bloquear ANTES de generar un archivo
 * que sabemos que va a quedar corto) — ver contexto_proyecto.md §4. */
export const MAX_JORNADAS_POR_REPORTE = 5000;

export interface FiltrosJornadasComunes {
  empresa?: string;
  chofer?: string;
  estado?: EstadoJornada | "";
  /** Día de calendario de España (YYYY-MM-DD), inclusive — u "" / undefined
   * para "sin límite inferior". */
  desde?: string;
  /** Día de calendario de España (YYYY-MM-DD), inclusive — u "" / undefined
   * para "sin límite superior". */
  hasta?: string;
}

// `Q` sin restricción (`extends ConsultaFiltrable`) a propósito: el builder
// de supabase-js es un tipo genérico ya de por sí muy anidado (cambia de
// forma en cada `.select()`/`.returns()`, y este proyecto no tiene un
// `Database` generado que lo simplifique), y CUALQUIER intento de acotarlo
// con un genérico propio — probado con un genérico auto-referenciado y con
// uno basado en `this` — dispara "Type instantiation is excessively deep"
// del compilador. Es una limitación conocida de supabase-js sin schema
// generado, no un error de modelado acá. La firma pública sigue siendo
// `Q -> Q`: quien llama pasa su consulta y recibe exactamente ese mismo
// tipo de vuelta, sin perder nada — el `as ConsultaFiltrable` de abajo es
// interno, para poder invocar los 4 métodos sin repetir la lucha con el
// tipo genérico en cada línea.
interface ConsultaFiltrable {
  ilike(columna: string, patron: string): ConsultaFiltrable;
  eq(columna: string, valor: string): ConsultaFiltrable;
  gte(columna: string, valor: string): ConsultaFiltrable;
  lt(columna: string, valor: string): ConsultaFiltrable;
}

/** Aplica los filtros de empresa/chofer/estado/rango de fechas sobre
 * `fecha_check_in` a una consulta de Supabase ya armada (`.from("jornadas")
 * .select(...)`, antes de `.order()`/`.range()`) — mismo criterio en
 * cualquier lugar que filtre jornadas por estos campos. */
export function aplicarFiltrosJornadas<Q>(query: Q, filtros: FiltrosJornadasComunes): Q {
  let resultado = query as unknown as ConsultaFiltrable;
  if (filtros.empresa) resultado = resultado.ilike("empresa", `%${filtros.empresa}%`);
  if (filtros.chofer) resultado = resultado.ilike("chofer_nombre", `%${filtros.chofer}%`);
  if (filtros.estado) resultado = resultado.eq("estado", filtros.estado);
  if (filtros.desde) resultado = resultado.gte("fecha_check_in", inicioDiaEspanaUtc(filtros.desde));
  if (filtros.hasta)
    resultado = resultado.lt("fecha_check_in", finDiaEspanaUtcExclusivo(filtros.hasta));
  return resultado as unknown as Q;
}
