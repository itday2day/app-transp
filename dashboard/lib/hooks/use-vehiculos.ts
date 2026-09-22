"use client";

import { useQuery } from "@tanstack/react-query";
import type { VehiculosResponse } from "@/lib/types";

async function obtenerVehiculos(): Promise<VehiculosResponse> {
  const respuesta = await fetch("/api/vehiculos");
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener los vehículos.");
  }
  return respuesta.json() as Promise<VehiculosResponse>;
}

export function useVehiculos() {
  return useQuery({
    queryKey: ["vehiculos"],
    queryFn: obtenerVehiculos,
  });
}
