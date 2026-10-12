"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChoferDialog } from "@/components/choferes/chofer-dialog";
import { InvitarChoferDialog } from "@/components/choferes/invitar-chofer-dialog";
import { ListaInvitaciones } from "@/components/choferes/lista-invitaciones";
import { TablaChoferes } from "@/components/choferes/tabla-choferes";
import { useChoferes } from "@/lib/hooks/use-choferes";
import { useEstadoChoferes } from "@/lib/hooks/use-estado-choferes";
import { useInvitaciones } from "@/lib/hooks/use-invitaciones";
import type { ChoferRow } from "@/lib/types";

export default function ChoferesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useChoferes();
  const { data: estadoResp } = useEstadoChoferes();
  const { data: invitacionesResp, isLoading: cargandoInvitaciones } = useInvitaciones();
  const estadoPorId = useMemo(
    () => new Map((estadoResp?.data ?? []).map((e) => [e.id, e])),
    [estadoResp]
  );

  const [choferAEditar, setChoferAEditar] = useState<ChoferRow | null>(null);
  const [invitarAbierto, setInvitarAbierto] = useState(false);

  function invalidarChoferes() {
    queryClient.invalidateQueries({ queryKey: ["choferes"] });
    queryClient.invalidateQueries({ queryKey: ["choferes-estado"] });
  }

  function invalidarInvitaciones() {
    queryClient.invalidateQueries({ queryKey: ["invitaciones"] });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold md:text-[40px]">Choferes</h1>
        {/* Hallazgo #51, criterio 19/22: reemplaza al botón de alta con contraseña temporal --
            ya no se crea ningún usuario de Auth desde acá, solo la invitación. */}
        <Button onClick={() => setInvitarAbierto(true)}>
          <Plus className="h-4 w-4" />
          Invitar chofer
        </Button>
      </div>

      {isError && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudieron cargar los choferes. Intenta de nuevo.
        </p>
      )}

      <TablaChoferes
        choferes={data?.data ?? []}
        estadoPorId={estadoPorId}
        cargando={isLoading}
        onSeleccionar={(chofer) => setChoferAEditar(chofer)}
        onRevisado={() => invalidarChoferes()}
        onAnulado={() => invalidarChoferes()}
      />

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Invitaciones</h2>
        <ListaInvitaciones
          invitaciones={invitacionesResp?.data ?? []}
          cargando={cargandoInvitaciones}
          onRevocada={() => invalidarInvitaciones()}
        />
      </div>

      {choferAEditar && (
        <ChoferDialog
          key={choferAEditar.id}
          chofer={choferAEditar}
          onClose={() => setChoferAEditar(null)}
          onGuardado={() => invalidarChoferes()}
        />
      )}

      {invitarAbierto && (
        <InvitarChoferDialog
          onClose={() => setInvitarAbierto(false)}
          onCreada={() => invalidarInvitaciones()}
        />
      )}
    </div>
  );
}
