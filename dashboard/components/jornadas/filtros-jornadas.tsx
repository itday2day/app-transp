"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FILTROS_INICIALES, type FiltrosJornadas } from "@/lib/hooks/use-jornadas";

interface FiltrosJornadasFormProps {
  filtros: FiltrosJornadas;
  onChange: (filtros: FiltrosJornadas) => void;
}

export function FiltrosJornadasForm({ filtros, onChange }: FiltrosJornadasFormProps) {
  function actualizar<K extends keyof FiltrosJornadas>(campo: K, valor: FiltrosJornadas[K]) {
    onChange({ ...filtros, [campo]: valor, page: 1 });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div>
        <Label htmlFor="f-empresa">Empresa</Label>
        <Input
          id="f-empresa"
          placeholder="Todas"
          value={filtros.empresa}
          onChange={(e) => actualizar("empresa", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="f-chofer">Chofer</Label>
        <Input
          id="f-chofer"
          placeholder="Nombre"
          value={filtros.chofer}
          onChange={(e) => actualizar("chofer", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="f-estado">Estado</Label>
        <Select
          id="f-estado"
          value={filtros.estado}
          onChange={(e) => actualizar("estado", e.target.value as FiltrosJornadas["estado"])}
        >
          <option value="">Todos</option>
          <option value="abierta">Abierta</option>
          <option value="cerrada">Cerrada</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="f-desde">Desde</Label>
        <Input
          id="f-desde"
          type="date"
          value={filtros.desde}
          onChange={(e) => actualizar("desde", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="f-hasta">Hasta</Label>
        <Input
          id="f-hasta"
          type="date"
          value={filtros.hasta}
          onChange={(e) => actualizar("hasta", e.target.value)}
        />
      </div>
      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onChange(FILTROS_INICIALES)}
        >
          <RotateCcw className="h-4 w-4" />
          Limpiar
        </Button>
      </div>
    </div>
  );
}
