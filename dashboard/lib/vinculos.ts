import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  DiferenciasVinculosChoferRequest,
  VinculoEmpresaConNombre,
  VinculoRutaConNombre,
  VinculosChoferResponse,
} from "@/lib/types";

/** spec_catalogo_por_chofer.md (Etapa 2, decisión D2): el admin pidió algo que la base no permite
 * -- una ruta/empresa que no existe, o que está inactiva (criterio D3: no se puede asignar MÁS a
 * una empresa/ruta de baja). El Route Handler la atrapa y responde 400, nunca un 500 crudo. */
export class VinculoInvalidoError extends Error {}

/** Pura, sin Supabase -- quita duplicados y resuelve el caso (raro, pero posible si el cliente
 * tiene un bug) de pedir agregar Y quitar el mismo id en la misma llamada: gana "agregar", que es
 * el estado más reciente que el admin tocó en la UI. Separada para poder probarla con datos
 * ficticios (specs Node), sin pegarle a la base real. */
export function normalizarDiferencias(req: DiferenciasVinculosChoferRequest): {
  empresasAgregar: string[];
  empresasQuitar: string[];
  rutasAgregar: string[];
  rutasQuitar: string[];
} {
  const empresasAgregar = Array.from(new Set(req.empresasAgregar ?? []));
  const empresasQuitar = Array.from(new Set(req.empresasQuitar ?? [])).filter(
    (id) => !empresasAgregar.includes(id)
  );
  const rutasAgregar = Array.from(new Set(req.rutasAgregar ?? []));
  const rutasQuitar = Array.from(new Set(req.rutasQuitar ?? [])).filter(
    (id) => !rutasAgregar.includes(id)
  );
  return { empresasAgregar, empresasQuitar, rutasAgregar, rutasQuitar };
}

/** Pura, sin Supabase -- de las empresas que hacen falta vincular IMPLÍCITAMENTE (porque una
 * ruta a agregar pertenece a ellas), separa cuáles son vínculos nuevos de verdad de cuáles el
 * chofer ya tenía antes. Decisión del usuario (corrección C1, consistente con D3): si el vínculo
 * ya existía, NO se valida nada -- desactivar una empresa nunca afecta vínculos ya creados, así
 * que un vínculo preexistente hacia una empresa que hoy está de baja sigue siendo válido. Solo un
 * vínculo implícito NUEVO (ni preexistente, ni ya pedido explícitamente en empresasAgregar) exige
 * que la empresa esté activa. */
export function empresasImplicitasAValidar(
  empresasDeLasRutas: string[],
  yaVinculadas: Set<string>,
  empresasYaEnAgregar: string[]
): string[] {
  return empresasDeLasRutas.filter(
    (id) => !yaVinculadas.has(id) && !empresasYaEnAgregar.includes(id)
  );
}

/** Aplica EXACTAMENTE las diferencias pedidas -- nunca "el conjunto completo" (D2): un vínculo
 * origen='chofer' que el trigger haya creado entre que el admin abrió el diálogo y guardó no se
 * toca si no está en *Quitar. Inserta con ON CONFLICT DO NOTHING (nunca pisa el `origen` de un
 * vínculo que ya existe); agregar una ruta inserta antes (si falta) el vínculo de su empresa;
 * quitar una empresa borra su chofer_empresas (la cascada de la base ya quita sus chofer_rutas);
 * quitar una ruta borra solo esa fila. Todo lo que este helper inserta queda con origen='admin'. */
