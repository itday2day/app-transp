"use client";

import { useQuery } from "@tanstack/react-query";
import type { VinculosChoferResponse } from "@/lib/types";

async function obtenerVinculosChofer(choferId: string): Promise<VinculosChoferResponse> {
  const respuesta = await fetch(`/api/choferes/vinculos?choferId=${encodeURIComponent(choferId)}`);
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener los vínculos del chofer.");
  }
  return respuesta.json() as Promise<VinculosChoferResponse>;
}

/** Empresas/rutas vinculadas a un chofer (spec_catalogo_por_chofer.md, Etapa 2) -- lo que carga la
 * sección "Empresas y rutas" del diálogo del chofer, en modo Ver y como snapshot inicial de
 * Editar. */
export function useVinculosChofer(choferId: string | null) {
  return useQuery({
    queryKey: ["vinculos-chofer", choferId],
    queryFn: () => obtenerVinculosChofer(choferId as string),
    enabled: choferId !== null,
  });
}
