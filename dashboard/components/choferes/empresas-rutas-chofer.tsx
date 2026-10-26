"use client";

import { Badge } from "@/components/ui/badge";
import { useEmpresas } from "@/lib/hooks/use-empresas";
import { useRutas } from "@/lib/hooks/use-rutas";
import type { VinculoEmpresaConNombre, VinculoRutaConNombre } from "@/lib/types";

/** Sección "Empresas y rutas" del diálogo del chofer (spec_catalogo_por_chofer.md, Etapa 2,
 * decisión D1). En modo Ver: solo lectura, empresas y debajo sus rutas, con "Vinculado por el
 * chofer" cuando origen='chofer' (el trigger de la base lo creó desde una jornada). En modo
 * Editar: casillas agrupadas -- empresas/rutas inactivas se muestran atenuadas y no se pueden
 * marcar de nuevo (decisión D3), pero si ya estaban vinculadas siguen apareciendo marcadas para
 * poder desmarcarlas. */
interface EmpresasRutasChoferProps {
  modo: "ver" | "editar";
  vinculosActuales: { empresas: VinculoEmpresaConNombre[]; rutas: VinculoRutaConNombre[] } | null;
  cargandoVinculos: boolean;
  empresasSeleccionadas: Set<string>;
  rutasSeleccionadas: Set<string>;
  onAlternarEmpresa: (empresaId: string, marcar: boolean) => void;
  onAlternarRuta: (rutaId: string, empresaId: string, marcar: boolean) => void;
  disabled?: boolean;
}

export function EmpresasRutasChofer({
  modo,
  vinculosActuales,
  cargandoVinculos,
  empresasSeleccionadas,
  rutasSeleccionadas,
  onAlternarEmpresa,
  onAlternarRuta,
  disabled,
}: EmpresasRutasChoferProps) {
  const { data: empresasResp } = useEmpresas();
  const { data: rutasResp } = useRutas();

  if (cargandoVinculos) {
    return <p className="text-sm text-muted-foreground">Cargando empresas y rutas…</p>;
  }

  if (modo === "ver") {
    const empresas = vinculosActuales?.empresas ?? [];
    const rutas = vinculosActuales?.rutas ?? [];
    if (empresas.length === 0) {
      return <p className="text-sm text-muted-foreground">Sin empresas vinculadas.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {empresas.map((empresa) => (
          <div key={empresa.empresaId} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={empresa.activo ? "font-medium" : "font-medium text-muted-foreground"}
              >
                {empresa.nombreEmpresa}
              </span>
              {!empresa.activo && <Badge variant="default">De baja</Badge>}
              {empresa.origen === "chofer" && (
                <Badge variant="warning">Vinculado por el chofer</Badge>
              )}
            </div>
            <ul className="flex flex-col gap-0.5 pl-4 text-sm text-muted-foreground">
              {rutas
                .filter((ruta) => ruta.empresaId === empresa.empresaId)
                .map((ruta) => (
                  <li key={ruta.rutaId} className="flex flex-wrap items-center gap-2">
                    <span>• {ruta.nombreRuta}</span>
                    {!ruta.activo && <Badge variant="default">De baja</Badge>}
                    {ruta.origen === "chofer" && (
                      <Badge variant="warning">Vinculado por el chofer</Badge>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const empresas = empresasResp?.data ?? [];
  const rutas = rutasResp?.data ?? [];

  // Una empresa aparece en la lista de edición si está activa, O si ya está vinculada (para poder
  // desmarcarla aunque esté de baja -- decisión D3: "los vínculos de una inactiva se siguen
  // mostrando, atenuados, para poder quitarlos").
  const empresasVisibles = empresas.filter(
    (empresa) => empresa.activo || empresasSeleccionadas.has(empresa.id)
  );

  return (
    <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-md border border-border p-3">
      {empresasVisibles.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay empresas en el catálogo todavía.</p>
      )}
      {empresasVisibles.map((empresa) => {
        const empresaMarcada = empresasSeleccionadas.has(empresa.id);
        const rutasDeEmpresa = rutas.filter(
          (ruta) =>
            ruta.empresa_id === empresa.id && (ruta.activo || rutasSeleccionadas.has(ruta.id))
        );
        return (
          <div key={empresa.id} className={!empresa.activo ? "opacity-60" : undefined}>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={empresaMarcada}
                disabled={disabled || !empresa.activo}
                onChange={(e) => onAlternarEmpresa(empresa.id, e.target.checked)}
              />
              <span className="font-medium">{empresa.nombre}</span>
              {!empresa.activo && <Badge variant="default">De baja</Badge>}
            </label>

            {empresaMarcada && rutasDeEmpresa.length > 0 && (
              <div className="flex flex-col pl-6">
                {rutasDeEmpresa.map((ruta) => (
                  <label key={ruta.id} className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={rutasSeleccionadas.has(ruta.id)}
                      disabled={disabled || !ruta.activo}
                      onChange={(e) => onAlternarRuta(ruta.id, empresa.id, e.target.checked)}
                    />
                    <span>{ruta.nombre}</span>
                    {!ruta.activo && <Badge variant="default">De baja</Badge>}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
