"use client";

import { Download, Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CrearJornadaDialog } from "@/components/jornadas/crear-jornada-dialog";
import { EditarJornadaDialog } from "@/components/jornadas/editar-jornada-dialog";
import { ExportarReporteDialog } from "@/components/jornadas/exportar-reporte-dialog";
import { FiltrosJornadasForm } from "@/components/jornadas/filtros-jornadas";
import { JornadaDetalleDialog } from "@/components/jornadas/jornada-detalle-dialog";
import { Paginacion } from "@/components/jornadas/paginacion";
import { TablaJornadas } from "@/components/jornadas/tabla-jornadas";
import { FILTROS_INICIALES, useJornadas } from "@/lib/hooks/use-jornadas";
import type { JornadaRow } from "@/lib/types";

export default function JornadasPage() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState<JornadaRow | null>(null);
  const [jornadaAEditar, setJornadaAEditar] = useState<JornadaRow | null>(null);
  const [exportarAbierto, setExportarAbierto] = useState(false);
  // spec_rutas_asignadas_admin.md: Administración carga una jornada sin pasar por el check-in
  // del chofer -- ruta planificada a futuro, o aviso tardío de una entrega ya hecha.
  const [crearAbierto, setCrearAbierto] = useState(false);
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
        <h1 className="font-display text-3xl font-bold md:text-[40px]">Jornadas</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCrearAbierto(true)}>
            <Plus className="h-4 w-4" />
            Cargar jornada
          </Button>
          <Button onClick={abrirExportar}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>
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
        onEditar={(jornada) => {
          setJornadaSeleccionada(null);
          setJornadaAEditar(jornada);
        }}
      />

      {jornadaAEditar && (
        <EditarJornadaDialog
          key={jornadaAEditar.id}
          jornada={jornadaAEditar}
          onClose={() => setJornadaAEditar(null)}
          onGuardado={() => {
            queryClient.invalidateQueries({ queryKey: ["jornadas"] });
          }}
        />
      )}

      {crearAbierto && (
        <CrearJornadaDialog
          onClose={() => setCrearAbierto(false)}
          onCreada={() => {
            setCrearAbierto(false);
            queryClient.invalidateQueries({ queryKey: ["jornadas"] });
          }}
        />
      )}

      <ExportarReporteDialog
        key={exportarContador}
        open={exportarAbierto}
        onClose={() => setExportarAbierto(false)}
        filtros={filtros}
      />
    </div>
  );
}
