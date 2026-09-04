"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatFechaHora } from "@/lib/utils";
import type { JornadaRow } from "@/lib/types";

interface TablaJornadasProps {
  jornadas: JornadaRow[];
  cargando: boolean;
  onSeleccionar: (jornada: JornadaRow) => void;
}

const COLUMNAS = [
  "Chofer",
  "Empresa",
  "Matrícula",
  "Ruta",
  "Check-in",
  "Check-out",
  "Estado",
  "Incidencia",
];

export function TablaJornadas({ jornadas, cargando, onSeleccionar }: TablaJornadasProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            {COLUMNAS.map((columna) => (
              <th key={columna} className="px-3 py-2 font-medium">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jornadas.map((jornada) => (
            <tr
              key={jornada.id}
              onClick={() => onSeleccionar(jornada)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted",
                cargando && "opacity-60"
              )}
            >
              <td className="px-3 py-2 font-medium">{jornada.chofer_nombre}</td>
              <td className="px-3 py-2">{jornada.empresa}</td>
              <td className="px-3 py-2">{jornada.matricula}</td>
              <td className="px-3 py-2">{jornada.ruta}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatFechaHora(jornada.fecha_check_in)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatFechaHora(jornada.fecha_check_out)}
              </td>
              <td className="px-3 py-2">
                <Badge variant={jornada.estado === "abierta" ? "primary" : "default"}>
                  {jornada.estado === "abierta" ? "Abierta" : "Cerrada"}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {jornada.tuvo_incidencia ? (
                  <Badge variant="danger">
                    <AlertTriangle className="h-3 w-3" />
                    {jornada.tipo_incidencia ?? "Sí"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}

          {!cargando && jornadas.length === 0 && (
            <tr>
              <td
                colSpan={COLUMNAS.length}
                className="px-3 py-10 text-center text-muted-foreground"
              >
                No hay jornadas que coincidan con los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
