"use client";

import { useQuery } from "@tanstack/react-query";
import type { EstadoChoferesResponse } from "@/lib/types";

async function obtenerEstadoChoferes(): Promise<EstadoChoferesResponse> {
  const respuesta = await fetch("/api/choferes/estado");
  if (!respuesta.ok) {
    throw new Error("No se pudo obtener el estado de los choferes.");
  }
  return respuesta.json() as Promise<EstadoChoferesResponse>;
}

// Separado de useChoferes() a propósito: email/email_confirmed_at viven en auth.users, no en la
// tabla `choferes` (ver listar_estado_choferes() en la base) -- dos queries, se combinan en el
// componente que necesita las dos (TablaChoferes), no se mezclan en un solo hook que oculte de
// dónde viene cada dato.
export function useEstadoChoferes() {
  return useQuery({
    queryKey: ["choferes-estado"],
    queryFn: obtenerEstadoChoferes,
  });
}
