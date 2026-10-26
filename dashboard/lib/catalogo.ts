import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** spec_catalogo_empresas_rutas.md (Hallazgo #48): normalización del catálogo de empresas y
 * rutas, al guardar (servidor), no en la interfaz. Un solo lugar -- a diferencia de DNI/matrícula
 * (que se duplican entre dashboard/ y src/ porque los dos sub-proyectos escriben esos campos),
 * acá solo el Dashboard escribe al catálogo (la app nunca lo hace, decisión ya tomada), así que
 * esta es la única copia que hace falta en todo el proyecto -- usada por los dos Route Handlers
 * que pueden crear una empresa/ruta nueva (jornadas/crear y jornadas/editar).
 *
 * Empresas Y RUTAS en MAYÚSCULAS (regla confirmada, criterios 15 a 19 de la spec -- la decisión
 * original de que las rutas "conservaban lo escrito" quedó revertida antes de cerrar el hallazgo,
 * sin llegar a producción): medido con un script real (toLocaleUpperCase("es") sobre las 19
 * empresas de src/data/empresas.ts, las 8 que aparecen en jornadas reales, y las rutas de las dos
 * fuentes) que preserva Ñ/acentos correctamente y es idempotente -- el CHECK (nombre =
 * upper(nombre)) de la base, en las dos tablas, es la garantía real; esto es lo que arma el valor
 * correcto antes de llegar ahí. */
export function normalizarNombreEmpresa(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
}

export function normalizarNombreRuta(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
}

/** spec_catalogo_por_chofer.md (Etapa 2, corrección del punto 2 de Fase 1): equivalente en
 * JavaScript de la columna generada `clave_normalizada` de empresas/rutas --
 * `upper(f_unaccent(regexp_replace(trim(nombre), '\s+', ' ', 'g')))` (schema_v26_catalogo_por_
 * chofer.sql). Es una clave de comparación MÁS estricta que normalizarNombreEmpresa/Ruta (también
 * ignora acentos), nunca lo que se guarda como `nombre`.
 *
 * "NFD + quitar diacríticos combinables" no alcanza solo: no cubre los caracteres SIN forma de
 * descomposición Unicode (Æ, Œ, Ł, Ø, Đ) -- el diccionario `unaccent` de Postgres sí los resuelve
 * (medido contra la base real), así que se sustituyen a mano, ANTES del NFD. `ß` no necesita mapa:
 * `toUpperCase()` de JS ya lo convierte a "SS" (comportamiento de casing de ECMAScript, probado en
 * las pruebas de este archivo). Los apóstrofes curvos (‘ ’) se normalizan al recto (') antes de lo
 * demás -- no afecta la clave en sí, pero evita que dos formas del mismo nombre con apóstrofe
 * distinto parezcan iguales por accidente al comparar el texto crudo en otro lugar. */
const SIN_DESCOMPOSICION_UNICODE: Record<string, string> = {
  Æ: "AE",
  æ: "ae",
  Œ: "OE",
  œ: "oe",
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ø: "O",
  ø: "o",
};

const PATRON_DIACRITICOS_COMBINABLES = /[̀-ͯ]/g;
const PATRON_SIN_DESCOMPOSICION = /[ÆæŒœŁłĐđØø]/g;
const PATRON_APOSTROFES_CURVOS = /[‘’]/g;

export function claveNormalizada(nombre: string): string {
  const colapsado = nombre.trim().replace(/\s+/g, " ");
  const apostrofeRecto = colapsado.replace(PATRON_APOSTROFES_CURVOS, "'");
  const sinLigaduras = apostrofeRecto.replace(
    PATRON_SIN_DESCOMPOSICION,
    (caracter) => SIN_DESCOMPOSICION_UNICODE[caracter] ?? caracter
  );
  const sinDiacriticos = sinLigaduras.normalize("NFD").replace(PATRON_DIACRITICOS_COMBINABLES, "");
  return sinDiacriticos.toUpperCase();
}

/** Lo que ve el administrador cuando, tras un 23505 real de la base, releer por
 * `clave_normalizada` tampoco encuentra ninguna fila (caso fuera del "best-effort" cubierto por
 * claveNormalizada -- la verdad final siempre es la columna generada de la base, nunca esta
 * función JS). Nunca se devuelve como un 500 crudo: el Route Handler que llama a
 * obtenerOCrearEmpresa/obtenerOCrearRuta la atrapa y responde 409 con este mensaje. */
export class ColisionCatalogoError extends Error {
  constructor(public readonly tipo: "empresa" | "ruta") {
    super(
      tipo === "empresa"
        ? "Ya existe una empresa con un nombre equivalente."
        : "Ya existe una ruta con un nombre equivalente."
    );
    this.name = "ColisionCatalogoError";
  }
}

// Código de Postgres para "unique_violation" -- dos pedidos concurrentes que intentan crear la
// misma empresa/ruta nueva (la misma fracción de segundo), o un nombre equivalente por acentos a
// uno que ya existe (clave_normalizada). El índice único es la garantía real; esto solo decide qué
// hacer cuando la garantía frena el segundo intento: en vez de devolver un error al administrador,
// se reutiliza la fila que ganó la carrera.
const CODIGO_UNIQUE_VIOLATION = "23505";

/** Reutiliza la empresa existente (por clave_normalizada -- sin distinguir mayúsculas, espacios NI
 * acentos, ver claveNormalizada) o la crea -- llamado al CONFIRMAR la jornada, nunca al tocar
 * "Agregar" (⚠️3 de la spec: cancelar el diálogo no pasa por aquí, solo el POST final de
 * crear/editar). */
export async function obtenerOCrearEmpresa(
  supabase: SupabaseClient<Database>,
  nombreCrudo: string
): Promise<string> {
  const nombre = normalizarNombreEmpresa(nombreCrudo);
  const clave = claveNormalizada(nombre);

  const { data: existente } = await supabase
    .from("empresas")
    .select("id")
    .eq("clave_normalizada", clave)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: creada, error } = await supabase
    .from("empresas")
    .insert({ nombre })
    .select("id")
    .single();
  if (error?.code === CODIGO_UNIQUE_VIOLATION) {
    const { data: ganadora } = await supabase
      .from("empresas")
      .select("id")
      .eq("clave_normalizada", clave)
      .maybeSingle();
    if (ganadora) return ganadora.id;
    console.error(
      `obtenerOCrearEmpresa: 23505 sin fila encontrada por clave_normalizada para "${nombre}"`
    );
    throw new ColisionCatalogoError("empresa");
  }
  if (error || !creada) {
    throw new Error(
      `No se pudo crear la empresa "${nombre}": ${error?.message ?? "sin fila devuelta"}`
    );
  }
  return creada.id;
}

