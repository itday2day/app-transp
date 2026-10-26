import type {
  ActivarRequest,
  CrearEmpresaRequest,
  CrearRutaRequest,
  DiferenciasVinculosChoferRequest,
  FusionarRequest,
  RenombrarRequest,
  RevisarRequest,
  VinculosChoferRequest,
} from "@/lib/types";

/** Constructores puros de los cuerpos de petición de los endpoints nuevos de la Etapa 2
 * (spec_catalogo_por_chofer.md) -- en un solo lugar para que el cliente nunca construya un
 * literal suelto a mano (bug real del 2026-10-26: RenombrarInline mandaba `{ nombreNuevo }` sin
 * `id`, y nadie lo notó hasta producción porque el objeto nunca pasó por un tipo). Cada función
 * devuelve exactamente el tipo que el Route Handler correspondiente valida con
 * `CuerpoSinValidar<T>` (lib/types.ts) -- probadas en scripts/pruebas-peticiones-catalogo.ts
 * comparando las claves de lo que devuelven contra las claves de ese mismo tipo. */

export function construirCuerpoRenombrar(id: string, nombreNuevo: string): RenombrarRequest {
  return { id, nombreNuevo };
}

export function construirCuerpoFusionar(origenId: string, destinoId: string): FusionarRequest {
  return { origenId, destinoId };
}

export function construirCuerpoActivar(id: string, activo: boolean): ActivarRequest {
  return { id, activo };
}

export function construirCuerpoRevisar(id: string): RevisarRequest {
  return { id };
}

export function construirCuerpoCrearEmpresa(nombre: string): CrearEmpresaRequest {
  return { nombre };
}

export function construirCuerpoCrearRuta(empresaId: string, nombre: string): CrearRutaRequest {
  return { empresaId, nombre };
}

export function construirCuerpoVinculosChofer(
  choferId: string,
  diferencias: DiferenciasVinculosChoferRequest
): VinculosChoferRequest {
  return { choferId, ...diferencias };
}
