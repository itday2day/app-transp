"use client";

import { useQuery } from "@tanstack/react-query";
import type { InvitacionesResponse } from "@/lib/types";

async function obtenerInvitaciones(): Promise<InvitacionesResponse> {
  const respuesta = await fetch("/api/invitaciones");
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener las invitaciones.");
  }
  return respuesta.json() as Promise<InvitacionesResponse>;
}

export function useInvitaciones() {
  return useQuery({
    queryKey: ["invitaciones"],
    queryFn: obtenerInvitaciones,
  });
}
