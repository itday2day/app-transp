"use client";

import { Check, Copy, KeyRound, Pencil, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VistaDatos, type CampoVista } from "@/components/ui/vista-datos";
import { SelectorCodigoPais } from "@/components/choferes/selector-codigo-pais";
import {
  normalizarDni,
  normalizarParaComparar,
  numeroEmpleadoAEmail,
  SEXOS,
  TELEFONO_VALIDO_REGEX,
} from "@/lib/choferes";
import { PAISES } from "@/lib/paises";
import { codigoMarcacion, separarTelefono } from "@/lib/telefono-pais";
import { formatFecha } from "@/lib/utils";
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

/** spec_telefono_e164_y_pais_desplegable.md: si el país guardado matchea una opción de PAISES
 * ignorando mayúsculas/acentos (ej. "Espana" sin tilde, dato real de antes de este spec), el
 * desplegable arranca con esa opción preseleccionada — el valor exacto de la lista, no el crudo
 * guardado. Si no matchea ninguna (país mal escrito, inventado, o inexistente en la lista), no
 * preselecciona nada: el desplegable queda vacío y el formulario exige elegir uno real. */
function paisPreseleccionado(paisGuardado: string | undefined): string {
  if (!paisGuardado) return "";
  const normalizado = normalizarParaComparar(paisGuardado);
  return PAISES.find((pais) => normalizarParaComparar(pais) === normalizado) ?? "";
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
  const [paisNacimiento, setPaisNacimiento] = useState(
    paisPreseleccionado(chofer?.pais_nacimiento)
  );
  const [sexo, setSexo] = useState<SexoChofer | "">(chofer?.sexo ?? "");
  // spec_telefono_pais_selector.md: el país arranca en España (o en el que corresponda al
  // teléfono ya guardado, separado por separarTelefono() — coincidencia de prefijo más largo
  // primero) y el número es solo el resto de los dígitos, sin el código de marcación.
  const telefonoSeparado = separarTelefono(chofer?.telefono);
  const [paisTelefono, setPaisTelefono] = useState(telefonoSeparado.pais);
  const [numeroTelefono, setNumeroTelefono] = useState(telefonoSeparado.numero);

  // spec_modo_ver_editar_chofer_flota.md: alta siempre arranca en "editar" (nada que mostrar en
  // "ver" todavía); abrir un chofer existente arranca en "ver". El componente remonta con
  // `key={chofer.id}` desde la página (igual que ya hacía antes de esta spec), así que este
  // estado inicial nunca "se pega" de un chofer anterior.
  const [modo, setModo] = useState<"ver" | "editar">(esEdicion ? "ver" : "editar");
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  // Snapshot de los valores con los que arrancó el formulario — estable mientras el componente
  // esté montado (no depende de nada que cambie), para poder comparar contra los valores actuales
  // sin duplicar la lógica de "¿hay cambios sin guardar?" en cada campo por separado.
  const valoresIniciales = useMemo(
    () => ({
      nombre: chofer?.nombre ?? "",
      apellidos: chofer?.apellidos ?? "",
      dni: chofer?.dni ?? "",
      fechaNacimiento: chofer?.fecha_nacimiento ?? "",
      paisNacimiento: paisPreseleccionado(chofer?.pais_nacimiento),
      sexo: (chofer?.sexo ?? "") as SexoChofer | "",
      paisTelefono: telefonoSeparado.pais,
      numeroTelefono: telefonoSeparado.numero,
    }),
    // A propósito solo una vez: el componente remonta entero (key={chofer.id}) cuando cambia de
    // chofer, nunca actualiza estos valores "iniciales" en el medio de una edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const hayCambiosSinGuardar =
    nombre !== valoresIniciales.nombre ||
    apellidos !== valoresIniciales.apellidos ||
    dni !== valoresIniciales.dni ||
    fechaNacimiento !== valoresIniciales.fechaNacimiento ||
    paisNacimiento !== valoresIniciales.paisNacimiento ||
    sexo !== valoresIniciales.sexo ||
    paisTelefono !== valoresIniciales.paisTelefono ||
    numeroTelefono !== valoresIniciales.numeroTelefono;

  function manejarCancelar() {
    // El botón ya pasó a ser "Cerrar" (no "Cancelar") en el estado congelado post-guardado — no
    // hay nada que descartar, es el mismo "Cerrar" de siempre. Igual el alta: no tiene modo "ver"
    // a dónde volver, cancelar ahí sigue cerrando el diálogo tal cual ya hacía antes de esta spec.
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
    setNombre(valoresIniciales.nombre);
    setApellidos(valoresIniciales.apellidos);
    setDni(valoresIniciales.dni);
    setFechaNacimiento(valoresIniciales.fechaNacimiento);
    setPaisNacimiento(valoresIniciales.paisNacimiento);
    setSexo(valoresIniciales.sexo);
    setPaisTelefono(valoresIniciales.paisTelefono);
    setNumeroTelefono(valoresIniciales.numeroTelefono);
    setError(null);
    setConfirmandoDescarte(false);
    setModo("ver");
  }

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
    // Obligatorio solo al crear — un chofer ya cargado sin teléfono se tiene que poder seguir
    // editando sin exigírselo retroactivo (spec_normalizacion_dni_matricula_telefono.md).
    if (!esEdicion && !numeroTelefono.trim()) return setError("Falta el teléfono.");
    // El FORMATO, en cambio, se exige siempre que haya algo tipeado — en alta y en edición
    // (spec_telefono_e164_y_pais_desplegable.md, a diferencia de la obligatoriedad de arriba).
    // Se arma acá, no en el input: el selector de país ya garantiza el "+" + código correctos,
    // el campo numérico ya solo deja tipear dígitos — esto solo concatena los dos.
    const telefono = numeroTelefono.trim()
      ? `+${codigoMarcacion(paisTelefono)}${numeroTelefono.trim()}`
      : null;
    if (telefono && !TELEFONO_VALIDO_REGEX.test(telefono)) {
      return setError("El teléfono debe tener formato internacional, por ejemplo +34612345678.");
    }

    setEnviando(true);
    try {
      const url = esEdicion ? "/api/choferes/editar" : "/api/choferes";
      const camposComunes = {
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        dni: normalizarDni(dni),
        fechaNacimiento,
        paisNacimiento: paisNacimiento.trim(),
        sexo,
        telefono,
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

  const titulo = !esEdicion ? "Agregar chofer" : modo === "ver" ? "Ver chofer" : "Editar chofer";

  if (chofer && modo === "ver") {
    const campos: CampoVista[] = [
      { etiqueta: "Número de empleado", valor: chofer.numero_empleado, mono: true },
      { etiqueta: "Nombre", valor: chofer.nombre },
      { etiqueta: "Apellidos", valor: chofer.apellidos },
      { etiqueta: "DNI", valor: chofer.dni, mono: true },
      { etiqueta: "Fecha de nacimiento", valor: formatFecha(chofer.fecha_nacimiento), mono: true },
      { etiqueta: "País de nacimiento", valor: chofer.pais_nacimiento },
      { etiqueta: "Sexo", valor: chofer.sexo },
      { etiqueta: "Teléfono", valor: chofer.telefono ?? "—", mono: true },
    ];

    return (
      <Dialog open onClose={onClose} title={titulo} className="max-w-lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant={estadoActual ? "primary" : "default"}>
              {estadoActual ? "Activo" : "De baja"}
            </Badge>
          </div>

          <VistaDatos campos={campos} />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {/* Hallazgo #44: antes de este fix, resetearContrasena() ya guardaba la temporal en
              estado (setContrasenaTemporal) pero este return de "Ver" nunca la dibujaba — la
              contraseña del chofer se cambiaba igual (la API no tiene culpa) y el secreto se
              perdía sin que nadie lo viera. Mismo componente y mismo numeroEmpleadoLogin que usa
              el modo "Editar" (línea ~552), no una tarjeta nueva. */}
          {contrasenaTemporal && (
            <ContrasenaTemporal
              numeroEmpleadoLogin={choferGuardado?.numero_empleado ?? chofer.numero_empleado}
              contrasena={contrasenaTemporal}
            />
          )}

          {contrasenaTemporal ? (
            // Mismo criterio que "Editar": con la temporal a la vista, nada de Resetear/Dar de
            // baja/Editar — así no se puede perder el secreto pulsando "Resetear" dos veces.
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
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
              </div>

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
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={titulo} className="max-w-lg">
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
              onChange={(e) => setDni(normalizarDni(e.target.value))}
              maxLength={9}
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
            <Select
              id="chf-pais"
              value={paisNacimiento}
              onChange={(e) => setPaisNacimiento(e.target.value)}
              disabled={deshabilitarCampos}
            >
              <option value="">Elegir…</option>
              {PAISES.map((pais) => (
                <option key={pais} value={pais}>
                  {pais}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="chf-telefono-numero">Teléfono{esEdicion ? " (opcional)" : ""}</Label>
          {/* spec_telefono_pais_selector.md: el "+" + código de marcación ya no se tipean — los
              da el selector de país, elegido por nombre (filtrable), mostrado como ISO alpha-2 +
              código. El campo numérico solo acepta dígitos; se concatenan los dos recién al
              guardar (ver onSubmit). maxLength dinámico: E.164 admite hasta 15 dígitos en total
              después del "+", de los que el código de marcación ya ocupa los suyos. */}
          <div className="flex gap-2">
            <SelectorCodigoPais
              value={paisTelefono}
              onChange={setPaisTelefono}
              disabled={deshabilitarCampos}
            />
            <Input
              id="chf-telefono-numero"
              value={numeroTelefono}
              onChange={(e) => setNumeroTelefono(e.target.value.replace(/\D/g, ""))}
              maxLength={15 - codigoMarcacion(paisTelefono).length}
              placeholder="612345678"
              className="flex-1"
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
              <Button type="button" variant="outline" onClick={manejarCancelar}>
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
        )}
      </div>
    </Dialog>
  );
}
