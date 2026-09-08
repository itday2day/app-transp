"use client";

import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditarJornadaRequest, EditarJornadaResponse, JornadaRow } from "@/lib/types";

interface EditarJornadaDialogProps {
  jornada: JornadaRow;
  onClose: () => void;
  onGuardado: (jornadaActualizada: JornadaRow) => void;
}

// El padre (JornadasPage) renderiza este componente con `key={jornada.id}`,
// forzando un remount cada vez que se abre para editar una jornada distinta
// — así los campos siempre arrancan con los valores de ESA jornada, en vez
// de arrastrar lo que quedó de una edición anterior (mismo criterio que
// ExportarReporteDialog con el correo/error/resultado).
export function EditarJornadaDialog({ jornada, onClose, onGuardado }: EditarJornadaDialogProps) {
  const [empresa, setEmpresa] = useState(jornada.empresa);
  const [matricula, setMatricula] = useState(jornada.matricula);
  const [ruta, setRuta] = useState(jornada.ruta);
  const [kmInicial, setKmInicial] = useState(String(jornada.km_inicial));
  const [kmFinal, setKmFinal] = useState(jornada.km_final != null ? String(jornada.km_final) : "");
  const [combustibleInicial, setCombustibleInicial] = useState(String(jornada.combustible_inicial));
  const [combustibleFinal, setCombustibleFinal] = useState(
    jornada.combustible_final != null ? String(jornada.combustible_final) : ""
  );
  const [editadoPor, setEditadoPor] = useState("");
  const [motivoEdicion, setMotivoEdicion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  async function onSubmit() {
    setError(null);

    if (!editadoPor.trim()) {
      setError("Indicá tu nombre o correo.");
      return;
    }
    if (!motivoEdicion.trim()) {
      setError("El motivo de la corrección es obligatorio.");
      return;
    }

    const body: EditarJornadaRequest = {
      id: jornada.id,
      editadoPor: editadoPor.trim(),
      motivoEdicion: motivoEdicion.trim(),
      empresa: empresa.trim(),
      matricula: matricula.trim(),
      ruta: ruta.trim(),
      kmInicial: Number(kmInicial),
      combustibleInicial: Number(combustibleInicial),
    };
    if (kmFinal.trim()) body.kmFinal = Number(kmFinal);
    if (combustibleFinal.trim()) body.combustibleFinal = Number(combustibleFinal);

    setEnviando(true);
    try {
      const respuesta = await fetch("/api/jornadas/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const cuerpo = (await respuesta.json().catch(() => null)) as EditarJornadaResponse | null;

      if (!respuesta.ok || !cuerpo) {
        setError(cuerpo?.mensaje ?? "No se pudo guardar la corrección.");
        return;
      }

      setGuardado(true);
      onGuardado(cuerpo.jornada);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Corregir jornada" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-empresa">Empresa</Label>
            <Input id="edit-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-matricula">Matrícula</Label>
            <Input
              id="edit-matricula"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="edit-ruta">Ruta</Label>
          <Input id="edit-ruta" value={ruta} onChange={(e) => setRuta(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-km-inicial">Km inicial</Label>
            <Input
              id="edit-km-inicial"
              type="number"
              value={kmInicial}
              onChange={(e) => setKmInicial(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-km-final">Km final</Label>
            <Input
              id="edit-km-final"
              type="number"
              placeholder="—"
              value={kmFinal}
              onChange={(e) => setKmFinal(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="edit-combustible-inicial">Combustible inicial (%)</Label>
            <Input
              id="edit-combustible-inicial"
              type="number"
              min={0}
              max={100}
              value={combustibleInicial}
              onChange={(e) => setCombustibleInicial(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-combustible-final">Combustible final (%)</Label>
            <Input
              id="edit-combustible-final"
              type="number"
              min={0}
              max={100}
              placeholder="—"
              value={combustibleFinal}
              onChange={(e) => setCombustibleFinal(e.target.value)}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <Label htmlFor="edit-editado-por">Tu nombre o correo</Label>
          <Input
            id="edit-editado-por"
            placeholder="admin@empresa.com"
            value={editadoPor}
            onChange={(e) => setEditadoPor(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="edit-motivo">Motivo de la corrección</Label>
          <textarea
            id="edit-motivo"
            rows={3}
            placeholder="Ej: el chofer cargó mal el kilometraje final por error de tipeo."
            value={motivoEdicion}
            onChange={(e) => setMotivoEdicion(e.target.value)}
            className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {guardado && (
          <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Jornada corregida correctamente.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {guardado ? "Cerrar" : "Cancelar"}
          </Button>
          {!guardado && (
            <Button type="button" onClick={onSubmit} loading={enviando}>
              <Save className="h-4 w-4" />
              Guardar corrección
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
