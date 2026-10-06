"use client";

import { useQuery } from "@tanstack/react-query";
import type { EmpresasResponse } from "@/lib/types";

async function obtenerEmpresas(): Promise<EmpresasResponse> {
  const respuesta = await fetch("/api/empresas");
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener las empresas.");
  }
  return respuesta.json() as Promise<EmpresasResponse>;
}

export function useEmpresas() {
  return useQuery({
    queryKey: ["empresas"],
    queryFn: obtenerEmpresas,
  });
}
