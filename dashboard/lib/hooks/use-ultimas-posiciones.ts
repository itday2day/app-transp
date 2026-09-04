"use client";

import { useQuery } from "@tanstack/react-query";
import type { PosicionChofer } from "@/lib/types";

const INTERVALO_POLLING_MS = 8000;

async function obtenerUltimasPosiciones(): Promise<PosicionChofer[]> {
  const respuesta = await fetch("/api/tracking/ultimas-posiciones");
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener las últimas posiciones.");
  }
  return respuesta.json() as Promise<PosicionChofer[]>;
}

/**
 * Polling cada ~8s al Route Handler de posiciones (decisión deliberada, no
 * Supabase Realtime: ver notas de arquitectura). Los pings del chofer llegan
 * cada ~20s, así que 8s ya da sensación de "vivo" de sobra.
 */
export function useUltimasPosiciones() {
  return useQuery({
    queryKey: ["ultimas-posiciones"],
    queryFn: obtenerUltimasPosiciones,
    refetchInterval: INTERVALO_POLLING_MS,
  });
}
