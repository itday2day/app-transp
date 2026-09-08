"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExportarReporteDialog } from "@/components/jornadas/exportar-reporte-dialog";
import { FiltrosJornadasForm } from "@/components/jornadas/filtros-jornadas";
import { JornadaDetalleDialog } from "@/components/jornadas/jornada-detalle-dialog";
import { Paginacion } from "@/components/jornadas/paginacion";
import { TablaJornadas } from "@/components/jornadas/tabla-jornadas";
import { FILTROS_INICIALES, useJornadas } from "@/lib/hooks/use-jornadas";
import type { JornadaRow } from "@/lib/types";

export default function JornadasPage() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState<JornadaRow | null>(null);
  const [exportarAbierto, setExportarAbierto] = useState(false);
  // Se incrementa cada vez que se abre el diálogo y se usa como `key` de
  // ExportarReporteDialog para forzar un remount — así sus campos siempre
  // arrancan sincronizados con los filtros vigentes en ese momento (ver
  // comentario en exportar-reporte-dialog.tsx).
  const [exportarContador, setExportarContador] = useState(0);

  const { data, isLoading, isFetching, isError } = useJornadas(filtros);

  function abrirExportar() {
    setExportarContador((c) => c + 1);
    setExportarAbierto(true);
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Jornadas</h1>
        <Button onClick={abrirExportar}>
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      <FiltrosJornadasForm filtros={filtros} onChange={setFiltros} />

      {isError && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudieron cargar las jornadas. Intenta de nuevo.
        </p>
      )}

      <TablaJornadas
        jornadas={data?.data ?? []}
        cargando={isLoading || isFetching}
        onSeleccionar={setJornadaSeleccionada}
      />

      <Paginacion
        page={filtros.page}
        pageSize={filtros.pageSize}
        total={data?.count ?? 0}
        onPageChange={(page) => setFiltros((f) => ({ ...f, page }))}
      />

      <JornadaDetalleDialog
        jornada={jornadaSeleccionada}
        onClose={() => setJornadaSeleccionada(null)}
      />

      <ExportarReporteDialog
        key={exportarContador}
        open={exportarAbierto}
        onClose={() => setExportarAbierto(false)}
        filtros={filtros}
      />
    </div>
  );
}
