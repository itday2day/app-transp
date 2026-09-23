"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChoferesResponse } from "@/lib/types";

async function obtenerChoferes(): Promise<ChoferesResponse> {
  const respuesta = await fetch("/api/choferes");
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener los choferes.");
  }
  return respuesta.json() as Promise<ChoferesResponse>;
}

export function useChoferes() {
  return useQuery({
    queryKey: ["choferes"],
    queryFn: obtenerChoferes,
  });
}
