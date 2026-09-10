"use client";

import { Gauge, RadioTower, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatHaceTiempo } from "@/lib/utils";
import { estadoMarcador, ETIQUETA_POR_ESTADO } from "@/lib/mapa-utils";
import type { PosicionChofer } from "@/lib/types";

const VARIANTE_BADGE = {
  rojo: "danger",
  verde: "success",
  ambar: "warning",
} as const;

interface PanelChoferesProps {
  posiciones: PosicionChofer[];
  cargando: boolean;
  choferSeleccionado: string | null;
  onSeleccionar: (choferId: string) => void;
  /** jornada_id cuyo trazado histórico está visible en el mapa (o null). */
  jornadaRutaActiva: string | null;
  onToggleRuta: (jornadaId: string) => void;
}

export function PanelChoferes({
  posiciones,
  cargando,
  choferSeleccionado,
  onSeleccionar,
  jornadaRutaActiva,
  onToggleRuta,
}: PanelChoferesProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Choferes activos</h2>
        <Badge variant="primary">{posiciones.length}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto">
        {cargando && posiciones.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Cargando posiciones…</p>
        )}

        {!cargando && posiciones.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <RadioTower className="h-6 w-6 opacity-60" />
            <p>Ningún chofer con una jornada abierta está enviando posición ahora mismo.</p>
          </div>
        )}

        <ul className="divide-y divide-border">
          {posiciones.map((posicion) => {
            const estado = estadoMarcador(posicion);
            const activo = posicion.choferId === choferSeleccionado;
            // Una jornada concreta cuyo trazado se puede pedir — si el chofer
            // tiene varias abiertas en paralelo, se usa la primera (caso raro,
            // ver §3 de contexto_proyecto.md).
            const jornadaId = posicion.jornadaIds[0] ?? null;
            const rutaVisible = jornadaId != null && jornadaId === jornadaRutaActiva;
            return (
              <li key={posicion.choferId}>
                <button
                  type="button"
                  onClick={() => onSeleccionar(posicion.choferId)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition-colors hover:bg-muted",
                    activo && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {posicion.choferNombre ?? "Chofer sin identificar"}
                    </span>
                    <Badge variant={VARIANTE_BADGE[estado]}>{ETIQUETA_POR_ESTADO[estado]}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {posicion.matricula && <span>{posicion.matricula}</span>}
                    {posicion.empresa && <span>{posicion.empresa}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      {posicion.velocidadKmh != null
                        ? `${posicion.velocidadKmh.toFixed(0)} km/h`
                        : "—"}
                    </span>
                    <span>{formatHaceTiempo(posicion.timestamp)}</span>
                  </div>
                </button>
                {jornadaId && (
                  <button
                    type="button"
                    onClick={() => onToggleRuta(jornadaId)}
                    className={cn(
                      "flex w-full items-center gap-1.5 border-t border-border/60 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      rutaVisible && "text-primary"
                    )}
                  >
                    <Route className="h-3 w-3" />
                    {rutaVisible ? "Ocultar ruta" : "Ver ruta"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
