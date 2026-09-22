"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TablaVehiculos } from "@/components/flota/tabla-vehiculos";
import { VehiculoDialog } from "@/components/flota/vehiculo-dialog";
import { useVehiculos } from "@/lib/hooks/use-vehiculos";
import type { VehiculoRow } from "@/lib/types";

export default function FlotaPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useVehiculos();
  const [vehiculoAEditar, setVehiculoAEditar] = useState<VehiculoRow | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Flota</h1>
        <Button
          onClick={() => {
            setVehiculoAEditar(null);
            setDialogoAbierto(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Agregar vehículo
        </Button>
      </div>

      {isError && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudieron cargar los vehículos. Intenta de nuevo.
        </p>
      )}

      <TablaVehiculos
        vehiculos={data?.data ?? []}
        cargando={isLoading}
        onSeleccionar={(vehiculo) => {
          setVehiculoAEditar(vehiculo);
          setDialogoAbierto(true);
        }}
      />

      {dialogoAbierto && (
        <VehiculoDialog
          key={vehiculoAEditar?.id ?? "nuevo"}
          vehiculo={vehiculoAEditar}
          onClose={() => setDialogoAbierto(false)}
          onGuardado={() => {
            invalidar();
          }}
        />
      )}
    </div>
  );
}
