"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useEmpresas } from "@/lib/hooks/use-empresas";
import { useRutas } from "@/lib/hooks/use-rutas";
import type {
  CrearInvitacionRequest,
  CrearInvitacionResponse,
  InvitacionConEstado,
} from "@/lib/types";

interface InvitarChoferDialogProps {
  onClose: () => void;
  onCreada: (invitacion: InvitacionConEstado) => void;
}

function mensajeDeError(cuerpo: unknown, fallback: string): string {
  return cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
    ? String((cuerpo as { mensaje: unknown }).mensaje)
    : fallback;
}

/** Mismo patrón que ContrasenaTemporal en chofer-dialog.tsx: el texto se puede volver a leer
 * mientras el diálogo esté abierto (a diferencia de la contraseña, acá no hay ningún secreto que
 * perder), pero el botón "Copiar" es el gesto esperado antes de cerrar y pegarlo donde
 * Administración avise al chofer. */
function MensajeParaCopiar({ mensaje }: { mensaje: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el texto sigue visible para copiarlo a mano.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
      <pre className="whitespace-pre-wrap font-sans">{mensaje}</pre>
      <Button type="button" variant="outline" onClick={copiar} className="self-start">
        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

export function InvitarChoferDialog({ onClose, onCreada }: InvitarChoferDialogProps) {
  const { data: empresasResp } = useEmpresas();
  const { data: rutasResp } = useRutas();
  const empresas = useMemo(
    () => (empresasResp?.data ?? []).filter((e) => e.activo),
    [empresasResp]
  );

  const [empresaId, setEmpresaId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const rutasDeLaEmpresa = useMemo(() => {
    if (!empresaId) return [];
    return (rutasResp?.data ?? []).filter((r) => r.empresa_id === empresaId && r.activo);
  }, [rutasResp, empresaId]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajeParaCopiar, setMensajeParaCopiar] = useState<string | null>(null);

  function manejarCambioEmpresa(nuevaEmpresaId: string) {
    setEmpresaId(nuevaEmpresaId);
    setRutaId("");
  }

  async function onSubmit() {
    setError(null);
    setEnviando(true);
    try {
      const cuerpo: CrearInvitacionRequest = {
        empresaId: empresaId || undefined,
        rutaId: rutaId || undefined,
      };
      const respuesta = await fetch("/api/invitaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const cuerpoRespuesta: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpoRespuesta, "No se pudo generar la invitación."));
        return;
      }
      const { invitacion, mensajeParaCopiar: mensaje } = cuerpoRespuesta as CrearInvitacionResponse;
      setMensajeParaCopiar(mensaje);
      onCreada(invitacion);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Invitar chofer" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Generá una invitación para que el chofer se registre solo, desde su teléfono. Vale una
          sola vez y vence a las 48 horas.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="inv-empresa">Empresa (opcional)</Label>
            <Select
              id="inv-empresa"
              value={empresaId}
              onChange={(e) => manejarCambioEmpresa(e.target.value)}
              disabled={!!mensajeParaCopiar}
            >
              <option value="">Sin asignar</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-ruta">Ruta (opcional)</Label>
            <Select
              id="inv-ruta"
              value={rutaId}
              onChange={(e) => setRutaId(e.target.value)}
              disabled={!empresaId || !!mensajeParaCopiar}
            >
              <option value="">Sin asignar</option>
              {rutasDeLaEmpresa.map((ruta) => (
                <option key={ruta.id} value={ruta.id}>
                  {ruta.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {mensajeParaCopiar && <MensajeParaCopiar mensaje={mensajeParaCopiar} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {mensajeParaCopiar ? "Cerrar" : "Cancelar"}
          </Button>
          {!mensajeParaCopiar && (
            <Button type="button" onClick={onSubmit} loading={enviando}>
              Generar invitación
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
