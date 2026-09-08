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

// Los valores se inicializan a partir de los filtros activos en la tabla de
// Jornadas, para que "Exportar" mande por defecto exactamente lo que el
// admin está viendo — no un rango fijo de "última semana" desconectado de la
// vista. Quedan editables por si se quiere un reporte con un alcance
// distinto al filtro actual.
//
// El padre (JornadasPage) le pasa un `key` que cambia cada vez que se abre
// el diálogo, forzando un remount: es lo que hace que estos useState se
// re-inicialicen con los filtros vigentes en ESE momento — sin eso, como
// Dialog solo oculta su contenido en vez de desmontarlo, los campos se
// quedarían pegados a los filtros de la primera vez que se abrió.
export function ExportarReporteDialog({ open, onClose, filtros }: ExportarReporteDialogProps) {
  const [correo, setCorreo] = useState("");
  const [rangoInicio, setRangoInicio] = useState(filtros.desde || daysAgoIsoDate(7));
  const [rangoFin, setRangoFin] = useState(filtros.hasta || todayIsoDate());
  const [empresa, setEmpresa] = useState(filtros.empresa);
  const [chofer, setChofer] = useState(filtros.chofer);
  const [estado, setEstado] = useState<FiltrosJornadas["estado"]>(filtros.estado);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ExportarReporteResponse | null>(null);

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
    if (!rangoInicio || !rangoFin) {
      setError("Selecciona el rango de fechas.");
      return;
    }

    setEnviando(true);
    try {
      const body: ExportarReporteRequest = { correo, rangoInicio, rangoFin };
      if (empresa.trim()) body.empresa = empresa.trim();
      if (chofer.trim()) body.chofer = chofer.trim();
      if (estado) body.estado = estado as EstadoJornada;

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exp-desde">Desde</Label>
            <Input
              id="exp-desde"
              type="date"
              value={rangoInicio}
              onChange={(e) => setRangoInicio(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="exp-hasta">Hasta</Label>
            <Input
              id="exp-hasta"
              type="date"
              value={rangoFin}
              onChange={(e) => setRangoFin(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exp-empresa">Empresa (opcional)</Label>
            <Input
              id="exp-empresa"
              placeholder="Todas"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="exp-chofer">Chofer (opcional)</Label>
            <Input
              id="exp-chofer"
              placeholder="Todos"
              value={chofer}
              onChange={(e) => setChofer(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="exp-estado">Estado</Label>
          <Select
            id="exp-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as FiltrosJornadas["estado"])}
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
