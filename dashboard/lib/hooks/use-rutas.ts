"use client";

import { useQuery } from "@tanstack/react-query";
import type { RutasResponse } from "@/lib/types";

async function obtenerRutas(): Promise<RutasResponse> {
  const respuesta = await fetch("/api/rutas");
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener las rutas.");
  }
  return respuesta.json() as Promise<RutasResponse>;
}

export function useRutas() {
  return useQuery({
    queryKey: ["rutas"],
    queryFn: obtenerRutas,
  });
}
