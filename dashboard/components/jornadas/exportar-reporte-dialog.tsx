"use client";

import { CheckCircle2, Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useJornadas } from "@/lib/hooks/use-jornadas";
import type { FiltrosJornadas } from "@/lib/hooks/use-jornadas";
import { MAX_JORNADAS_POR_REPORTE } from "@/lib/jornadas-filtro";
import type { EstadoJornada, ExportarReporteRequest, ExportarReporteResponse } from "@/lib/types";

interface ExportarReporteDialogProps {
  open: boolean;
  onClose: () => void;
  filtros: FiltrosJornadas;
}

const ESTADOS_LEGIBLES: Record<EstadoJornada, string> = { abierta: "Abierta", cerrada: "Cerrada" };

/** "YYYY-MM-DD" (día de calendario de España, ver jornadas-filtro.ts) a "DD/MM/YYYY" — no
 * pasa por Date/Intl porque ya es un día de calendario, no un instante a convertir. */
function formatearFechaCorta(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Mismo criterio y misma redacción que describirRangoFechas() en
 * server/mock/reportes.js (hoja "Filtros" del Excel) — a propósito: el
 * diálogo y el archivo describen el mismo rango con las mismas palabras. */
function formatearRangoFechas(desde: string, hasta: string): string {
  if (desde && hasta) return `${formatearFechaCorta(desde)} a ${formatearFechaCorta(hasta)}`;
  if (desde) return `Desde ${formatearFechaCorta(desde)}`;
  if (hasta) return `Hasta ${formatearFechaCorta(hasta)}`;
  return "Todas las fechas";
}

function FiltroAplicado({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm font-medium">{valor}</dd>
    </div>
  );
}

// El diálogo exporta EXACTAMENTE lo que la tabla está mostrando — el único
// campo que se completa acá es el correo de destino; empresa/chofer/estado/
// rango de fechas se muestran (nunca se ocultan: son lo que le dice al
// usuario qué está por exportar) pero no se pueden tocar desde acá. Para
// exportar otro conjunto hay que cambiar el filtro en la tabla y volver a
// abrir "Exportar" — con un solo criterio de filtrado en juego (el de la
// tabla), la coincidencia entre pantalla y archivo es estructural, no algo
// que dependa de mantener sincronizados dos lugares (ver contexto_proyecto.md
// §4, ajuste al Hallazgo #21). El padre (JornadasPage) sigue pasando un
// `key` que cambia en cada apertura, para que el correo/error/resultado de
// una exportación anterior no queden pegados en la siguiente.
export function ExportarReporteDialog({ open, onClose, filtros }: ExportarReporteDialogProps) {
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ExportarReporteResponse | null>(null);

  const { empresa, chofer, estado, desde, hasta } = filtros;

  // ⚠️ La pieza más importante de esta spec: cuántas jornadas se van a
  // exportar, ANTES de exportar — mismo hook que ya usa la tabla
  // (useJornadas), con pageSize=1 (solo hace falta `count`, no las filas) —
  // así el número que ve el administrador viene de la MISMA fuente que la
  // tabla, no de un cálculo aparte que pueda volver a divergir. Ahora que
  // los filtros ya no se pueden editar acá, es también la única señal que
  // podría delatar una divergencia futura entre lo que se ve y lo que se
  // exporta.
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
        `Son ${totalJornadas} jornadas — el máximo por reporte es ${MAX_JORNADAS_POR_REPORTE}. Filtrá la tabla de Jornadas para acotarlo y volvé a exportar.`
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

        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Se exporta exactamente lo que la tabla de Jornadas está mostrando — para cambiar estos
            filtros, cerrá este diálogo, ajustá la tabla y volvé a abrir “Exportar”.
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FiltroAplicado etiqueta="Rango" valor={formatearRangoFechas(desde, hasta)} />
            <FiltroAplicado etiqueta="Empresa" valor={empresa || "Todas"} />
            <FiltroAplicado etiqueta="Chofer" valor={chofer || "Todos"} />
            <FiltroAplicado etiqueta="Estado" valor={estado ? ESTADOS_LEGIBLES[estado] : "Todos"} />
          </dl>
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
                  ? `Son ${totalJornadas} jornadas — el máximo por reporte es ${MAX_JORNADAS_POR_REPORTE}. Filtrá la tabla de Jornadas para acotarlo.`
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
