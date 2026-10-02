"use client";

import { CheckCircle2, Pencil, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VistaDatos, type CampoVista } from "@/components/ui/vista-datos";
import {
  ESTADOS_VEHICULO_LEGIBLES,
  MATRICULA_LONGITUD,
  normalizarMatricula,
  TIPOS_PROPIEDAD_LEGIBLES,
} from "@/lib/vehiculos";
import type {
  CrearVehiculoRequest,
  EditarVehiculoRequest,
  TipoPropiedadVehiculo,
  VehiculoDuplicadoResponse,
  VehiculoResponse,
  VehiculoRow,
} from "@/lib/types";

interface VehiculoDialogProps {
  /** null = alta de un vehículo nuevo. Con valor = edición de ese vehículo — el padre pasa
   * `key={vehiculo.id}` (o una key fija para el modo alta) para que el formulario arranque
   * siempre con los valores correctos, mismo criterio que EditarJornadaDialog. */
  vehiculo: VehiculoRow | null;
  onClose: () => void;
  onGuardado: (vehiculo: VehiculoRow) => void;
}

const TIPOS_PROPIEDAD: TipoPropiedadVehiculo[] = ["propio", "alquilado", "autonomo"];

function esRespuestaDuplicado(cuerpo: unknown): cuerpo is VehiculoDuplicadoResponse {
  return (
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "vehiculoExistente" in cuerpo &&
    typeof (cuerpo as { vehiculoExistente: unknown }).vehiculoExistente === "object"
  );
}