/** Mismo criterio que obtenerOCrearEmpresa, pero la unicidad es por (empresa_id,
 * clave_normalizada) -- una ruta "Centro" de la empresa A y otra "Centro" de la empresa B no son
 * la misma fila. */
export async function obtenerOCrearRuta(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  nombreCrudo: string
): Promise<string> {
  const nombre = normalizarNombreRuta(nombreCrudo);
  const clave = claveNormalizada(nombre);

  const { data: existente } = await supabase
    .from("rutas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("clave_normalizada", clave)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: creada, error } = await supabase
    .from("rutas")
    .insert({ empresa_id: empresaId, nombre })
    .select("id")
    .single();
  if (error?.code === CODIGO_UNIQUE_VIOLATION) {
    const { data: ganadora } = await supabase
      .from("rutas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("clave_normalizada", clave)
      .maybeSingle();
    if (ganadora) return ganadora.id;
    console.error(
      `obtenerOCrearRuta: 23505 sin fila encontrada por clave_normalizada para "${nombre}" (empresa ${empresaId})`
    );
    throw new ColisionCatalogoError("ruta");
  }
  if (error || !creada) {
    throw new Error(
      `No se pudo crear la ruta "${nombre}": ${error?.message ?? "sin fila devuelta"}`
    );
  }
  return creada.id;
}
