"use client";

import { AlertTriangle, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { formatFechaHora } from "@/lib/utils";
import type { JornadaRow } from "@/lib/types";

interface JornadaDetalleDialogProps {
  jornada: JornadaRow | null;
  onClose: () => void;
}

function Dato({ label, valor }: { label: string; valor: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{valor ?? "—"}</dd>
    </div>
  );
}

function Foto({ titulo, url }: { titulo: string; url: string | null }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{titulo}</p>
      {url ? (
        // Los buckets de Storage son de lectura pública: la URL sirve directo en <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={titulo}
          className="h-40 w-full rounded-md border border-border object-cover"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <ImageOff className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

export function JornadaDetalleDialog({ jornada, onClose }: JornadaDetalleDialogProps) {
  return (
    <Dialog open={jornada != null} onClose={onClose} title="Detalle de jornada">
      {jornada && (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato label="Chofer" valor={jornada.chofer_nombre} />
            <Dato label="Empresa" valor={jornada.empresa} />
            <Dato label="Matrícula" valor={jornada.matricula} />
            <Dato label="Ruta" valor={jornada.ruta} />
            <Dato label="Estado" valor={jornada.estado === "abierta" ? "Abierta" : "Cerrada"} />
            <Dato label="Check-in" valor={formatFechaHora(jornada.fecha_check_in)} />
            <Dato label="Check-out" valor={formatFechaHora(jornada.fecha_check_out)} />
            <Dato label="Km inicial" valor={jornada.km_inicial} />
            <Dato label="Km final" valor={jornada.km_final} />
            <Dato
              label="Combustible inicial"
              valor={jornada.combustible_inicial != null ? `${jornada.combustible_inicial}%` : null}
            />
            <Dato
              label="Combustible final"
              valor={jornada.combustible_final != null ? `${jornada.combustible_final}%` : null}
            />
          </dl>

          {jornada.incidencias && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Incidencias (notas de ruta)</p>
              <p className="text-sm">{jornada.incidencias}</p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Incidencia de check-out</p>
              {jornada.tuvo_incidencia && (
                <Badge variant="danger">
                  <AlertTriangle className="h-3 w-3" />
                  {jornada.tipo_incidencia ?? "Sí"}
                </Badge>
              )}
            </div>
            {jornada.tuvo_incidencia ? (
              <p className="text-sm">{jornada.detalle_incidencia || "Sin detalle adicional."}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin incidencia reportada.</p>
            )}
          </div>

          {jornada.fotos_incidencia && jornada.fotos_incidencia.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Fotos de respaldo de la incidencia
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {jornada.fotos_incidencia.map((url, indice) => (
                  <Foto key={url} titulo={`Foto ${indice + 1}`} url={url} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Foto titulo="Tacómetro inicial" url={jornada.foto_tacometro_inicial_url} />
            <Foto titulo="Hoja de ruta" url={jornada.foto_ruta_url} />
            <Foto titulo="Tacómetro final" url={jornada.foto_tacometro_final_url} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
