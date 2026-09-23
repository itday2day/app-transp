"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChoferRow } from "@/lib/types";

interface TablaChoferesProps {
  choferes: ChoferRow[];
  cargando: boolean;
  onSeleccionar: (chofer: ChoferRow) => void;
}

const COLUMNAS = ["N.º empleado", "Nombre", "DNI", "País", "Estado", ""];

function EstadoBadge({ chofer }: { chofer: ChoferRow }) {
  return (
    <Badge variant={chofer.activo ? "primary" : "default"}>
      {chofer.activo ? "Activo" : "De baja"}
    </Badge>
  );
}

function TarjetaChofer({
  chofer,
  cargando,
  onSeleccionar,
}: {
  chofer: ChoferRow;
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
          <p className="font-medium">
            {chofer.nombre} {chofer.apellidos}
          </p>
          <p className="text-xs text-muted-foreground">N.º {chofer.numero_empleado}</p>
        </div>
        <EstadoBadge chofer={chofer} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>DNI: {chofer.dni}</span>
        <span>{chofer.pais_nacimiento}</span>
      </div>

      {chofer.debe_cambiar_contrasena && (
        <Badge variant="warning">Debe cambiar la contraseña</Badge>
      )}
    </button>
  );
}

export function TablaChoferes({ choferes, cargando, onSeleccionar }: TablaChoferesProps) {
  return (
    <>
      {/* Mismo criterio que TablaJornadas/TablaVehiculos: tabla desde `lg`, tarjetas por debajo. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[720px] text-left text-sm">
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
            {choferes.map((chofer) => (
              <tr
                key={chofer.id}
                onClick={() => onSeleccionar(chofer)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted",
                  cargando && "opacity-60"
                )}
              >
                <td className="px-3 py-2 font-medium">{chofer.numero_empleado}</td>
                <td className="px-3 py-2">
                  {chofer.nombre} {chofer.apellidos}
                </td>
                <td className="px-3 py-2">{chofer.dni}</td>
                <td className="px-3 py-2">{chofer.pais_nacimiento}</td>
                <td className="px-3 py-2">
                  <EstadoBadge chofer={chofer} />
                </td>
                <td className="px-3 py-2">
                  {chofer.debe_cambiar_contrasena && <Badge variant="warning">Pendiente</Badge>}
                </td>
              </tr>
            ))}

            {!cargando && choferes.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNAS.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No hay choferes cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {choferes.map((chofer) => (
          <TarjetaChofer
            key={chofer.id}
            chofer={chofer}
            cargando={cargando}
            onSeleccionar={() => onSeleccionar(chofer)}
          />
        ))}

        {!cargando && choferes.length === 0 && (
          <p className="rounded-lg border border-border px-3 py-10 text-center text-sm text-muted-foreground">
            No hay choferes cargados todavía.
          </p>
        )}
      </div>
    </>
  );
}
