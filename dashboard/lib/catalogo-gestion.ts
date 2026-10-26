import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { claveNormalizada, normalizarNombreEmpresa, normalizarNombreRuta } from "@/lib/catalogo";
import type {
  PrevisualizarFusionarEmpresasResponse,
  PrevisualizarFusionarRutasResponse,
  PrevisualizarRenombrarResponse,
} from "@/lib/types";

/** spec_catalogo_por_chofer.md (Etapa 2, decisión D5): nota fija que acompaña SIEMPRE el número
 * previsto, antes de confirmar un renombrar/fusionar. */
export const NOTA_TEXTO_EXACTO =
  "Solo se actualizan las jornadas cuyo texto coincide exactamente (mayúsculas, acentos y espacios incluidos); las que estén escritas de otra forma no se modifican.";

/** El admin intentó un nombre cuya clave normalizada ya existe -- el Route Handler responde 409
 * con este mensaje en vez de dejar que el renombrar_empresa()/renombrar_ruta() real de la base
 * explote con un 23505 sin contexto. */
export class ColisionRenombrarError extends Error {
  constructor(tipo: "empresa" | "ruta") {
    super(
      tipo === "empresa"
        ? "Ya existe una empresa con ese nombre; usa Fusionar en vez de renombrar."
        : "Ya existe una ruta con ese nombre en la misma empresa; usa Fusionar en vez de renombrar."
    );
    this.name = "ColisionRenombrarError";
  }
}

export async function verificarColisionRenombrarEmpresa(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  nombreNuevo: string
): Promise<void> {
  const clave = claveNormalizada(normalizarNombreEmpresa(nombreNuevo));
  const { data, error } = await supabase
    .from("empresas")
    .select("id")
    .eq("clave_normalizada", clave)
    .neq("id", empresaId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo comprobar colisiones de nombre: ${error.message}`);
  if (data) throw new ColisionRenombrarError("empresa");
}

export async function verificarColisionRenombrarRuta(
  supabase: SupabaseClient<Database>,
  rutaId: string,
  empresaId: string,
  nombreNuevo: string
): Promise<void> {
  const clave = claveNormalizada(normalizarNombreRuta(nombreNuevo));
  const { data, error } = await supabase
    .from("rutas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("clave_normalizada", clave)
    .neq("id", rutaId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo comprobar colisiones de nombre: ${error.message}`);
  if (data) throw new ColisionRenombrarError("ruta");
}

/** Corrección C3: el Route Handler usa `status` para decidir qué código HTTP devolver (400 o
 * 404) -- un 23505/P0001 crudo de la función RPC no distingue estos dos casos con el detalle que
 * necesita el admin. */
export class FusionInvalidaError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404
  ) {
    super(message);
    this.name = "FusionInvalidaError";
  }
}

/** Validaciones comunes a previsualizar Y ejecutar una fusión de empresas (corrección C3): origen
 * y destino no pueden ser la misma fila; el destino tiene que existir y estar ACTIVO -- el origen
 * SÍ puede estar de baja (fusionar una empresa ya desactivada hacia otra sigue siendo una
 * operación válida, es la de destino la que tiene que seguir "viva"). */
export async function validarFusionEmpresas(
  supabase: SupabaseClient<Database>,
  origenId: string,
  destinoId: string
): Promise<void> {
  if (origenId === destinoId) {
    throw new FusionInvalidaError("Origen y destino no pueden ser la misma empresa.", 400);
  }
  const { data: destino, error } = await supabase
    .from("empresas")
    .select("activo")
    .eq("id", destinoId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la empresa de destino: ${error.message}`);
  if (!destino) throw new FusionInvalidaError("La empresa de destino no existe.", 404);
  if (!destino.activo) {
    throw new FusionInvalidaError("No se puede fusionar hacia una empresa de baja.", 400);
  }
}

/** Mismo criterio que validarFusionEmpresas, para rutas. */
export async function validarFusionRutas(
  supabase: SupabaseClient<Database>,
  origenId: string,
  destinoId: string
): Promise<void> {
  if (origenId === destinoId) {
    throw new FusionInvalidaError("Origen y destino no pueden ser la misma ruta.", 400);
  }
  const { data: destino, error } = await supabase
    .from("rutas")
    .select("activo")
    .eq("id", destinoId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la ruta de destino: ${error.message}`);
  if (!destino) throw new FusionInvalidaError("La ruta de destino no existe.", 404);
  if (!destino.activo) {
    throw new FusionInvalidaError("No se puede fusionar hacia una ruta de baja.", 400);
  }
}

