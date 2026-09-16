"use client";

import { AlertTriangle, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, formatFechaHora } from "@/lib/utils";
import type { JornadaRow } from "@/lib/types";

interface TablaJornadasProps {
  jornadas: JornadaRow[];
  cargando: boolean;
  onSeleccionar: (jornada: JornadaRow) => void;
}

const COLUMNAS = [
  "Chofer",
  "Empresa",
  "Matrícula",
  "Ruta",
  "Check-in",
  "Check-out",
  "Estado",
  "Incidencia",
  "",
];

function TarjetaJornada({
  jornada,
  cargando,
  onSeleccionar,
}: {
  jornada: JornadaRow;
  cargando: boolean;
  onSeleccionar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left text-sm transition-colors hover:bg-muted",
        cargando && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{jornada.chofer_nombre}</p>
          <p className="text-xs text-muted-foreground">
            {jornada.empresa} · {jornada.matricula}
          </p>
        </div>
        <Badge variant={jornada.estado === "abierta" ? "primary" : "default"}>
          {jornada.estado === "abierta" ? "Abierta" : "Cerrada"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{jornada.ruta}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Check-in: {formatFechaHora(jornada.fecha_check_in)}</span>
        <span>Check-out: {formatFechaHora(jornada.fecha_check_out)}</span>
      </div>

      {(jornada.tuvo_incidencia || jornada.fue_editado) && (
        <div className="flex flex-wrap items-center gap-2">
          {jornada.tuvo_incidencia && (
            <Badge variant="danger">
              <AlertTriangle className="h-3 w-3" />
              {jornada.tipo_incidencia ?? "Incidencia"}
            </Badge>
          )}
          {jornada.fue_editado && (
            <Badge variant="warning">
              <Pencil className="h-3 w-3" />
              Editado
            </Badge>
          )}
        </div>
      )}
    </button>
  );
}

export function TablaJornadas({ jornadas, cargando, onSeleccionar }: TablaJornadasProps) {
  return (
    <>
      {/* Mismo array de jornadas ya cargado por la página — mobile
          (por debajo de `lg`, para que un teléfono en horizontal —que suele
          superar los 768px de `md`— siga viendo el layout compacto) usa
          tarjetas en vez de la tabla, que con 9
          columnas no entra en un viewport angosto sin scroll horizontal
          incómodo; desktop se queda exactamente igual que hoy. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              {COLUMNAS.map((columna) => (
                <th key={columna} className="px-3 py-2 font-medium">
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jornadas.map((jornada) => (
              <tr
                key={jornada.id}
                onClick={() => onSeleccionar(jornada)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted",
                  cargando && "opacity-60"
                )}
              >
                <td className="px-3 py-2 font-medium">{jornada.chofer_nombre}</td>
                <td className="px-3 py-2">{jornada.empresa}</td>
                <td className="px-3 py-2">{jornada.matricula}</td>
                <td className="px-3 py-2">{jornada.ruta}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatFechaHora(jornada.fecha_check_in)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatFechaHora(jornada.fecha_check_out)}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={jornada.estado === "abierta" ? "primary" : "default"}>
                    {jornada.estado === "abierta" ? "Abierta" : "Cerrada"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {jornada.tuvo_incidencia ? (
                    <Badge variant="danger">
                      <AlertTriangle className="h-3 w-3" />
                      {jornada.tipo_incidencia ?? "Sí"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {jornada.fue_editado && (
                    <Tooltip
                      contenido={
                        <div className="flex flex-col gap-0.5">
                          <p>
                            <span className="font-semibold">Editado por:</span>{" "}
                            {jornada.editado_por ?? "—"}
                          </p>
                          <p>
                            <span className="font-semibold">Cuándo:</span>{" "}
                            {formatFechaHora(jornada.editado_en)}
                          </p>
                          <p>
                            <span className="font-semibold">Motivo:</span>{" "}
                            {jornada.motivo_edicion ?? "—"}
                          </p>
                        </div>
                      }
                    >
                      <Badge variant="warning" onClick={(e) => e.stopPropagation()}>
                        <Pencil className="h-3 w-3" />
                        Editado
                      </Badge>
                    </Tooltip>
                  )}
                </td>
              </tr>
            ))}

            {!cargando && jornadas.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNAS.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No hay jornadas que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {jornadas.map((jornada) => (
          <TarjetaJornada
            key={jornada.id}
            jornada={jornada}
            cargando={cargando}
            onSeleccionar={() => onSeleccionar(jornada)}
          />
        ))}

        {!cargando && jornadas.length === 0 && (
          <p className="rounded-lg border border-border px-3 py-10 text-center text-sm text-muted-foreground">
            No hay jornadas que coincidan con los filtros.
          </p>
        )}
      </div>
    </>
  );
}
