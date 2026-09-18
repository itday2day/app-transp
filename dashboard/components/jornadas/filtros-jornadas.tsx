"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FILTROS_INICIALES, type FiltrosJornadas } from "@/lib/hooks/use-jornadas";
import { daysAgoIsoDate, firstDayOfMonthIsoDate, todayIsoDate } from "@/lib/utils";

interface FiltrosJornadasFormProps {
  filtros: FiltrosJornadas;
  onChange: (filtros: FiltrosJornadas) => void;
}

type AtajoRango = "hoy" | "7dias" | "mes";

// Un rango de fechas siempre significa días de calendario de España
// (Hallazgo #17, decisión de negocio) — todayIsoDate()/daysAgoIsoDate()/
// firstDayOfMonthIsoDate() (lib/utils.ts) ya calculan en Europe/Madrid, sin
// importar la zona horaria del navegador del administrador. Antes esta
// función tenía su propio cálculo con los getters LOCALES del navegador,
// distinto del de esos helpers (que en ese momento sí usaban UTC) — ya
// unificados los dos casos, no hay dos criterios de fecha conviviendo.
function calcularAtajoRango(atajo: AtajoRango): { desde: string; hasta: string } {
  const hasta = todayIsoDate();
  if (atajo === "hoy") return { desde: hasta, hasta };
  if (atajo === "7dias") return { desde: daysAgoIsoDate(6), hasta };
  return { desde: firstDayOfMonthIsoDate(), hasta };
}

export function FiltrosJornadasForm({ filtros, onChange }: FiltrosJornadasFormProps) {
  function actualizar<K extends keyof FiltrosJornadas>(campo: K, valor: FiltrosJornadas[K]) {
    onChange({ ...filtros, [campo]: valor, page: 1 });
  }

  // Atajo de escritura sobre los mismos "desde"/"hasta" de siempre — dispara
  // el mismo filtrado que si el admin hubiera cargado las fechas a mano, sin
  // ningún estado ni modo de filtrado nuevo.
  function aplicarAtajoRango(atajo: AtajoRango) {
    onChange({ ...filtros, ...calcularAtajoRango(atajo), page: 1 });
  }

  return (
    // Por debajo de `lg`: una columna, cada control en su propia fila salvo
    // el par Desde/Hasta (su propia sub-grilla de 2 columnas) y "Limpiar"
    // siempre en su propia fila a ancho completo, nunca al lado de un input.
    // Desde `lg:`: misma disposición de 6 columnas que ya había (el grupo de
    // fechas ocupa 2 de las 6, igual que las columnas sueltas Desde/Hasta de
    // antes).
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
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

      <div className="lg:col-span-2">
        <Label>Rango de fechas</Label>
        {/* min-w-0: un <input type="date"> nativo tiene un ancho mínimo
            intrínseco (el que necesita para el formato de fecha completo) y
            los hijos de grid tienen min-width:auto por defecto — sin esto,
            el input no se achica dentro de su celda y se monta sobre lo que
            tenga al lado (así se veía "Hasta" solapado con "Limpiar"). */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <Input
              id="f-desde"
              type="date"
              aria-label="Desde"
              value={filtros.desde}
              onChange={(e) => actualizar("desde", e.target.value)}
              className="w-full"
            />
          </div>
          <div className="min-w-0">
            <Input
              id="f-hasta"
              type="date"
              aria-label="Hasta"
              value={filtros.hasta}
              onChange={(e) => actualizar("hasta", e.target.value)}
              className="w-full"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => aplicarAtajoRango("hoy")}
          >
            Hoy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => aplicarAtajoRango("7dias")}
          >
            Últimos 7 días
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => aplicarAtajoRango("mes")}
          >
            Este mes
          </Button>
        </div>
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