/** Vista previa de renombrar_empresa(): mismo criterio de TEXTO EXACTO que la función SQL real
 * (jornadas.empresa = nombre viejo, ver schema_v26_catalogo_por_chofer.sql) -- en la Fase 3 se
 * comprueba que este número == el que devuelve la función de verdad. */
export async function previsualizarRenombrarEmpresa(
  supabase: SupabaseClient<Database>,
  empresaId: string,
  nombreNuevo: string
): Promise<PrevisualizarRenombrarResponse> {
  await verificarColisionRenombrarEmpresa(supabase, empresaId, nombreNuevo);

  const { data: empresa, error: errorEmpresa } = await supabase
    .from("empresas")
    .select("nombre")
    .eq("id", empresaId)
    .maybeSingle();
  if (errorEmpresa) throw new Error(`No se pudo leer la empresa: ${errorEmpresa.message}`);
  if (!empresa) throw new Error("La empresa no existe.");

  const { count, error } = await supabase
    .from("jornadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa", empresa.nombre);
  if (error) throw new Error(`No se pudo contar las jornadas afectadas: ${error.message}`);

  return { jornadasAfectadas: count ?? 0, nota: NOTA_TEXTO_EXACTO };
}

export async function previsualizarRenombrarRuta(
  supabase: SupabaseClient<Database>,
  rutaId: string,
  nombreNuevo: string
): Promise<PrevisualizarRenombrarResponse> {
  const { data: ruta, error: errorRuta } = await supabase
    .from("rutas")
    .select("nombre, empresa_id, empresas(nombre)")
    .eq("id", rutaId)
    .maybeSingle();
  if (errorRuta) throw new Error(`No se pudo leer la ruta: ${errorRuta.message}`);
  if (!ruta || !ruta.empresas) throw new Error("La ruta no existe.");

  await verificarColisionRenombrarRuta(supabase, rutaId, ruta.empresa_id, nombreNuevo);

  const { count, error } = await supabase
    .from("jornadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa", ruta.empresas.nombre)
    .eq("ruta", ruta.nombre);
  if (error) throw new Error(`No se pudo contar las jornadas afectadas: ${error.message}`);

  return { jornadasAfectadas: count ?? 0, nota: NOTA_TEXTO_EXACTO };
}

/** Vista previa de fusionar_rutas(): mismo criterio de texto exacto, más el conteo de choferes
 * vinculados a la ruta de origen (se mueven a la de destino al fusionar). */
