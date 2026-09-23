"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChoferDialog } from "@/components/choferes/chofer-dialog";
import { TablaChoferes } from "@/components/choferes/tabla-choferes";
import { useChoferes } from "@/lib/hooks/use-choferes";
import type { ChoferRow } from "@/lib/types";

export default function ChoferesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useChoferes();
  const [choferAEditar, setChoferAEditar] = useState<ChoferRow | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["choferes"] });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Choferes</h1>
        <Button
          onClick={() => {
            setChoferAEditar(null);
            setDialogoAbierto(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Agregar chofer
        </Button>
      </div>

      {isError && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudieron cargar los choferes. Intenta de nuevo.
        </p>
      )}

      <TablaChoferes
        choferes={data?.data ?? []}
        cargando={isLoading}
        onSeleccionar={(chofer) => {
          setChoferAEditar(chofer);
          setDialogoAbierto(true);
        }}
      />

      {dialogoAbierto && (
        <ChoferDialog
          key={choferAEditar?.id ?? "nuevo"}
          chofer={choferAEditar}
          onClose={() => setDialogoAbierto(false)}
          onGuardado={() => {
            invalidar();
          }}
        />
      )}
    </div>
  );
}
