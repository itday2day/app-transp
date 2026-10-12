"use client";

import { useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFechaHora } from "@/lib/utils";
import type { EstadoInvitacion, InvitacionConEstado } from "@/lib/types";

interface ListaInvitacionesProps {
  invitaciones: InvitacionConEstado[];
  cargando: boolean;
  onRevocada: (invitacion: InvitacionConEstado) => void;
}

const VARIANTE_POR_ESTADO: Record<EstadoInvitacion, BadgeProps["variant"]> = {
  pendiente: "primary",
  usada: "success",
  vencida: "default",
  revocada: "danger",
};

const ETIQUETA_POR_ESTADO: Record<EstadoInvitacion, string> = {
  pendiente: "Pendiente",
  usada: "Usada",
  vencida: "Vencida",
  revocada: "Revocada",
};

function EstadoBadge({ estado }: { estado: EstadoInvitacion }) {
  return <Badge variant={VARIANTE_POR_ESTADO[estado]}>{ETIQUETA_POR_ESTADO[estado]}</Badge>;
}

function BotonRevocar({
  invitacion,
  onRevocada,
}: {
  invitacion: InvitacionConEstado;
  onRevocada: (invitacion: InvitacionConEstado) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revocar() {
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/invitaciones/revocar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invitacion.id }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(
          cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
            ? String((cuerpo as { mensaje: unknown }).mensaje)
            : "No se pudo revocar la invitación."
        );
        return;
      }
      onRevocada((cuerpo as { invitacion: InvitacionConEstado }).invitacion);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  if (confirmando) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(false)}>
            No
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={revocar} loading={enviando}>
            Sí, revocar
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={() => setConfirmando(true)}>
      Revocar
    </Button>
  );
}

export function ListaInvitaciones({ invitaciones, cargando, onRevocada }: ListaInvitacionesProps) {
  if (cargando) {
    return <p className="text-sm text-muted-foreground">Cargando invitaciones…</p>;
  }
  if (invitaciones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No hay ninguna invitación generada todavía.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Empresa · Ruta</th>
            <th className="px-3 py-2 font-medium">Generada por</th>
            <th className="px-3 py-2 font-medium">Vence</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invitaciones.map((invitacion) => (
            <tr key={invitacion.id}>
              <td className="px-3 py-2">
                <EstadoBadge estado={invitacion.estado} />
              </td>
              <td className="px-3 py-2">
                {invitacion.empresaNombre ?? "—"}
                {invitacion.rutaNombre ? ` · ${invitacion.rutaNombre}` : ""}
              </td>
              <td className="px-3 py-2">{invitacion.creada_por ?? "—"}</td>
              <td className="px-3 py-2 font-mono">{formatFechaHora(invitacion.vence_at)}</td>
              <td className="px-3 py-2 text-right">
                {invitacion.estado === "pendiente" && (
                  <BotonRevocar invitacion={invitacion} onRevocada={onRevocada} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
