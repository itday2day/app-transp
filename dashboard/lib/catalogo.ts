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

// Código de Postgres para "unique_violation" -- dos pedidos concurrentes que intentan crear la
// misma empresa/ruta nueva (la misma fracción de segundo). El índice único sobre lower(nombre)
// es la garantía real; esto solo decide qué hacer cuando la garantía frena el segundo intento: en
// vez de devolver un error al administrador, se reutiliza la fila que ganó la carrera.
const CODIGO_UNIQUE_VIOLATION = "23505";

/** Reutiliza la empresa existente (sin distinguir mayúsculas/espacios, ver normalizarNombreEmpresa)
 * o la crea -- llamado al CONFIRMAR la jornada, nunca al tocar "Agregar" (⚠️3 de la spec: cancelar
 * el diálogo no pasa por aquí, solo el POST final de crear/editar). */
export async function obtenerOCrearEmpresa(
  supabase: SupabaseClient<Database>,
  nombreCrudo: string
): Promise<string> {
  const nombre = normalizarNombreEmpresa(nombreCrudo);

  const { data: existente } = await supabase
    .from("empresas")
    .select("id")
    .eq("nombre", nombre)
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
      .eq("nombre", nombre)
      .maybeSingle();
    if (ganadora) return ganadora.id;
  }
  if (error || !creada) {
    throw new Error(
      `No se pudo crear la empresa "${nombre}": ${error?.message ?? "sin fila devuelta"}`
    );
  }
  return creada.id;
}

/** Mismo criterio que obtenerOCrearEmpresa, pero la unicidad es por (empresa_id, lower(nombre)) --
 * una ruta "Centro" de la empresa A y otra "Centro" de la empresa B no son la misma fila. */
export async function obtenerOCrearRuta(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  nombreCrudo: string
): Promise<string> {
  const nombre = normalizarNombreRuta(nombreCrudo);

  const { data: existente } = await supabase
    .from("rutas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("nombre", nombre)
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
      .eq("nombre", nombre)
      .maybeSingle();
    if (ganadora) return ganadora.id;
  }
  if (error || !creada) {
    throw new Error(
      `No se pudo crear la ruta "${nombre}": ${error?.message ?? "sin fila devuelta"}`
    );
  }
  return creada.id;
}
