"use client";

import { Check, Copy, KeyRound, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { numeroEmpleadoAEmail, SEXOS } from "@/lib/choferes";
import type {
  ChoferDuplicadoResponse,
  ChoferRow,
  CrearChoferResponse,
  EditarChoferResponse,
  ResetearContrasenaResponse,
  SexoChofer,
} from "@/lib/types";

interface ChoferDialogProps {
  /** null = alta de un chofer nuevo. Con valor = edición — el padre pasa `key={chofer.id}` (o
   * una key fija en modo alta) para que el formulario arranque siempre con los valores
   * correctos, mismo criterio que VehiculoDialog. */
  chofer: ChoferRow | null;
  onClose: () => void;
  onGuardado: (chofer: ChoferRow) => void;
}

function esRespuestaDuplicado(cuerpo: unknown): cuerpo is ChoferDuplicadoResponse {
  return (
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    "choferExistente" in cuerpo &&
    typeof (cuerpo as { choferExistente: unknown }).choferExistente === "object"
  );
}

function mensajeDeError(cuerpo: unknown, fallback: string): string {
  return cuerpo && typeof cuerpo === "object" && "mensaje" in cuerpo
    ? String((cuerpo as { mensaje: unknown }).mensaje)
    : fallback;
}

/** Tarjeta de contraseña temporal — se muestra UNA sola vez (al crear o al resetear), con copiar
 * al portapapeles y una advertencia explícita de que no se vuelve a poder consultar. Mismo
 * criterio en los dos usos: no queda guardada en ningún lado después de esto. */
function ContrasenaTemporal({
  numeroEmpleadoLogin,
  contrasena,
}: {
  numeroEmpleadoLogin: string;
  contrasena: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(contrasena);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la contraseña sigue visible en pantalla para copiarla a
      // mano — no hace falta manejar el error más que eso.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
      <p className="font-medium">
        Usuario: <span className="font-mono">{numeroEmpleadoLogin}</span>
      </p>
      <div className="flex items-center gap-2">
        <p className="font-mono text-base">{contrasena}</p>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={copiar}
          aria-label="Copiar contraseña"
        >
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Esto no se vuelve a mostrar — anotalo o dictaselo al chofer ahora. Va a tener que cambiarla
        en su primer ingreso.
      </p>
    </div>
  );
}

export function ChoferDialog({ chofer, onClose, onGuardado }: ChoferDialogProps) {
  const esEdicion = chofer !== null;

  const [numeroEmpleado, setNumeroEmpleado] = useState(chofer?.numero_empleado ?? "");
  const [nombre, setNombre] = useState(chofer?.nombre ?? "");
  const [apellidos, setApellidos] = useState(chofer?.apellidos ?? "");
  const [dni, setDni] = useState(chofer?.dni ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(chofer?.fecha_nacimiento ?? "");
  const [paisNacimiento, setPaisNacimiento] = useState(chofer?.pais_nacimiento ?? "");
  const [sexo, setSexo] = useState<SexoChofer | "">(chofer?.sexo ?? "");

  const [enviando, setEnviando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [reseteando, setReseteando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [choferGuardado, setChoferGuardado] = useState<ChoferRow | null>(null);
  const [contrasenaTemporal, setContrasenaTemporal] = useState<string | null>(null);
  // Solo relevante en modo alta: si POST /api/choferes devuelve 409, esto guarda el chofer
  // existente para que el mensaje sea legible (quién es, si está activo) en vez de un error de
  // base de datos genérico.
  const [duplicado, setDuplicado] = useState<ChoferDuplicadoResponse | null>(null);

  async function onSubmit() {
    setError(null);
    setDuplicado(null);

    if (!esEdicion) {
      if (!numeroEmpleado.trim()) return setError("Falta el número de empleado.");
    }
    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!apellidos.trim()) return setError("Faltan los apellidos.");
    if (!dni.trim()) return setError("Falta el DNI.");
    if (!fechaNacimiento) return setError("Falta la fecha de nacimiento.");
    if (!paisNacimiento.trim()) return setError("Falta el país de nacimiento.");
    if (!sexo) return setError("Elegí el sexo.");

    setEnviando(true);
    try {
      const url = esEdicion ? "/api/choferes/editar" : "/api/choferes";
      const camposComunes = {
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        dni: dni.trim().toUpperCase(),
        fechaNacimiento,
        paisNacimiento: paisNacimiento.trim(),
        sexo,
      };
      const body = esEdicion
        ? { id: chofer.id, ...camposComunes }
        : { numeroEmpleado: numeroEmpleado.trim(), ...camposComunes };

      const respuesta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        if (respuesta.status === 409 && esRespuestaDuplicado(cuerpo)) {
          setDuplicado(cuerpo);
        }
        setError(mensajeDeError(cuerpo, "No se pudo guardar el chofer."));
        return;
      }

      if (esEdicion) {
        const { chofer: actualizado } = cuerpo as EditarChoferResponse;
        setGuardado(true);
        setChoferGuardado(actualizado);
        onGuardado(actualizado);
      } else {
        const { chofer: creado, contrasenaTemporal: nuevaContrasena } =
          cuerpo as CrearChoferResponse;
        setGuardado(true);
        setChoferGuardado(creado);
        setContrasenaTemporal(nuevaContrasena);
        onGuardado(creado);
      }
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarActivo() {
    if (!chofer) return;
    setError(null);
    setCambiandoEstado(true);
    try {
      const respuesta = await fetch("/api/choferes/editar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chofer.id, activo: !chofer.activo }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo cambiar el estado."));
        return;
      }
      const { chofer: actualizado } = cuerpo as EditarChoferResponse;
      setGuardado(true);
      setChoferGuardado(actualizado);
      onGuardado(actualizado);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function resetearContrasena() {
    if (!chofer) return;
    setError(null);
    setReseteando(true);
    try {
      const respuesta = await fetch("/api/choferes/resetear-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chofer.id }),
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setError(mensajeDeError(cuerpo, "No se pudo resetear la contraseña."));
        return;
      }
      const { contrasenaTemporal: nuevaContrasena } = cuerpo as ResetearContrasenaResponse;
      setContrasenaTemporal(nuevaContrasena);
      setGuardado(true);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setReseteando(false);
    }
  }

  const deshabilitarCampos = guardado;
  const estadoActual = choferGuardado?.activo ?? chofer?.activo ?? true;

  return (
    <Dialog
      open
      onClose={onClose}
      title={esEdicion ? "Editar chofer" : "Agregar chofer"}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="chf-numero">Número de empleado</Label>
          <Input
            id="chf-numero"
            value={numeroEmpleado}
            onChange={(e) => setNumeroEmpleado(e.target.value)}
            disabled={esEdicion || deshabilitarCampos}
            placeholder="Ej. 04"
          />
          {/* ⚠️ La pieza más importante de esta spec: mostrar el identificador EXACTO con el que
              el chofer va a entrar, antes del paso irreversible — así un cero a la izquierda
              (el chofer 04) se ve en pantalla en vez de descubrirse cuando alguien no puede
              entrar (mismo criterio que el contador del Hallazgo #21). */}
          {!esEdicion && numeroEmpleado.trim() && (
            <p className="mt-1 text-xs text-muted-foreground">
              El chofer va a entrar con el número:{" "}
              <span className="font-mono font-medium text-foreground">{numeroEmpleado.trim()}</span>
              {" · "}usuario interno:{" "}
              <span className="font-mono">{numeroEmpleadoAEmail(numeroEmpleado.trim())}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chf-nombre">Nombre</Label>
            <Input
              id="chf-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
          <div>
            <Label htmlFor="chf-apellidos">Apellidos</Label>
            <Input
              id="chf-apellidos"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chf-dni">DNI</Label>
            <Input
              id="chf-dni"
              value={dni}
              onChange={(e) => setDni(e.target.value.toUpperCase())}
              disabled={deshabilitarCampos}
            />
          </div>
          <div>
            <Label htmlFor="chf-sexo">Sexo</Label>
            <Select
              id="chf-sexo"
              value={sexo}
              onChange={(e) => setSexo(e.target.value as SexoChofer | "")}
              disabled={deshabilitarCampos}
            >
              <option value="">Elegir…</option>
              {SEXOS.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="chf-fecha-nacimiento">Fecha de nacimiento</Label>
            <Input
              id="chf-fecha-nacimiento"
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
          <div>
            <Label htmlFor="chf-pais">País de nacimiento</Label>
            <Input
              id="chf-pais"
              value={paisNacimiento}
              onChange={(e) => setPaisNacimiento(e.target.value)}
              disabled={deshabilitarCampos}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {duplicado && <p className="text-sm text-muted-foreground">{duplicado.mensaje}</p>}

        {contrasenaTemporal && (
          <ContrasenaTemporal
            numeroEmpleadoLogin={
              choferGuardado?.numero_empleado ?? chofer?.numero_empleado ?? numeroEmpleado
            }
            contrasena={contrasenaTemporal}
          />
        )}

        {guardado && !contrasenaTemporal && (
          <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            {esEdicion ? "Chofer actualizado." : "Chofer creado."}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {esEdicion && !contrasenaTemporal && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={alternarActivo}
                  loading={cambiandoEstado}
                >
                  <RotateCcw className="h-4 w-4" />
                  {estadoActual ? "Dar de baja" : "Reactivar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetearContrasena}
                  loading={reseteando}
                >
                  <KeyRound className="h-4 w-4" />
                  Resetear contraseña
                </Button>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {guardado ? "Cerrar" : "Cancelar"}
            </Button>
            {!guardado && (
              <Button type="button" onClick={onSubmit} loading={enviando}>
                <Save className="h-4 w-4" />
                {esEdicion ? "Guardar" : "Crear chofer"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