export async function aplicarDiferenciasVinculosChofer(
  supabase: SupabaseClient<Database>,
  choferId: string,
  diferencias: DiferenciasVinculosChoferRequest
): Promise<void> {
  const { empresasAgregar, empresasQuitar, rutasAgregar, rutasQuitar } =
    normalizarDiferencias(diferencias);

  let rutasInfo: { id: string; empresa_id: string; activo: boolean }[] = [];
  if (rutasAgregar.length > 0) {
    const { data, error } = await supabase
      .from("rutas")
      .select("id, empresa_id, activo")
      .in("id", rutasAgregar);
    if (error) throw new Error(`No se pudieron leer las rutas a agregar: ${error.message}`);
    rutasInfo = data ?? [];
    const encontradas = new Set(rutasInfo.map((r) => r.id));
    for (const id of rutasAgregar) {
      if (!encontradas.has(id)) throw new VinculoInvalidoError(`La ruta ${id} no existe.`);
    }
    const inactiva = rutasInfo.find((r) => !r.activo);
    if (inactiva) {
      throw new VinculoInvalidoError(
        `La ruta ${inactiva.id} está de baja y no se puede asignar a más choferes.`
      );
    }
  }

  if (empresasAgregar.length > 0) {
    const { data, error } = await supabase
      .from("empresas")
      .select("id, activo")
      .in("id", empresasAgregar);
    if (error) throw new Error(`No se pudieron leer las empresas a agregar: ${error.message}`);
    const encontradas = new Map((data ?? []).map((e) => [e.id, e.activo]));
    for (const id of empresasAgregar) {
      if (!encontradas.has(id)) throw new VinculoInvalidoError(`La empresa ${id} no existe.`);
      if (!encontradas.get(id)) {
        throw new VinculoInvalidoError(
          `La empresa ${id} está de baja y no se puede asignar a más choferes.`
        );
      }
    }
  }

  // Empresa antes que su ruta (invariante de la FK compuesta): si una ruta a agregar pertenece a
  // una empresa que el chofer todavía no tiene vinculada (y que tampoco está ya en
  // empresasAgregar), ese vínculo de empresa se agrega acá, implícito -- y si es un vínculo
  // nuevo de verdad (no preexistente), tiene que estar activa (corrección C1).
  const empresasAInsertar = new Set(empresasAgregar);
  if (rutasInfo.length > 0) {
    const empresasDeLasRutas = Array.from(new Set(rutasInfo.map((r) => r.empresa_id)));
    const [
      { data: yaVinculadas, error: errorVinculadas },
      { data: empresasInfo, error: errorEmpresasInfo },
    ] = await Promise.all([
      supabase
        .from("chofer_empresas")
        .select("empresa_id")
        .eq("chofer_id", choferId)
        .in("empresa_id", empresasDeLasRutas),
      supabase.from("empresas").select("id, nombre, activo").in("id", empresasDeLasRutas),
    ]);
    if (errorVinculadas) {
      throw new Error(
        `No se pudo leer los vínculos de empresa existentes: ${errorVinculadas.message}`
      );
    }
    if (errorEmpresasInfo) {
      throw new Error(
        `No se pudieron leer las empresas de las rutas a agregar: ${errorEmpresasInfo.message}`
      );
    }
    const vinculadasSet = new Set((yaVinculadas ?? []).map((v) => v.empresa_id));
    const empresasInfoPorId = new Map((empresasInfo ?? []).map((e) => [e.id, e]));

    for (const empresaId of empresasImplicitasAValidar(
      empresasDeLasRutas,
      vinculadasSet,
      empresasAgregar
    )) {
      const info = empresasInfoPorId.get(empresaId);
      if (!info) throw new VinculoInvalidoError(`La empresa ${empresaId} no existe.`);
      if (!info.activo) {
        throw new VinculoInvalidoError(
          `La empresa ${info.nombre} está de baja y no se puede asignar a más choferes.`
        );
      }
    }

    for (const empresaId of empresasDeLasRutas) {
      if (!vinculadasSet.has(empresaId)) empresasAInsertar.add(empresaId);
    }
  }

  if (empresasAInsertar.size > 0) {
    const { error } = await supabase.from("chofer_empresas").upsert(
      Array.from(empresasAInsertar).map((empresa_id) => ({
        chofer_id: choferId,
        empresa_id,
        origen: "admin" as const,
      })),
      { onConflict: "chofer_id,empresa_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(`No se pudieron agregar los vínculos de empresa: ${error.message}`);
  }

  if (rutasInfo.length > 0) {
    const { error } = await supabase.from("chofer_rutas").upsert(
      rutasInfo.map((r) => ({
        chofer_id: choferId,
        ruta_id: r.id,
        empresa_id: r.empresa_id,
        origen: "admin" as const,
      })),
      { onConflict: "chofer_id,ruta_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(`No se pudieron agregar los vínculos de ruta: ${error.message}`);
  }

  if (rutasQuitar.length > 0) {
    const { error } = await supabase
      .from("chofer_rutas")
      .delete()
      .eq("chofer_id", choferId)
      .in("ruta_id", rutasQuitar);
    if (error) throw new Error(`No se pudieron quitar los vínculos de ruta: ${error.message}`);
  }

  if (empresasQuitar.length > 0) {
    const { error } = await supabase
      .from("chofer_empresas")
      .delete()
      .eq("chofer_id", choferId)
      .in("empresa_id", empresasQuitar);
    if (error) throw new Error(`No se pudieron quitar los vínculos de empresa: ${error.message}`);
  }
}

/** Snapshot actual de vínculos de un chofer, con los nombres ya resueltos -- lo que necesita el
 * diálogo del chofer (modo Ver/Editar) sin una segunda consulta. */
export async function obtenerVinculosChofer(
  supabase: SupabaseClient<Database>,
  choferId: string
): Promise<VinculosChoferResponse> {
  const [{ data: empresasData, error: errorEmpresas }, { data: rutasData, error: errorRutas }] =
    await Promise.all([
      supabase
        .from("chofer_empresas")
        .select("empresa_id, origen, empresas(nombre, activo)")
        .eq("chofer_id", choferId),
      supabase
        .from("chofer_rutas")
        .select("ruta_id, empresa_id, origen, rutas(nombre, activo)")
        .eq("chofer_id", choferId),
    ]);

  if (errorEmpresas) {
    throw new Error(`No se pudieron leer las empresas vinculadas: ${errorEmpresas.message}`);
  }
  if (errorRutas) {
    throw new Error(`No se pudieron leer las rutas vinculadas: ${errorRutas.message}`);
  }

  const empresas: VinculoEmpresaConNombre[] = (empresasData ?? [])
    .filter(
      (fila): fila is typeof fila & { empresas: { nombre: string; activo: boolean } } =>
        fila.empresas != null
    )
    .map((fila) => ({
      empresaId: fila.empresa_id,
      nombreEmpresa: fila.empresas.nombre,
      activo: fila.empresas.activo,
      // El generador de tipos de Supabase da `origen: string` (no el enum literal) para una
      // columna `text check (... in (...))` -- el CHECK de la base es la garantía real.
      origen: fila.origen as VinculoEmpresaConNombre["origen"],
    }));

  const rutas: VinculoRutaConNombre[] = (rutasData ?? [])
    .filter(
      (fila): fila is typeof fila & { rutas: { nombre: string; activo: boolean } } =>
        fila.rutas != null
    )
    .map((fila) => ({
      rutaId: fila.ruta_id,
      empresaId: fila.empresa_id,
      nombreRuta: fila.rutas.nombre,
      activo: fila.rutas.activo,
      origen: fila.origen as VinculoRutaConNombre["origen"],
    }));

  return { empresas, rutas };
}
