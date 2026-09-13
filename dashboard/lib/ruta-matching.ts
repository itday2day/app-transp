// Cliente del lado del navegador para el ajuste de rutas a calles reales.
//
// ⚠️ **Reemplaza a `lib/osrm.ts`** (eliminado): antes este archivo armaba y
// mandaba la llamada a OSRM directo desde el navegador
// (`router.project-osrm.org/match`). Ahora el ajuste corre en
// `/api/tracking/ruta-jornada-match` (Geoapify Map Matching, ver ese Route
// Handler para el detalle completo de la migración) — este archivo quedó
// reducido a un simple `fetch` a ese endpoint propio, sin ninguna lógica de
// tramos/muestreo/parseo de proveedor, que ahora vive del lado del servidor.

export interface ResultadoTrazado {
  trazado: [number, number][];
  /** false si el ajuste a calles no pudo completarse (ver el Route Handler para el detalle). */
  matcheoCompleto: boolean;
}

/**
 * Pide el trazado de una jornada ya ajustado a las calles reales. Tira un
 * error si el Route Handler no responde — es responsabilidad de quien llama
 * decidir el fallback a línea recta (ver useRutaJornada). El propio Route
 * Handler ya resuelve su propio fallback interno (Geoapify caído, sin API
 * key, etc.) devolviendo igual `200` con `matcheoCompleto: false`, así que
 * este `throw` solo cubre una falla de red o del servidor del Dashboard en
 * sí, no una falla de Geoapify.
 */
export async function obtenerTrazadoAjustado(jornadaId: string): Promise<ResultadoTrazado> {
  const respuesta = await fetch(
    `/api/tracking/ruta-jornada-match?jornadaId=${encodeURIComponent(jornadaId)}`
  );
  if (!respuesta.ok) {
    throw new Error(`No se pudo ajustar la ruta a las calles (status ${respuesta.status}).`);
  }
  return (await respuesta.json()) as ResultadoTrazado;
}