export async function previsualizarFusionarRutas(
  supabase: SupabaseClient<Database>,
  origenId: string,
  destinoId: string
): Promise<PrevisualizarFusionarRutasResponse> {
  const { data: origen, error: errorOrigen } = await supabase
    .from("rutas")
    .select("nombre, empresa_id, empresas(nombre)")
    .eq("id", origenId)
    .maybeSingle();
  if (errorOrigen) throw new Error(`No se pudo leer la ruta de origen: ${errorOrigen.message}`);
  if (!origen || !origen.empresas) throw new Error("La ruta de origen no existe.");

  await validarFusionRutas(supabase, origenId, destinoId);

  const { data: destino, error: errorDestino } = await supabase
    .from("rutas")
    .select("empresa_id")
    .eq("id", destinoId)
    .maybeSingle();
  if (errorDestino) throw new Error(`No se pudo leer la ruta de destino: ${errorDestino.message}`);
  if (!destino) throw new Error("La ruta de destino no existe.");
  if (destino.empresa_id !== origen.empresa_id) {
    throw new Error("Las dos rutas deben pertenecer a la misma empresa.");
  }

  const [
    { count: choferesVinculados, error: errorChoferes },
    { count: jornadasAfectadas, error: errorJornadas },
  ] = await Promise.all([
    supabase
      .from("chofer_rutas")
      .select("chofer_id", { count: "exact", head: true })
      .eq("ruta_id", origenId),
    supabase
      .from("jornadas")
      .select("id", { count: "exact", head: true })
      .eq("empresa", origen.empresas.nombre)
      .eq("ruta", origen.nombre),
  ]);
  if (errorChoferes)
    throw new Error(`No se pudo contar los choferes vinculados: ${errorChoferes.message}`);
  if (errorJornadas)
    throw new Error(`No se pudo contar las jornadas afectadas: ${errorJornadas.message}`);

  return {
    choferesVinculados: choferesVinculados ?? 0,
    jornadasAfectadas: jornadasAfectadas ?? 0,
    nota: NOTA_TEXTO_EXACTO,
  };
}

/** Vista previa de fusionar_empresas(): clasifica cada ruta de origen en "se combina" (ya existe
 * una ruta con la misma clave_normalizada en destino) o "se mueve" (conserva su id), igual que el
 * bucle real de fusionar_empresas() en schema_v26_catalogo_por_chofer.sql. */
export async function previsualizarFusionarEmpresas(
  supabase: SupabaseClient<Database>,
  origenId: string,
  destinoId: string
): Promise<PrevisualizarFusionarEmpresasResponse> {
  const { data: origen, error: errorOrigen } = await supabase
    .from("empresas")
    .select("nombre")
    .eq("id", origenId)
    .maybeSingle();
  if (errorOrigen) throw new Error(`No se pudo leer la empresa de origen: ${errorOrigen.message}`);
  if (!origen) throw new Error("La empresa de origen no existe.");

  await validarFusionEmpresas(supabase, origenId, destinoId);

  const [
    { data: rutasOrigen, error: errorRutasOrigen },
    { data: rutasDestino, error: errorRutasDestino },
  ] = await Promise.all([
    supabase.from("rutas").select("clave_normalizada").eq("empresa_id", origenId),
    supabase.from("rutas").select("clave_normalizada").eq("empresa_id", destinoId),
  ]);
  if (errorRutasOrigen)
    throw new Error(`No se pudieron leer las rutas de origen: ${errorRutasOrigen.message}`);
  if (errorRutasDestino)
    throw new Error(`No se pudieron leer las rutas de destino: ${errorRutasDestino.message}`);

  const clavesDestino = new Set((rutasDestino ?? []).map((r) => r.clave_normalizada));
  let rutasCombinadas = 0;
  let rutasMovidas = 0;
  for (const ruta of rutasOrigen ?? []) {
    if (ruta.clave_normalizada !== null && clavesDestino.has(ruta.clave_normalizada)) {
      rutasCombinadas++;
    } else {
      rutasMovidas++;
    }
  }

  const [
    { count: choferesVinculados, error: errorChoferes },
    { count: jornadasAfectadas, error: errorJornadas },
  ] = await Promise.all([
    supabase
      .from("chofer_empresas")
      .select("chofer_id", { count: "exact", head: true })
      .eq("empresa_id", origenId),
    supabase
      .from("jornadas")
      .select("id", { count: "exact", head: true })
      .eq("empresa", origen.nombre),
  ]);
  if (errorChoferes)
    throw new Error(`No se pudo contar los choferes vinculados: ${errorChoferes.message}`);
  if (errorJornadas)
    throw new Error(`No se pudo contar las jornadas afectadas: ${errorJornadas.message}`);

  return {
    rutasCombinadas,
    rutasMovidas,
    choferesVinculados: choferesVinculados ?? 0,
    jornadasAfectadas: jornadasAfectadas ?? 0,
    nota: NOTA_TEXTO_EXACTO,
  };
}
