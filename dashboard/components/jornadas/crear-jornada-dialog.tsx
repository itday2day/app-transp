"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ChoferDialog } from "@/components/choferes/chofer-dialog";
import { VehiculoDialog } from "@/components/flota/vehiculo-dialog";
import { useChoferes } from "@/lib/hooks/use-choferes";
import { useVehiculos } from "@/lib/hooks/use-vehiculos";
import { instanteEnEspanaComoUtc } from "@/lib/hora-espana";
import type {
  ChoferRow,
  CrearJornadaRequest,
  CrearJornadaResponse,
  JornadaRow,
  TipoIncidencia,
  VehiculoRow,
} from "@/lib/types";

// Mismas 4 opciones que ya usa editar-jornada-dialog.tsx / IncidenciasForm.tsx en la app móvil —
// no inventar valores nuevos que después no coincidan con lo ya guardado.
const TIPOS_INCIDENCIA: TipoIncidencia[] = [
  "Avería vehículo",
  "Tráfico/Retraso",
  "Cliente ausente",
  "Otro",
];

function formatearHoraMientrasEscribe(valorCrudo: string): string {
  const digitos = valorCrudo.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

const HORA_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function fechaHoraActualEspana(): { fecha: string; hora: string } {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ahora);
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    fecha: `${obtener("year")}-${obtener("month")}-${obtener("day")}`,
    hora: `${obtener("hour")}:${obtener("minute")}`,
  };
}

interface CrearJornadaDialogProps {
  onClose: () => void;
  onCreada: (jornada: JornadaRow) => void;
}

/**
 * Diálogo del botón "+" en /jornadas (spec_rutas_asignadas_admin.md): Administración carga una
 * jornada sin que el chofer haya pasado por el check-in del celular -- planificación a futuro
 * (queda abierta) o aviso tardío de una entrega ya hecha (se completa también el cierre y nace
 * cerrada). Nunca pide foto de tacómetro ni GPS reales -- Administración no los tiene.
 *
 * Los atajos de alta de chofer/vehículo reusan ChoferDialog/VehiculoDialog TAL CUAL (Fase 1 punto
 * 4: ya están armados con la forma exacta que hace falta, {onClose, onGuardado}) -- nada
 * duplicado ni reducido, el mismo flujo completo con usuario y contraseña temporal que ya usa
 * /choferes.
 */