export function VehiculoDialog({ vehiculo, onClose, onGuardado }: VehiculoDialogProps) {
  const esEdicion = vehiculo !== null;

  const [matricula, setMatricula] = useState(vehiculo?.matricula ?? "");
  const [tipoPropiedad, setTipoPropiedad] = useState<TipoPropiedadVehiculo | "">(
    vehiculo?.tipo_propiedad ?? ""
  );
  const [capacidadTanque, setCapacidadTanque] = useState(
    vehiculo?.capacidad_tanque_litros != null ? String(vehiculo.capacidad_tanque_litros) : ""
  );
  const [marca, setMarca] = useState(vehiculo?.marca ?? "");
  const [modelo, setModelo] = useState(vehiculo?.modelo ?? "");
  const [anio, setAnio] = useState(vehiculo?.anio != null ? String(vehiculo.anio) : "");

  // spec_modo_ver_editar_chofer_flota.md: mismo criterio que ChoferDialog — alta arranca en
  // "editar" (nada que mostrar en "ver" todavía), un vehículo existente arranca en "ver". El
  // componente remonta con `key={vehiculo.id}` desde la página, así que este estado inicial nunca
  // "se pega" de un vehículo anterior.
  const [modo, setModo] = useState<"ver" | "editar">(esEdicion ? "ver" : "editar");
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  const valoresIniciales = useMemo(
    () => ({
      matricula: vehiculo?.matricula ?? "",
      tipoPropiedad: (vehiculo?.tipo_propiedad ?? "") as TipoPropiedadVehiculo | "",
      capacidadTanque:
        vehiculo?.capacidad_tanque_litros != null ? String(vehiculo.capacidad_tanque_litros) : "",
      marca: vehiculo?.marca ?? "",
      modelo: vehiculo?.modelo ?? "",
      anio: vehiculo?.anio != null ? String(vehiculo.anio) : "",
    }),
    // A propósito solo una vez, ver mismo comentario en ChoferDialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const hayCambiosSinGuardar =
    matricula !== valoresIniciales.matricula ||
    tipoPropiedad !== valoresIniciales.tipoPropiedad ||
    capacidadTanque !== valoresIniciales.capacidadTanque ||
    marca !== valoresIniciales.marca ||
    modelo !== valoresIniciales.modelo ||
    anio !== valoresIniciales.anio;

  function manejarCancelar() {
    if (guardado || !esEdicion) {
      onClose();
      return;
    }
    if (hayCambiosSinGuardar) {
      setConfirmandoDescarte(true);
      return;
    }
    setModo("ver");
  }

  function descartarCambios() {
    setMatricula(valoresIniciales.matricula);
    setTipoPropiedad(valoresIniciales.tipoPropiedad);
    setCapacidadTanque(valoresIniciales.capacidadTanque);
    setMarca(valoresIniciales.marca);
    setModelo(valoresIniciales.modelo);
    setAnio(valoresIniciales.anio);
    setError(null);
    setConfirmandoDescarte(false);
    setModo("ver");
  }

  const [enviando, setEnviando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  // Solo relevante en modo alta: si POST /api/vehiculos devuelve 409 porque la matrícula ya
  // existe DADA DE BAJA, esto guarda ese vehículo para ofrecer reactivarlo en vez de un error
  // muerto (ver "La unicidad vale también para los camiones de baja" en la spec).
  const [duplicado, setDuplicado] = useState<VehiculoDuplicadoResponse | null>(null);

  function construirCampos(): CrearVehiculoRequest | null {
    const matriculaNormalizada = normalizarMatricula(matricula);
    if (!matriculaNormalizada) {
      setError("La matrícula es obligatoria.");
      return null;
    }
    if (matriculaNormalizada.length !== MATRICULA_LONGITUD) {
      setError(`La matrícula debe tener ${MATRICULA_LONGITUD} caracteres.`);
      return null;
    }
    if (!tipoPropiedad) {
      setError("Elegí el tipo de propiedad.");
      return null;
    }
    const campos: CrearVehiculoRequest = { matricula: matriculaNormalizada, tipoPropiedad };
    if (capacidadTanque.trim()) {
      const numero = Number(capacidadTanque);
      if (!Number.isFinite(numero) || numero <= 0) {
        setError("La capacidad de tanque debe ser un número positivo.");
        return null;
      }
      campos.capacidadTanqueLitros = numero;
    }
    if (marca.trim()) campos.marca = marca.trim();
    if (modelo.trim()) campos.modelo = modelo.trim();
    if (anio.trim()) {
      const numero = Number(anio);
      if (!Number.isInteger(numero)) {
        setError("El año debe ser un número entero.");
        return null;
      }
      campos.anio = numero;
    }
    return campos;
  }

  async function onSubmit() {
    setError(null);
    setDuplicado(null);
    const campos = construirCampos();
    if (!campos) return;

    setEnviando(true);
    try {
      const url = esEdicion ? "/api/vehiculos/editar" : "/api/vehiculos";
      const body: CrearVehiculoRequest | EditarVehiculoRequest = esEdicion
        ? { id: vehiculo.id, ...campos }
        : campos;

      const respuesta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        if (respuesta.status === 409 && esRespuestaDuplicado(cuerpo)) {
          setDuplicado(cuerpo);
          setError(cuerpo.mensaje);
        } else {
          const mensaje =
            cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
              ? String((cuerpo as { mensaje: unknown }).mensaje)
              : "No se pudo guardar el vehículo.";
          setError(mensaje);
        }
        return;
      }

      const { vehiculo: guardadoVehiculo } = cuerpo as VehiculoResponse;
      setGuardado(true);
      onGuardado(guardadoVehiculo);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  // Reactivar (desde el error de duplicado en modo alta) y dar de baja/reactivar (desde el
  // vehículo que se está editando) son la misma llamada — solo cambia `estado`. Es una acción
  // propia, atómica, separada de "Guardar": no depende de que el resto del formulario esté
  // completo ni lo pisa.
  async function cambiarEstado(id: string, estado: "activo" | "baja") {
    setError(null);
    setCambiandoEstado(true);
    try {
      const respuesta = await fetch("/api/vehiculos/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        const mensaje =
          cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
            ? String((cuerpo as { mensaje: unknown }).mensaje)
            : "No se pudo cambiar el estado.";
        setError(mensaje);
        return;
      }

      const { vehiculo: actualizado } = cuerpo as VehiculoResponse;
      setDuplicado(null);
      setGuardado(true);
      onGuardado(actualizado);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCambiandoEstado(false);
    }
  }

  const titulo = !esEdicion
    ? "Agregar vehículo"
    : modo === "ver"
      ? "Ver vehículo"
      : "Editar vehículo";

  if (vehiculo && modo === "ver") {
    const campos: CampoVista[] = [
      { etiqueta: "Matrícula", valor: vehiculo.matricula, mono: true },
      { etiqueta: "Tipo de propiedad", valor: TIPOS_PROPIEDAD_LEGIBLES[vehiculo.tipo_propiedad] },
      { etiqueta: "Marca", valor: vehiculo.marca ?? "—" },
      { etiqueta: "Modelo", valor: vehiculo.modelo ?? "—" },
      { etiqueta: "Año", valor: vehiculo.anio != null ? String(vehiculo.anio) : "—", mono: true },
      {
        etiqueta: "Capacidad de tanque",
        valor:
          vehiculo.capacidad_tanque_litros != null ? `${vehiculo.capacidad_tanque_litros} L` : "—",
        mono: true,
      },
    ];

    return (
      <Dialog open onClose={onClose} title={titulo} className="max-w-md">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant={vehiculo.estado === "activo" ? "primary" : "default"}>
              {ESTADOS_VEHICULO_LEGIBLES[vehiculo.estado]}
            </Badge>
          </div>

          <VistaDatos campos={campos} />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                cambiarEstado(vehiculo.id, vehiculo.estado === "activo" ? "baja" : "activo")
              }
              loading={cambiandoEstado}
            >
              <RotateCcw className="h-4 w-4" />
              {vehiculo.estado === "activo" ? "Dar de baja" : "Reactivar"}
            </Button>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button type="button" onClick={() => setModo("editar")}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={titulo} className="max-w-md">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="veh-matricula">Matrícula</Label>
          <Input
            id="veh-matricula"
            value={matricula}
            onChange={(e) => setMatricula(normalizarMatricula(e.target.value))}
            maxLength={MATRICULA_LONGITUD}
            disabled={guardado}
          />
        </div>

        <div>
          <Label htmlFor="veh-tipo-propiedad">Tipo de propiedad</Label>
          <Select
            id="veh-tipo-propiedad"
            value={tipoPropiedad}
            onChange={(e) => setTipoPropiedad(e.target.value as TipoPropiedadVehiculo | "")}
            disabled={guardado}
          >
            <option value="">Elegir…</option>
            {TIPOS_PROPIEDAD.map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPOS_PROPIEDAD_LEGIBLES[tipo]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="veh-marca">Marca</Label>
            <Input
              id="veh-marca"
              placeholder="Opcional"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              disabled={guardado}
            />
          </div>
          <div>
            <Label htmlFor="veh-modelo">Modelo</Label>
            <Input
              id="veh-modelo"
              placeholder="Opcional"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              disabled={guardado}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="veh-anio">Año</Label>
            <Input
              id="veh-anio"
              type="number"
              placeholder="Opcional"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              disabled={guardado}
            />
          </div>
          <div>
            <Label htmlFor="veh-capacidad">Capacidad de tanque (L)</Label>
            <Input
              id="veh-capacidad"
              type="number"
              placeholder="Opcional"
              value={capacidadTanque}
              onChange={(e) => setCapacidadTanque(e.target.value)}
              disabled={guardado}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          La capacidad de tanque es referencia interna de costo (no se factura a clientes) — cargala
          si la tenés a mano, no es obligatoria.
        </p>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {duplicado && duplicado.vehiculoExistente.estado === "baja" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => cambiarEstado(duplicado.vehiculoExistente.id, "activo")}
            loading={cambiandoEstado}
          >
            <RotateCcw className="h-4 w-4" />
            Reactivar {duplicado.vehiculoExistente.matricula}
          </Button>
        )}

        {guardado && (
          <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            {esEdicion ? "Vehículo actualizado." : "Vehículo creado."}
          </p>
        )}

        {confirmandoDescarte ? (
          <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm">¿Descartar los cambios sin guardar?</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmandoDescarte(false)}>
                Seguir editando
              </Button>
              <Button type="button" variant="outline" onClick={descartarCambios}>
                Descartar cambios
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {esEdicion && !guardado && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    cambiarEstado(vehiculo.id, vehiculo.estado === "activo" ? "baja" : "activo")
                  }
                  loading={cambiandoEstado}
                >
                  <RotateCcw className="h-4 w-4" />
                  {vehiculo.estado === "activo" ? "Dar de baja" : "Reactivar"}
                </Button>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={manejarCancelar}>
                {guardado ? "Cerrar" : "Cancelar"}
              </Button>
              {!guardado && (
                <Button type="button" onClick={onSubmit} loading={enviando}>
                  <Save className="h-4 w-4" />
                  Guardar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
