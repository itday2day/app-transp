"use client";

import { CheckCircle2, Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useJornadas } from "@/lib/hooks/use-jornadas";
import type { FiltrosJornadas } from "@/lib/hooks/use-jornadas";
import { MAX_JORNADAS_POR_REPORTE } from "@/lib/jornadas-filtro";
import type { EstadoJornada, ExportarReporteRequest, ExportarReporteResponse } from "@/lib/types";

interface ExportarReporteDialogProps {
  open: boolean;
  onClose: () => void;
  filtros: FiltrosJornadas;
}

// El padre (JornadasPage) le pasa un `key` que cambia cada vez que se abre
// el diálogo, forzando un remount: así los `useState` de abajo siempre
// arrancan frescos, derivados de los filtros ACTIVOS de la tabla en ese
// momento — nunca de una apertura anterior (Hallazgo #21). Antes los
// campos eran de solo lectura (espejo de la tabla); ahora son editables —
// arrancan iguales a la tabla pero se pueden ajustar acá sin tocarla, y el
// contador de abajo se recalcula con cada cambio.
export function ExportarReporteDialog({ open, onClose, filtros }: ExportarReporteDialogProps) {
  const [correo, setCorreo] = useState("");
  const [empresa, setEmpresa] = useState(filtros.empresa);
  const [chofer, setChofer] = useState(filtros.chofer);
  const [estado, setEstado] = useState(filtros.estado);
  const [desde, setDesde] = useState(filtros.desde);
  const [hasta, setHasta] = useState(filtros.hasta);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ExportarReporteResponse | null>(null);

  // ⚠️ La pieza más importante de esta spec: cuántas jornadas se van a
  // exportar, ANTES de exportar — mismo hook que ya usa la tabla
  // (useJornadas), con pageSize=1 (solo hace falta `count`, no las filas) —
  // así el número que ve el administrador viene de la MISMA fuente que la
  // tabla, no de un cálculo aparte que pueda volver a divergir. Sin esto,
  // el fix de abajo (rango opcional, filtros compartidos) corrige el caso
  // conocido, pero una divergencia futura volvería a ser silenciosa.
  const {
    data: previewData,
    isLoading: cargandoConteo,
    isError: errorConteo,
  } = useJornadas({ empresa, chofer, estado, desde, hasta, page: 1, pageSize: 1 });
  const totalJornadas = previewData?.count ?? null;
  const sinResultados = totalJornadas === 0;
  // El servidor igual lo va a rechazar si esto se le escapa (defensa en
  // profundidad, ver /api/reportes/exportar) — pero bloquearlo ACÁ, con el
  // número que el diálogo ya tiene calculado, evita gastar tiempo armando
  // un correo/Excel que se sabe de antemano que va a fallar. Un reporte
  // truncado (menos jornadas de las que dice traer) es peor que ningún
  // reporte cuando con él se pagan sueldos — no alcanza con limitar la
  // consulta (`.limit()`), porque PostgREST puede truncar la respuesta por
  // su cuenta (`db-max-rows`) por debajo de ese límite, en silencio.
  const excedeMaximo = totalJornadas != null && totalJornadas > MAX_JORNADAS_POR_REPORTE;

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
    if (sinResultados) {
      setError("No hay jornadas que coincidan con estos filtros.");
      return;
    }
    if (excedeMaximo) {
      setError(
        `Son ${totalJornadas} jornadas — el máximo por reporte es ${MAX_JORNADAS_POR_REPORTE}. Acotá el rango o los filtros.`
      );
      return;
    }

    setEnviando(true);
    try {
      // rangoInicio/rangoFin/empresa/chofer/estado se mandan SOLO si tienen
      // valor — "sin fecha" significa "sin límite de ese lado" (igual que
      // la tabla), no un rango por defecto inventado acá (esa sustitución
      // silenciosa era la causa real del Hallazgo #21).
      const body: ExportarReporteRequest = { correo };
      if (desde) body.rangoInicio = desde;
      if (hasta) body.rangoFin = hasta;
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

        <p className="text-xs text-muted-foreground">
          Arrancan iguales a los filtros activos en la tabla de Jornadas — podés ajustarlos acá para
          este reporte sin afectar la tabla.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exp-desde">Desde</Label>
            <Input
              id="exp-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="exp-hasta">Hasta</Label>
            <Input
              id="exp-hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="exp-empresa">Empresa</Label>
            <Input
              id="exp-empresa"
              placeholder="Todas"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="exp-chofer">Chofer</Label>
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

        <p
          role="status"
          className={
            errorConteo || sinResultados || excedeMaximo
              ? "text-sm font-medium text-danger"
              : "text-sm font-medium text-foreground"
          }
        >
          {cargandoConteo
            ? "Calculando cuántas jornadas coinciden…"
            : errorConteo
              ? "No se pudo calcular cuántas jornadas coinciden con estos filtros."
              : sinResultados
                ? "No hay jornadas que coincidan con estos filtros — no se va a generar ningún reporte."
                : excedeMaximo
                  ? `Son ${totalJornadas} jornadas — el máximo por reporte es ${MAX_JORNADAS_POR_REPORTE}. Acotá el rango o los filtros.`
                  : `Se exportarán ${totalJornadas} jornada${totalJornadas === 1 ? "" : "s"}.`}
        </p>

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
          <Button
            type="button"
            onClick={onSubmit}
            loading={enviando}
            disabled={cargandoConteo || sinResultados || errorConteo || excedeMaximo}
          >
            <Download className="h-4 w-4" />
            Enviar reporte
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