export function CrearJornadaDialog({ onClose, onCreada }: CrearJornadaDialogProps) {
  const queryClient = useQueryClient();
  const { data: choferesResp } = useChoferes();
  const { data: vehiculosResp } = useVehiculos();
  const choferesActivos = useMemo(
    () => (choferesResp?.data ?? []).filter((c) => c.activo),
    [choferesResp]
  );
  const vehiculosActivos = useMemo(
    () => (vehiculosResp?.data ?? []).filter((v) => v.estado === "activo"),
    [vehiculosResp]
  );

  const [choferId, setChoferId] = useState("");
  const [vehiculoId, setVehiculoId] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [ruta, setRuta] = useState("");
  const [kmInicial, setKmInicial] = useState("");
  const [combustibleInicial, setCombustibleInicial] = useState("");
  const inicioEspana = useMemo(() => fechaHoraActualEspana(), []);
  const [checkInFecha, setCheckInFecha] = useState(inicioEspana.fecha);
  const [checkInHora, setCheckInHora] = useState(inicioEspana.hora);

  const [cargarCierre, setCargarCierre] = useState(false);
  const [kmFinal, setKmFinal] = useState("");
  const [combustibleFinal, setCombustibleFinal] = useState("");
  const [checkOutFecha, setCheckOutFecha] = useState(inicioEspana.fecha);
  const [checkOutHora, setCheckOutHora] = useState(inicioEspana.hora);
  const [tuvoIncidencia, setTuvoIncidencia] = useState(false);
  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidencia | "">("");
  const [detalleIncidencia, setDetalleIncidencia] = useState("");

  const [altaChoferAbierta, setAltaChoferAbierta] = useState(false);
  const [altaVehiculoAbierta, setAltaVehiculoAbierta] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detalleIncidenciaFaltante =
    cargarCierre && tuvoIncidencia && tipoIncidencia === "Otro" && !detalleIncidencia.trim();

  const formularioValido =
    choferId !== "" &&
    vehiculoId !== "" &&
    empresa.trim() !== "" &&
    ruta.trim() !== "" &&
    kmInicial.trim() !== "" &&
    combustibleInicial.trim() !== "" &&
    (!cargarCierre || (kmFinal.trim() !== "" && combustibleFinal.trim() !== "")) &&
    !detalleIncidenciaFaltante;

  async function manejarGuardar() {
    if (!formularioValido) return;
    const vehiculo = vehiculosActivos.find((v) => v.id === vehiculoId);
    if (!vehiculo) return;

    setError(null);

    const cuerpo: CrearJornadaRequest = {
      choferId,
      empresa: empresa.trim(),
      matricula: vehiculo.matricula,
      ruta: ruta.trim(),
      kmInicial: Number(kmInicial),
      combustibleInicial: Number(combustibleInicial),
      fechaCheckIn:
        checkInFecha && HORA_24H_REGEX.test(checkInHora)
          ? instanteEnEspanaComoUtc(checkInFecha, checkInHora)
          : undefined,
    };
    if (cargarCierre) {
      cuerpo.kmFinal = Number(kmFinal);
      cuerpo.combustibleFinal = Number(combustibleFinal);
      if (checkOutFecha && HORA_24H_REGEX.test(checkOutHora)) {
        cuerpo.fechaCheckOut = instanteEnEspanaComoUtc(checkOutFecha, checkOutHora);
      }
      cuerpo.tuvoIncidencia = tuvoIncidencia;
      if (tuvoIncidencia) {
        cuerpo.tipoIncidencia = tipoIncidencia || null;
        cuerpo.detalleIncidencia = detalleIncidencia.trim();
      }
    }

    setEnviando(true);
    try {
      const respuesta = await fetch("/api/jornadas/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = (await respuesta.json().catch(() => null)) as CrearJornadaResponse | null;

      if (!respuesta.ok || !datos) {
        setError(datos?.mensaje ?? "No se pudo crear la jornada.");
        return;
      }
      onCreada(datos.jornada);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Dialog open onClose={onClose} title="Cargar jornada" className="max-w-lg">
        <div className="flex flex-col gap-4">
          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div>
            <Label htmlFor="crear-chofer">Chofer</Label>
            <div className="flex gap-2">
              <Select
                id="crear-chofer"
                className="flex-1"
                value={choferId}
                onChange={(e) => setChoferId(e.target.value)}
              >
                <option value="">Elegir chofer…</option>
                {choferesActivos.map((c: ChoferRow) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellidos} ({c.numero_empleado})
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" onClick={() => setAltaChoferAbierta(true)}>
                + Nuevo
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="crear-vehiculo">Camión</Label>
            <div className="flex gap-2">
              <Select
                id="crear-vehiculo"
                className="flex-1"
                value={vehiculoId}
                onChange={(e) => setVehiculoId(e.target.value)}
              >
                <option value="">Elegir camión…</option>
                {vehiculosActivos.map((v: VehiculoRow) => (
                  <option key={v.id} value={v.id}>
                    {v.matricula}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" onClick={() => setAltaVehiculoAbierta(true)}>
                + Nuevo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="crear-empresa">Empresa</Label>
              <Input
                id="crear-empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="crear-ruta">Ruta</Label>
              <Input id="crear-ruta" value={ruta} onChange={(e) => setRuta(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="crear-km-inicial">Km inicial</Label>
              <Input
                id="crear-km-inicial"
                type="number"
                value={kmInicial}
                onChange={(e) => setKmInicial(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="crear-combustible-inicial">Combustible inicial (%)</Label>
              <Input
                id="crear-combustible-inicial"
                type="number"
                min={0}
                max={100}
                value={combustibleInicial}
                onChange={(e) => setCombustibleInicial(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="crear-checkin-fecha">Hora de check-in</Label>
            <div className="flex gap-2">
              <Input
                id="crear-checkin-fecha"
                type="date"
                className="flex-1"
                value={checkInFecha}
                onChange={(e) => setCheckInFecha(e.target.value)}
              />
              <Input
                id="crear-checkin-hora"
                type="text"
                inputMode="numeric"
                placeholder="HH:mm"
                className="w-24"
                value={checkInHora}
                onChange={(e) => setCheckInHora(formatearHoraMientrasEscribe(e.target.value))}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Formato 24 horas (ej. 14:30).</p>
          </div>

          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={cargarCierre}
                onChange={(e) => setCargarCierre(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              La ruta ya se completó -- cargar también el cierre
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Sin marcar, la jornada queda abierta para que el chofer la complete desde su app.
            </p>

            {cargarCierre && (
              <div className="mt-3 flex flex-col gap-3 rounded-md border border-border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="crear-km-final">Km final</Label>
                    <Input
                      id="crear-km-final"
                      type="number"
                      value={kmFinal}
                      onChange={(e) => setKmFinal(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="crear-combustible-final">Combustible final (%)</Label>
                    <Input
                      id="crear-combustible-final"
                      type="number"
                      min={0}
                      max={100}
                      value={combustibleFinal}
                      onChange={(e) => setCombustibleFinal(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="crear-checkout-fecha">Hora de check-out</Label>
                  <div className="flex gap-2">
                    <Input
                      id="crear-checkout-fecha"
                      type="date"
                      className="flex-1"
                      value={checkOutFecha}
                      onChange={(e) => setCheckOutFecha(e.target.value)}
                    />
                    <Input
                      id="crear-checkout-hora"
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:mm"
                      className="w-24"
                      value={checkOutHora}
                      onChange={(e) =>
                        setCheckOutHora(formatearHoraMientrasEscribe(e.target.value))
                      }
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tuvoIncidencia}
                    onChange={(e) => setTuvoIncidencia(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Hubo incidencia
                </label>

                {tuvoIncidencia && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="crear-tipo-incidencia">Tipo de incidencia</Label>
                      <Select
                        id="crear-tipo-incidencia"
                        value={tipoIncidencia}
                        onChange={(e) => setTipoIncidencia(e.target.value as TipoIncidencia | "")}
                      >
                        <option value="">Sin especificar</option>
                        {TIPOS_INCIDENCIA.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {tipo}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="crear-detalle-incidencia">
                        Detalle {tipoIncidencia === "Otro" ? "" : "(opcional)"}
                      </Label>
                      <textarea
                        id="crear-detalle-incidencia"
                        rows={3}
                        value={detalleIncidencia}
                        onChange={(e) => setDetalleIncidencia(e.target.value)}
                        className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                      />
                      {detalleIncidenciaFaltante && (
                        <p className="mt-1 text-xs text-danger">
                          El detalle es obligatorio cuando el tipo es &quot;Otro&quot;.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="button" onClick={manejarGuardar} disabled={!formularioValido || enviando}>
              {enviando ? "Guardando…" : "Crear jornada"}
            </Button>
          </div>
        </div>
      </Dialog>

      {altaChoferAbierta && (
        <ChoferDialog
          chofer={null}
          onClose={() => setAltaChoferAbierta(false)}
          onGuardado={(chofer) => {
            setAltaChoferAbierta(false);
            queryClient.invalidateQueries({ queryKey: ["choferes"] });
            setChoferId(chofer.id);
          }}
        />
      )}

      {altaVehiculoAbierta && (
        <VehiculoDialog
          vehiculo={null}
          onClose={() => setAltaVehiculoAbierta(false)}
          onGuardado={(vehiculo) => {
            setAltaVehiculoAbierta(false);
            queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
            setVehiculoId(vehiculo.id);
          }}
        />
      )}
    </>
  );
}
