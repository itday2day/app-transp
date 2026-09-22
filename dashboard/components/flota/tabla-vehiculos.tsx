"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ESTADOS_VEHICULO_LEGIBLES, TIPOS_PROPIEDAD_LEGIBLES } from "@/lib/vehiculos";
import type { VehiculoRow } from "@/lib/types";

interface TablaVehiculosProps {
  vehiculos: VehiculoRow[];
  cargando: boolean;
  onSeleccionar: (vehiculo: VehiculoRow) => void;
}

const COLUMNAS = ["Matrícula", "Tipo", "Marca / Modelo", "Año", "Capacidad tanque", "Estado"];

function EstadoBadge({ vehiculo }: { vehiculo: VehiculoRow }) {
  return (
    <Badge variant={vehiculo.estado === "activo" ? "primary" : "default"}>
      {ESTADOS_VEHICULO_LEGIBLES[vehiculo.estado]}
    </Badge>
  );
}

function TarjetaVehiculo({
  vehiculo,
  cargando,
  onSeleccionar,
}: {
  vehiculo: VehiculoRow;
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
          <p className="font-medium">{vehiculo.matricula}</p>
          <p className="text-xs text-muted-foreground">
            {TIPOS_PROPIEDAD_LEGIBLES[vehiculo.tipo_propiedad]}
          </p>
        </div>
        <EstadoBadge vehiculo={vehiculo} />
      </div>

      {(vehiculo.marca || vehiculo.modelo) && (
        <p className="text-xs text-muted-foreground">
          {[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Año: {vehiculo.anio ?? "—"}</span>
        <span>Tanque: {vehiculo.capacidad_tanque_litros ?? "—"} L</span>
      </div>
    </button>
  );
}

export function TablaVehiculos({ vehiculos, cargando, onSeleccionar }: TablaVehiculosProps) {
  return (
    <>
      {/* Mismo criterio que TablaJornadas: tabla desde `lg`, tarjetas por debajo (un teléfono en
          horizontal suele superar `md`, así que el corte va en `lg`). */}
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
            {vehiculos.map((vehiculo) => (
              <tr
                key={vehiculo.id}
                onClick={() => onSeleccionar(vehiculo)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted",
                  cargando && "opacity-60"
                )}
              >
                <td className="px-3 py-2 font-medium">{vehiculo.matricula}</td>
                <td className="px-3 py-2">{TIPOS_PROPIEDAD_LEGIBLES[vehiculo.tipo_propiedad]}</td>
                <td className="px-3 py-2">
                  {[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2">{vehiculo.anio ?? "—"}</td>
                <td className="px-3 py-2">
                  {vehiculo.capacidad_tanque_litros != null
                    ? `${vehiculo.capacidad_tanque_litros} L`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <EstadoBadge vehiculo={vehiculo} />
                </td>
              </tr>
            ))}

            {!cargando && vehiculos.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNAS.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No hay vehículos cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {vehiculos.map((vehiculo) => (
          <TarjetaVehiculo
            key={vehiculo.id}
            vehiculo={vehiculo}
            cargando={cargando}
            onSeleccionar={() => onSeleccionar(vehiculo)}
          />
        ))}

        {!cargando && vehiculos.length === 0 && (
          <p className="rounded-lg border border-border px-3 py-10 text-center text-sm text-muted-foreground">
            No hay vehículos cargados todavía.
          </p>
        )}
      </div>
    </>
  );
}
