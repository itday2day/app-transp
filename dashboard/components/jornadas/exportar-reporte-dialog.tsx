"use client";

import { CheckCircle2, Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { daysAgoIsoDate, todayIsoDate } from "@/lib/utils";
import type { FiltrosJornadas } from "@/lib/hooks/use-jornadas";
import type { EstadoJornada, ExportarReporteRequest, ExportarReporteResponse } from "@/lib/types";

interface ExportarReporteDialogProps {
  open: boolean;
  onClose: () => void;
  filtros: FiltrosJornadas;
}

// El modal es una vista de confirmación de solo lectura: los filtros
// (fechas, empresa, chofer, estado) NO son editables acá — son los mismos
// que están activos en la tabla de Jornadas en ese momento, se muestran
// deshabilitados y se envían intactos. El único campo editable es el correo
// de destino, que no tiene equivalente en la tabla. Si se quiere exportar un
// alcance distinto, se cambian los filtros de la tabla y se reabre el modal.
//
// Cuando no hay rango de fechas filtrado en la tabla (desde/hasta vacíos),
// se usa "últimos 7 días" como default — la API exige un rango, así que algo
// hay que mandar — y ese default también se muestra deshabilitado.
//
// El padre (JornadasPage) le pasa un `key` que cambia cada vez que se abre
// el diálogo, forzando un remount: así el campo de correo (y cualquier error
// o resultado de un envío anterior) arranca limpio cada vez, en vez de
// arrastrar lo que quedó de la última vez que se abrió — Dialog solo oculta
// su contenido en vez de desmontarlo.
export function ExportarReporteDialog({ open, onClose, filtros }: ExportarReporteDialogProps) {
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ExportarReporteResponse | null>(null);

  const rangoInicio = filtros.desde || daysAgoIsoDate(7);
  const rangoFin = filtros.hasta || todayIsoDate();

  function cerrarYLimpiar() {
    setError(null);
    setResultado(null);
    onClose();
  }

  async function onSubmit() {
    setError(null);
    setResultado(null);

    if (!correo.includes("@")) {
      setError("Ingresa un correo válido.");
      return;
    }

    setEnviando(true);
    try {
      const body: ExportarReporteRequest = { correo, rangoInicio, rangoFin };
      if (filtros.empresa.trim()) body.empresa = filtros.empresa.trim();
      if (filtros.chofer.trim()) body.chofer = filtros.chofer.trim();
      if (filtros.estado) body.estado = filtros.estado as EstadoJornada;

      const respuesta = await fetch("/api/reportes/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const cuerpo = (await respuesta.json().catch(() => null)) as ExportarReporteResponse | null;

      if (!respuesta.ok) {
        setError(cuerpo?.mensaje ?? "No se pudo generar el reporte.");
        return;
      }

      setResultado(cuerpo ?? { mensaje: "Reporte generado." });
    } catch {
      setError("No se pudo contactar al servidor de reportes.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={cerrarYLimpiar}
      title="Exportar reporte de jornadas"
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="exp-correo">Correo de destino</Label>
          <Input
            id="exp-correo"
            type="email"
            placeholder="admin@empresa.com"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Estos filtros son los mismos que están activos en la tabla de Jornadas — cambialos ahí y
          volvé a abrir este modal si querés otro alcance.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exp-desde">Desde</Label>
            <Input
              id="exp-desde"
              type="date"
              value={rangoInicio}
              disabled
              readOnly
              className="bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
            />
          </div>
          <div>
            <Label htmlFor="exp-hasta">Hasta</Label>
            <Input
              id="exp-hasta"
              type="date"
              value={rangoFin}
              disabled
              readOnly
              className="bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exp-empresa">Empresa</Label>
            <Input
              id="exp-empresa"
              placeholder="Todas"
              value={filtros.empresa}
              disabled
              readOnly
              className="bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
            />
          </div>
          <div>
            <Label htmlFor="exp-chofer">Chofer</Label>
            <Input
              id="exp-chofer"
              placeholder="Todos"
              value={filtros.chofer}
              disabled
              readOnly
              className="bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="exp-estado">Estado</Label>
          <Select
            id="exp-estado"
            value={filtros.estado}
            disabled
            className="bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
          >
            <option value="">Todos</option>
            <option value="abierta">Abierta</option>
            <option value="cerrada">Cerrada</option>
          </Select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {resultado && (
          <div className="flex flex-col gap-1 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {resultado.mensaje}
            </span>
            {resultado.previewUrl && (
              <a
                href={resultado.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                Ver correo de prueba <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cerrarYLimpiar}>
            Cerrar
          </Button>
          <Button type="button" onClick={onSubmit} loading={enviando}>
            <Download className="h-4 w-4" />
            Enviar reporte
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
