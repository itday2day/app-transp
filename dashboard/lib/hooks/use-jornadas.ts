"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { EstadoJornada, JornadasResponse } from "@/lib/types";

export interface FiltrosJornadas {
  empresa: string;
  chofer: string;
  estado: EstadoJornada | "";
  desde: string;
  hasta: string;
  page: number;
  pageSize: number;
}

export const FILTROS_INICIALES: FiltrosJornadas = {
  empresa: "",
  chofer: "",
  estado: "",
  desde: "",
  hasta: "",
  page: 1,
  pageSize: 20,
};

function construirQueryString(filtros: FiltrosJornadas): string {
  const params = new URLSearchParams();
  if (filtros.empresa) params.set("empresa", filtros.empresa);
  if (filtros.chofer) params.set("chofer", filtros.chofer);
  if (filtros.estado) params.set("estado", filtros.estado);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  params.set("page", String(filtros.page));
  params.set("pageSize", String(filtros.pageSize));
  return params.toString();
}

async function obtenerJornadas(filtros: FiltrosJornadas): Promise<JornadasResponse> {
  const respuesta = await fetch(`/api/jornadas?${construirQueryString(filtros)}`);
  if (!respuesta.ok) {
    throw new Error("No se pudieron obtener las jornadas.");
  }
  return respuesta.json() as Promise<JornadasResponse>;
}

export function useJornadas(filtros: FiltrosJornadas) {
  return useQuery({
    queryKey: ["jornadas", filtros],
    queryFn: () => obtenerJornadas(filtros),
    placeholderData: keepPreviousData,
  });
}
