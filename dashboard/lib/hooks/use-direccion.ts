"use client";

import { useQuery } from "@tanstack/react-query";
import type { GeocodificarResponse } from "@/lib/types";

async function obtenerDireccion(lat: number, lng: number): Promise<string | null> {
  const respuesta = await fetch(`/api/geocodificar?lat=${lat}&lng=${lng}`);
  if (!respuesta.ok) return null;
  const cuerpo = (await respuesta.json()) as GeocodificarResponse;
  return cuerpo.direccion;
}

/**
 * Geocodificación inversa de un punto vía /api/geocodificar (Nominatim del
 * lado del servidor, ver ese Route Handler). `staleTime` alto porque una
 * dirección no cambia — evita re-pedirla si el admin cierra y reabre el
 * mismo detalle de jornada dentro de la sesión.
 */
export function useDireccion(lat: number | null | undefined, lng: number | null | undefined) {
  return useQuery({
    queryKey: ["direccion", lat, lng],
    queryFn: () => obtenerDireccion(lat as number, lng as number),
    enabled: lat != null && lng != null,
    staleTime: 60 * 60 * 1000,
  });
}
