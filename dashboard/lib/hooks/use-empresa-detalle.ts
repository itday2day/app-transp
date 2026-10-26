"use client";

import { useQuery } from "@tanstack/react-query";
import type { EmpresaDetalleResponse } from "@/lib/types";

async function obtenerEmpresaDetalle(id: string): Promise<EmpresaDetalleResponse> {
  const respuesta = await fetch(`/api/empresas/detalle?id=${encodeURIComponent(id)}`);
  if (!respuesta.ok) {
    throw new Error("No se pudo obtener el detalle de la empresa.");
  }
  return respuesta.json() as Promise<EmpresaDetalleResponse>;
}

export function useEmpresaDetalle(id: string | null) {
  return useQuery({
    queryKey: ["empresa-detalle", id],
    queryFn: () => obtenerEmpresaDetalle(id as string),
    enabled: id !== null,
  });
}
