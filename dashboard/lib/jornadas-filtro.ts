import { finDiaEspanaUtcExclusivo, inicioDiaEspanaUtc } from "@/lib/rango-fechas-espana";
import type { Database } from "@/lib/supabase/database.types";
import type { EstadoJornada } from "@/lib/types";

/** Nombres reales de columna de `jornadas`, tomados del `Database` generado
 * (ver `npm run types:supabase`) — no un `string` suelto. Es lo que hace que
 * un typo acá (`"chofer_nombr"`) lo rechace `tsc`, no PostgREST en runtime. */
type ColumnaJornadas = keyof Database["public"]["Tables"]["jornadas"]["Row"];

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

// `Q` con un genérico auto-referenciado (`Q extends {...}: Q`) — antes de
// tener un `Database` generado, CUALQUIER intento de acotarlo así disparaba
// "Type instantiation is excessively deep" del compilador (limitación
// conocida de supabase-js sin schema, ver contexto_proyecto.md §6). Con el
// `Database` ya generado, ese error no reaparece — probado quitando
// cualquier cast y confirmado con `tsc --noEmit` limpio.
//
// ⚠️ Lo que SÍ hay que cuidar acá es que la constraint tipe `columna` como
// `ColumnaJornadas`, no como `string` suelto: un primer intento con
// `columna: string` en la constraint compilaba igual de limpio, pero NO
// atrapaba un typo deliberado (`"chofer_nombr"` pasaba `tsc` sin quejarse) —
// porque dentro del cuerpo de una función genérica, TypeScript solo ve la
// constraint, nunca el tipo real con el que se instancia `Q` en cada
// llamador. La constraint es la única verificación real que existe acá
// adentro; si su `columna` es `string`, la función entera queda tan sin
// chequear como antes de generar el `Database`, aunque compile limpio y
// aunque el builder real de Supabase sí tenga sus propios nombres de columna
// correctos — confirmado empíricamente con el mismo typo antes de escribir
// esto.
/** Aplica los filtros de empresa/chofer/estado/rango de fechas sobre
 * `fecha_check_in` a una consulta de Supabase ya armada (`.from("jornadas")
 * .select(...)`, antes de `.order()`/`.range()`) — mismo criterio en
 * cualquier lugar que filtre jornadas por estos campos. */
export function aplicarFiltrosJornadas<
  Q extends {
    ilike(columna: ColumnaJornadas, patron: string): Q;
    eq(columna: ColumnaJornadas, valor: string): Q;
    gte(columna: ColumnaJornadas, valor: string): Q;
    lt(columna: ColumnaJornadas, valor: string): Q;
  },
>(query: Q, filtros: FiltrosJornadasComunes): Q {
  let resultado = query;
  if (filtros.empresa) resultado = resultado.ilike("empresa", `%${filtros.empresa}%`);
  if (filtros.chofer) resultado = resultado.ilike("chofer_nombre", `%${filtros.chofer}%`);
  if (filtros.estado) resultado = resultado.eq("estado", filtros.estado);
  if (filtros.desde) resultado = resultado.gte("fecha_check_in", inicioDiaEspanaUtc(filtros.desde));
  if (filtros.hasta)
    resultado = resultado.lt("fecha_check_in", finDiaEspanaUtcExclusivo(filtros.hasta));
  return resultado;
}
