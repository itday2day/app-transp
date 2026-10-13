import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarDni } from "@/lib/choferes";
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
// PostgREST exige comillas dobles alrededor de un valor que use caracteres reservados en su
// mini-lenguaje de filtros (`,`, `.`, `:`, `(`, `)`) dentro de `.or()` -- sin esto, el texto del
// campo "Chofer" (`,()%*` incluidos, Hallazgo #51 paso 3b criterio 10) podría romper el filtro
// entero o alterar qué compara cada cláusula, no solo devolver cero resultados. Comillar
// SIEMPRE (no solo cuando hace falta) evita tener que decidir qué caracteres son reservados: un
// valor sin ninguno de ellos queda igual de bien comillado.
function valorPostgrestEntreComillas(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Resuelve los `id` de `choferes` cuyo nombre, apellidos o DNI (normalizado, Hallazgo #51 paso
 * 3b criterio 10) coinciden con el texto del filtro "Chofer". */
async function resolverChoferIdsPorTexto(
  supabase: SupabaseClient<Database>,
  texto: string
): Promise<string[]> {
  const patronNombre = valorPostgrestEntreComillas(`%${texto}%`);
  const clausulas = [`nombre.ilike.${patronNombre}`, `apellidos.ilike.${patronNombre}`];

  const dniNormalizado = normalizarDni(texto);
  if (dniNormalizado) {
    clausulas.push(`dni.ilike.${valorPostgrestEntreComillas(`%${dniNormalizado}%`)}`);
  }

  const { data, error } = await supabase.from("choferes").select("id").or(clausulas.join(","));
  // ⚠️ Si esto falla y se ignora, el filtro de texto "Chofer" sigue funcionando a medias (solo
  // con el `ilike` sobre `chofer_nombre`, sin los ids resueltos) y el resultado PARECE completo
  // sin estarlo -- en /api/reportes/exportar eso es un Excel incompleto que sustenta pagos, sin
  // ningún aviso. Se propaga el error: aplicarFiltrosJornadas() no lo atrapa tampoco (ver abajo),
  // así que quien llama tiene que capturarlo y responder error, nunca seguir en silencio.
  if (error) {
    throw new Error(
      `No se pudo resolver el filtro de chofer contra la tabla choferes: ${error.message}`
    );
  }
  return (data ?? []).map((fila) => fila.id);
}

/** Aplica los filtros de empresa/chofer/estado/rango de fechas sobre
 * `fecha_check_in` a una consulta de Supabase ya armada (`.from("jornadas")
 * .select(...)`, antes de `.order()`/`.range()`) — mismo criterio en
 * cualquier lugar que filtre jornadas por estos campos.
 *
 * `chofer` ahora resuelve contra `choferes` (nombre/apellidos/DNI), no solo contra el texto
 * congelado de `jornadas.chofer_nombre` (Hallazgo #51, paso 3b, criterio 10) -- por eso la
 * función es async y necesita el cliente de Supabase, no solo la consulta ya armada. Se
 * conserva el `ilike` sobre `chofer_nombre` en la misma cláusula `.or()`, combinado con los
 * `id` resueltos, para no perder ningún caso que el comportamiento anterior sí encontraba
 * (p.ej. una jornada vieja cuyo `chofer_nombre` ya no coincide con el `nombre` actual del
 * chofer, si se corrigió después).
 *
 * ⚠️ Devuelve `{ query }`, no `query` directo: el builder de Supabase es "thenable" (tiene
 * `.then()`), y una función `async` que hiciera `return query` desataría el auto-unwrap que el
 * propio lenguaje aplica a cualquier valor thenable devuelto desde un `async function` --
 * `await aplicarFiltrosJornadas(...)` terminaría devolviendo el RESULTADO ya ejecutado de la
 * consulta (`PostgrestSingleResponse`), no el builder, y el `.order()`/`.range()` de quien llama
 * fallaría en tiempo de compilación (confirmado: así fallaba antes de este envoltorio).
 *
 * ⚠️ NO atrapa el error de `resolverChoferIdsPorTexto`: se propaga tal cual a quien llama.
 * Cada Route Handler que use esta función tiene que envolver su llamada en `try/catch` y
 * responder error (500), nunca dejar que la consulta de jornadas siga con un filtro parcial. */
export async function aplicarFiltrosJornadas<
  Q extends {
    ilike(columna: ColumnaJornadas, patron: string): Q;
    eq(columna: ColumnaJornadas, valor: string): Q;
    gte(columna: ColumnaJornadas, valor: string): Q;
    lt(columna: ColumnaJornadas, valor: string): Q;
    or(filtro: string): Q;
  },
>(
  supabase: SupabaseClient<Database>,
  query: Q,
  filtros: FiltrosJornadasComunes
): Promise<{ query: Q }> {
  let resultado = query;
  if (filtros.empresa) resultado = resultado.ilike("empresa", `%${filtros.empresa}%`);
  if (filtros.chofer) {
    const choferIds = await resolverChoferIdsPorTexto(supabase, filtros.chofer);
    // Los ids son UUID generados por la propia base -- sin caracteres reservados de PostgREST,
    // seguros de interpolar directo en `in.(...)`. El texto del usuario, en cambio, SOLO entra
    // ya comillado (valorPostgrestEntreComillas).
    const clausulaIds = choferIds.length > 0 ? `chofer_id.in.(${choferIds.join(",")}),` : "";
    const patronNombre = valorPostgrestEntreComillas(`%${filtros.chofer}%`);
    resultado = resultado.or(`${clausulaIds}chofer_nombre.ilike.${patronNombre}`);
  }
  if (filtros.estado) resultado = resultado.eq("estado", filtros.estado);
  if (filtros.desde) resultado = resultado.gte("fecha_check_in", inicioDiaEspanaUtc(filtros.desde));
  if (filtros.hasta)
    resultado = resultado.lt("fecha_check_in", finDiaEspanaUtcExclusivo(filtros.hasta));
  return { query: resultado };
}
