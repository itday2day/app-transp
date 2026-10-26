"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface CrearEmpresaDialogProps {
  onClose: () => void;
  onCreada: () => void;
}

function mensajeDeError(cuerpo: unknown, fallback: string): string {
  return cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
    ? String((cuerpo as { mensaje: unknown }).mensaje)
    : fallback;
}

export function CrearEmpresaDialog({ onClose, onCreada }: CrearEmpresaDialogProps) {
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setError(null);
    if (!nombre.trim()) {
      setError("Falta el nombre de la empresa.");
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo crear la empresa."));
        return;
      }
      onCreada();
      onClose();
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Nueva empresa" className="max-w-md">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Nombre
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-11 rounded-md border border-border bg-card px-3 text-base md:h-9 md:text-sm"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={crear} loading={enviando}>
            Crear
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
