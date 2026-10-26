"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmpresaConPendiente } from "@/lib/types";

interface TablaEmpresasProps {
  empresas: EmpresaConPendiente[];
  cargando: boolean;
  onSeleccionar: (empresa: EmpresaConPendiente) => void;
}

const COLUMNAS = ["Empresa", "Estado", ""];

/** Lista de empresas (spec_catalogo_por_chofer.md, Etapa 2, decisión D4): pendientes primero,
 * después alfabético -- el orden y el cálculo de "pendiente" ya vienen resueltos de GET
 * /api/empresas (nunca se recalculan ni se reordenan en el cliente). */
export function TablaEmpresas({ empresas, cargando, onSeleccionar }: TablaEmpresasProps) {
  if (cargando) {
    return <p className="text-sm text-muted-foreground">Cargando empresas…</p>;
  }
  if (empresas.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay empresas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {COLUMNAS.map((columna) => (
              <th key={columna} className="px-3 py-2 font-medium">
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {empresas.map((empresa) => (
            <tr
              key={empresa.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => onSeleccionar(empresa)}
            >
              <td className={cn("px-3 py-3", !empresa.activo && "text-muted-foreground")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{empresa.nombre}</span>
                  {empresa.tienePendiente && <Badge variant="warning">Pendiente de revisión</Badge>}
                </div>
              </td>
              <td className="px-3 py-3">
                <Badge variant={empresa.activo ? "primary" : "default"}>
                  {empresa.activo ? "Activa" : "De baja"}
                </Badge>
              </td>
              <td className="px-3 py-3 text-right text-muted-foreground">Ver detalle →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
