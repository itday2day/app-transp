"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CrearEmpresaDialog } from "@/components/empresas/crear-empresa-dialog";
import { EmpresaDetalleDialog } from "@/components/empresas/empresa-detalle-dialog";
import { TablaEmpresas } from "@/components/empresas/tabla-empresas";
import { useEmpresas } from "@/lib/hooks/use-empresas";

// spec_catalogo_por_chofer.md, Etapa 2, criterios 10-15: pantalla de empresas (menú "Más" en
// teléfono/tablet) -- lista con orden/insignia de pendiente (D4), detalle con sus rutas y los
// choferes asignados (diálogo aparte, EmpresaDetalleDialog).
export default function EmpresasPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useEmpresas();
  const [empresaSeleccionadaId, setEmpresaSeleccionadaId] = useState<string | null>(null);
  const [creandoAbierto, setCreandoAbierto] = useState(false);

  function invalidarEmpresas() {
    queryClient.invalidateQueries({ queryKey: ["empresas"] });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold md:text-[40px]">Empresas</h1>
        <Button onClick={() => setCreandoAbierto(true)}>
          <Plus className="h-4 w-4" />
          Nueva empresa
        </Button>
      </div>

      {isError && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudieron cargar las empresas. Intenta de nuevo.
        </p>
      )}

      <TablaEmpresas
        empresas={data?.data ?? []}
        cargando={isLoading}
        onSeleccionar={(empresa) => setEmpresaSeleccionadaId(empresa.id)}
      />

      {empresaSeleccionadaId && (
        <EmpresaDetalleDialog
          empresaId={empresaSeleccionadaId}
          onClose={() => setEmpresaSeleccionadaId(null)}
        />
      )}

      {creandoAbierto && (
        <CrearEmpresaDialog onClose={() => setCreandoAbierto(false)} onCreada={invalidarEmpresas} />
      )}
    </div>
  );
}
